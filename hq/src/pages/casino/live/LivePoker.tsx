import { useEffect, useRef, useState } from 'react';
import { useDoc } from '../../../hooks/useCollection';
import { useHub } from '../../../hooks/useHub';
import { chipsFmt, deck, stake, type Card } from '../../../lib/casino';
import { sfx } from '../../../lib/sound';
import { act, dealHand, setRound, type LiveTable } from '../../../lib/tables';
import { Felt, PlayingCard, Result, useChips } from '../common';
import { beats, judge } from '../VideoPoker';
import { now, useHostLoop, useSettle } from './useLive';

export interface PokerRound {
  n: number;
  phase: 'idle' | 'wait' | 'ante' | 'bet1' | 'draw' | 'bet2' | 'paid';
  closesAt?: number;
  inHand?: string[];
  folded?: Record<string, boolean>;
  pot?: number;
  /** The bet everyone has to match this betting round. */
  cur?: number;
  rput?: Record<string, number>;
  put?: Record<string, number>;
  raises?: number;
  turn?: string | null;
  turnEnds?: number;
  acted?: Record<string, boolean>;
  drew?: Record<string, number>;
  size?: number;
  reveal?: Record<string, Card[]>;
  labels?: Record<string, string>;
  winners?: string[];
  paid?: Record<string, number>;
  paidAt?: number;
  last?: string;
}
const TURN = 30_000;

export default function LivePoker({ t, isHost }: { t: LiveTable<PokerRound>; isHost: boolean }) {
  const { me } = useHub();
  const { balance } = useChips();
  const d = useRef<{ n: number; deck: Card[]; hands: Record<string, Card[]>; seen: Record<string, number> }>({ n: -1, deck: [], hands: {}, seen: {} });
  const [discard, setDiscard] = useState<number[]>([]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);

  async function step(tb: LiveTable<PokerRound>) {
    const r = tb.round;
    const time = now();
    const seated = Object.keys(tb.seats);
    const mid = ['bet1', 'draw', 'bet2'].includes(r.phase);
    if (mid && d.current.n !== r.n) {
      // A new dealer took over mid-hand without the deck: everyone gets back what they put in.
      return setRound(tb.id, { ...r, phase: 'paid', paid: { ...(r.put ?? {}) }, paidAt: time, turn: null, last: 'Hand called off: the dealer changed.' });
    }
    if (r.phase === 'idle' || r.phase === 'wait' || (r.phase === 'paid' && time > (r.paidAt ?? 0) + 10_000)) {
      if (seated.length < 2) return r.phase === 'wait' ? undefined : setRound(tb.id, { n: r.n, phase: 'wait' });
      return setRound(tb.id, { n: r.n + 1, phase: 'ante', closesAt: time + 15_000 });
    }
    const fresh = (id: string) => {
      const a = tb.actions[id];
      if (!a || a.n !== r.n || a.k <= (d.current.seen[id] ?? 0)) return null;
      return a;
    };
    if (r.phase === 'ante') {
      const anted = seated.filter((id) => tb.actions[id]?.n === r.n && tb.actions[id]!.a === 'ante');
      if (anted.length < seated.length && time < (r.closesAt ?? 0)) return;
      const put = Object.fromEntries(anted.map((id) => [id, tb.minBet]));
      if (anted.length < 2) return setRound(tb.id, { ...r, phase: 'paid', inHand: anted, put, paid: put, paidAt: time, last: 'Not enough players anted.' });
      d.current = { n: r.n, deck: deck(), hands: {}, seen: Object.fromEntries(anted.map((id) => [id, tb.actions[id]!.k])) };
      for (const id of anted) d.current.hands[id] = d.current.deck.splice(0, 5);
      await Promise.all(anted.map((id) => dealHand(tb.id, id, d.current.hands[id]!, r.n)));
      return setRound(tb.id, { ...r, phase: 'bet1', inHand: anted, folded: {}, pot: anted.length * tb.minBet, put, rput: {}, cur: 0, raises: 0, acted: {}, size: tb.minBet * 2, turn: anted[0], turnEnds: time + TURN, last: 'Cards are out.' });
    }
    const alive = (r.inHand ?? []).filter((id) => !r.folded?.[id]);
    if (r.phase === 'bet1' || r.phase === 'bet2') {
      const id = r.turn!;
      const a = fresh(id);
      if (!a && time < (r.turnEnds ?? 0)) return;
      if (a) d.current.seen[id] = a.k;
      const rput = { ...(r.rput ?? {}) };
      const put = { ...(r.put ?? {}) };
      const folded = { ...(r.folded ?? {}) };
      let acted = { ...(r.acted ?? {}) };
      let { cur = 0, pot = 0, raises = 0 } = r;
      const toCall = cur - (rput[id] ?? 0);
      const move = a?.a ?? (toCall === 0 ? 'check' : 'fold');
      const pay = (amt: number) => ((rput[id] = (rput[id] ?? 0) + amt), (put[id] = (put[id] ?? 0) + amt), (pot += amt));
      let last = '';
      const name = tb.seats[id]?.name ?? 'Someone';
      if (move === 'fold') (folded[id] = true), (last = `${name} folds.`);
      else if (move === 'call' && toCall > 0) pay(a?.amt ?? toCall), (last = `${name} calls.`);
      else if (move === 'bet' && cur === 0) pay(a?.amt ?? r.size!), (cur = rput[id]!), (acted = {}), (last = `${name} bets ${chipsFmt(cur)}.`);
      else if (move === 'raise' && cur > 0 && raises < 3) pay(a?.amt ?? cur + r.size! - (rput[id] ?? 0)), (cur = rput[id]!), raises++, (acted = {}), (last = `${name} raises to ${chipsFmt(cur)}.`);
      else last = `${name} checks.`;
      acted[id] = true;
      const left = (r.inHand ?? []).filter((x) => !folded[x]);
      if (left.length === 1) return setRound(tb.id, { ...r, rput, put, folded, pot, phase: 'paid', winners: left, paid: { [left[0]!]: pot }, paidAt: time, turn: null, last: `${last} ${tb.seats[left[0]!]?.name} takes the pot.` });
      const settled = left.every((x) => acted[x] && (rput[x] ?? 0) === cur);
      if (settled && r.phase === 'bet1') return setRound(tb.id, { ...r, rput: {}, put, folded, pot, cur: 0, raises: 0, acted: {}, phase: 'draw', closesAt: time + 25_000, drew: {}, turn: null, last: `${last} Time to draw.` });
      if (settled) return showdown(tb, { ...r, rput, put, folded, pot, cur, last });
      const order = r.inHand ?? [];
      let next = id;
      for (let i = 1; i <= order.length; i++) {
        const c = order[(order.indexOf(id) + i) % order.length]!;
        if (!folded[c]) {
          next = c;
          break;
        }
      }
      return setRound(tb.id, { ...r, rput, put, folded, pot, cur, raises, acted, turn: next, turnEnds: time + TURN, last });
    }
    if (r.phase === 'draw') {
      const want = Object.fromEntries(alive.map((id) => [id, fresh(id)]).filter(([, a]) => a && (a as { a: string }).a === 'draw')) as Record<string, { idx?: number[]; k: number }>;
      if (Object.keys(want).length < alive.length && time < (r.closesAt ?? 0)) return;
      const drew: Record<string, number> = {};
      for (const id of alive) {
        const w = want[id];
        if (w) d.current.seen[id] = w.k;
        const idx = (w?.idx ?? []).filter((i) => i >= 0 && i < 5).slice(0, 4);
        d.current.hands[id] = d.current.hands[id]!.map((c, i) => (idx.includes(i) ? d.current.deck.shift()! : c));
        drew[id] = idx.length;
      }
      await Promise.all(alive.map((id) => dealHand(tb.id, id, d.current.hands[id]!, r.n)));
      return setRound(tb.id, { ...r, phase: 'bet2', drew, rput: {}, cur: 0, raises: 0, acted: {}, turn: alive[0], turnEnds: time + TURN, last: 'Second round of betting.' });
    }
  }
  function showdown(tb: LiveTable<PokerRound>, r: PokerRound) {
    const alive = (r.inHand ?? []).filter((id) => !r.folded?.[id]);
    const judged = alive.map((id) => ({ id, j: judge(d.current.hands[id]!) }));
    const best = judged.reduce((b, x) => (beats(x.j.key, b.j.key) > 0 ? x : b));
    const winners = judged.filter((x) => beats(x.j.key, best.j.key) === 0).map((x) => x.id);
    const share = Math.floor((r.pot ?? 0) / winners.length);
    const paid: Record<string, number> = Object.fromEntries(winners.map((id, i) => [id, share + (i === 0 ? (r.pot ?? 0) - share * winners.length : 0)]));
    return setRound(tb.id, {
      ...r,
      phase: 'paid',
      reveal: Object.fromEntries(alive.map((id) => [id, d.current.hands[id]!])),
      labels: Object.fromEntries(judged.map((x) => [x.id, x.j.label])),
      winners,
      paid,
      paidAt: now(),
      turn: null,
      last: `${winners.map((id) => tb.seats[id]?.name).join(' & ')} ${winners.length > 1 ? 'split' : 'wins'} with ${best.j.label}.`,
    });
  }

  useHostLoop(t, isHost, step);
  const r = t.round;
  const hand = useDoc<{ cards: Card[]; n: number }>(`casinoTables/${t.id}/hands/${me.id}`);
  const myCards = hand && hand.n === r.n ? hand.cards : null;
  const inHand = (r.inHand ?? []).includes(me.id);
  useEffect(() => setDiscard([]), [r.n, r.phase]);
  useSettle(
    t,
    (x) => ((x.round.inHand ?? []).includes(me.id) ? (x.round.put?.[me.id] ?? 0) : null),
    (x) => x.round.paid?.[me.id] ?? 0,
  );
  const toCall = (r.cur ?? 0) - (r.rput?.[me.id] ?? 0);
  const myTurn = (r.phase === 'bet1' || r.phase === 'bet2') && r.turn === me.id;
  const anted = t.actions[me.id]?.n === r.n && t.actions[me.id]!.a === 'ante';
  const drawn = t.actions[me.id]?.n === r.n && t.actions[me.id]!.a === 'draw' && r.phase === 'draw';
  const left = (u?: number) => Math.max(0, Math.ceil(((u ?? 0) - now()) / 1000));
  const pay = async (a: string, amt: number) => {
    if (amt > balance) return;
    if (amt) await stake(me.id, amt);
    sfx.chip();
    await act(t, me.id, { a, n: r.n, amt });
  };
  const seats = Object.entries(t.seats);
  return (
    <Felt className="space-y-5">
      <div className="text-center">
        <p className="felt-label">Pot</p>
        <p className="font-display text-3xl text-gold-100">{chipsFmt(r.pot ?? 0)}</p>
        <p className="felt-rule">
          {r.phase === 'wait'
            ? 'Waiting for at least two players'
            : r.phase === 'ante'
              ? `Ante ${chipsFmt(t.minBet)} to play · ${left(r.closesAt)}s`
              : r.phase === 'draw'
                ? `Pick up to 4 cards to swap · ${left(r.closesAt)}s`
                : r.turn
                  ? `${t.seats[r.turn]?.name} to act · ${left(r.turnEnds)}s`
                  : (r.last ?? '5-card draw · bets in steps of ' + chipsFmt(t.minBet * 2))}
        </p>
        {r.last && r.phase !== 'paid' && <p className="text-xs text-gold-100/70">{r.last}</p>}
      </div>
      <div className="flex flex-wrap justify-center gap-4">
        {seats
          .filter(([id]) => id !== me.id)
          .map(([id, s]) => {
            const shown = r.reveal?.[id];
            const playing = (r.inHand ?? []).includes(id);
            return (
              <div key={id} className={`live-seat ${r.turn === id ? 'turn' : ''} ${r.folded?.[id] ? 'opacity-40' : ''} ${r.winners?.includes(id) ? 'win' : ''}`}>
                <div className="flex justify-center gap-0.5">
                  {playing && Array.from({ length: 5 }, (_, i) => (shown ? <PlayingCard key={i} c={shown[i]} i={i} /> : <span key={i} className="pc-mini" />))}
                </div>
                <p className="felt-label">
                  {s.name}
                  {r.folded?.[id] ? ' · folded' : ''}
                  {r.drew?.[id] !== undefined ? ` · drew ${r.drew[id]}` : ''}
                </p>
                <p className="text-xs text-gold-100/80">{r.labels?.[id] ?? (playing ? `in for ${chipsFmt(r.put?.[id] ?? 0)}` : 'sitting out')}</p>
              </div>
            );
          })}
      </div>
      <div className="text-center">
        <div className="flex min-h-36 justify-center gap-2">
          {myCards?.map((c, i) => (
            <PlayingCard key={`${r.n}-${r.phase}-${i}`} c={c} i={i} held={r.phase === 'draw' && discard.includes(i)} onClick={r.phase === 'draw' && !drawn && inHand && !r.folded?.[me.id] ? () => setDiscard(discard.includes(i) ? discard.filter((x) => x !== i) : discard.length < 4 ? [...discard, i] : discard) : undefined} />
          ))}
        </div>
        <p className="felt-label">
          You {myCards ? `· ${judge(myCards).label}` : ''} {inHand ? `· in for ${chipsFmt(r.put?.[me.id] ?? 0)}` : ''}
        </p>
      </div>
      {r.phase === 'paid' && r.last && <Result text={r.last} tone={r.winners?.includes(me.id) ? 'win' : inHand ? 'lose' : ''} />}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {r.phase === 'ante' && !anted && (
          <button className="btn-gold" disabled={balance < t.minBet} onClick={() => pay('ante', t.minBet)}>
            Ante {chipsFmt(t.minBet)}
          </button>
        )}
        {r.phase === 'ante' && anted && <p className="felt-label">You're in. Waiting for the others…</p>}
        {myTurn && (
          <>
            {toCall === 0 ? (
              <>
                <button className="btn-ghost" onClick={() => pay('check', 0)}>
                  Check
                </button>
                <button className="btn-gold" disabled={balance < (r.size ?? 0)} onClick={() => pay('bet', r.size ?? 0)}>
                  Bet {chipsFmt(r.size ?? 0)}
                </button>
              </>
            ) : (
              <>
                <button className="btn-gold" disabled={balance < toCall} onClick={() => pay('call', toCall)}>
                  Call {chipsFmt(toCall)}
                </button>
                {(r.raises ?? 0) < 3 && (
                  <button className="btn-gold" disabled={balance < toCall + (r.size ?? 0)} onClick={() => pay('raise', toCall + (r.size ?? 0))}>
                    Raise to {chipsFmt((r.cur ?? 0) + (r.size ?? 0))}
                  </button>
                )}
              </>
            )}
            <button className="btn-danger" onClick={() => pay('fold', 0)}>
              Fold
            </button>
          </>
        )}
        {r.phase === 'draw' && inHand && !r.folded?.[me.id] && !drawn && (
          <button className="btn-gold" onClick={() => (sfx.card(), act(t, me.id, { a: 'draw', n: r.n, idx: discard }))}>
            {discard.length ? `Swap ${discard.length}` : 'Stand pat'}
          </button>
        )}
        {drawn && <p className="felt-label">Waiting for the others to draw…</p>}
      </div>
    </Felt>
  );
}

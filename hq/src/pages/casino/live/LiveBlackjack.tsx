import { useEffect, useRef, useState } from 'react';
import { useHub } from '../../../hooks/useHub';
import { chipsFmt, deck, stake, type Card } from '../../../lib/casino';
import { sfx } from '../../../lib/sound';
import { act, placeBets, setRound, type LiveTable } from '../../../lib/tables';
import { total } from '../Blackjack';
import { BetPicker, Felt, PlayingCard, Result, useChips } from '../common';
import { now, useHostLoop, useSettle } from './useLive';

interface Hand {
  cards: Card[];
  stake: number;
  st: 'play' | 'stand' | 'bust' | 'bj';
}
export interface BlackjackRound {
  n: number;
  phase: 'idle' | 'bets' | 'play' | 'paid';
  closesAt?: number;
  hands?: Record<string, Hand>;
  order?: string[];
  turn?: string | null;
  turnEnds?: number;
  /** The dealer's up card(s); the hole card stays in the dealer's browser until the reveal. */
  dealer?: Card[];
  hole?: boolean;
  paid?: Record<string, number>;
  paidAt?: number;
}

const natural = (h: Card[]) => h.length === 2 && total(h) === 21;

/** The dealer's browser keeps the shoe and the hole card. */
function useDealer() {
  return useRef<{ n: number; shoe: Card[]; hole: Card | null; seen: Record<string, number> }>({ n: -1, shoe: [], hole: null, seen: {} });
}

export default function LiveBlackjack({ t, isHost }: { t: LiveTable<BlackjackRound>; isHost: boolean }) {
  const { me } = useHub();
  const { balance, min, max } = useChips();
  const d = useDealer();
  const [bet, setBet] = useState(Math.max(min, t.minBet));
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((x) => x + 1), 500);
    return () => clearInterval(i);
  }, []);

  const draw = () => {
    if (d.current.shoe.length < 30) d.current.shoe = deck(6);
    return d.current.shoe.shift()!;
  };

  async function step(tb: LiveTable<BlackjackRound>) {
    const r = tb.round;
    const time = now();
    const lost = (r.phase === 'play') && d.current.n !== r.n;
    if (lost) {
      // A new dealer took over mid-hand without the shoe: everyone gets their stake back.
      const paid = Object.fromEntries(Object.entries(r.hands ?? {}).map(([id, h]) => [id, h.stake]));
      return setRound(tb.id, { ...r, phase: 'paid', paid, paidAt: time, turn: null });
    }
    if (r.phase === 'idle' || (r.phase === 'paid' && time > (r.paidAt ?? 0) + 7000)) return setRound(tb.id, { n: r.n + 1, phase: 'bets', closesAt: time + 15_000 });
    if (r.phase === 'bets' && time > (r.closesAt ?? 0)) {
      const players = Object.keys(tb.seats).filter((id) => tb.bets[id]?.n === r.n && tb.bets[id]!.total > 0);
      if (!players.length) return setRound(tb.id, { ...r, closesAt: time + 15_000 });
      d.current.n = r.n;
      d.current.seen = {};
      const hands: Record<string, Hand> = {};
      for (const id of players) hands[id] = { cards: [draw(), draw()], stake: tb.bets[id]!.total, st: 'play' };
      const up = draw();
      d.current.hole = draw();
      for (const id of players) if (natural(hands[id]!.cards)) hands[id]!.st = 'bj';
      const order = players.filter((id) => hands[id]!.st === 'play');
      const dealerBJ = natural([up, d.current.hole]);
      if (dealerBJ || !order.length) return finish(tb, { ...r, phase: 'play', hands, order, dealer: [up], hole: true });
      return setRound(tb.id, { ...r, phase: 'play', hands, order, turn: order[0], turnEnds: time + 30_000, dealer: [up], hole: true });
    }
    if (r.phase === 'play' && r.turn) {
      const id = r.turn;
      const h = { ...r.hands![id]! };
      const a = tb.actions[id];
      const fresh = a && a.n === r.n && a.k > (d.current.seen[id] ?? 0);
      let done = false;
      if (fresh) {
        d.current.seen[id] = a.k;
        if (a.a === 'hit') {
          h.cards = [...h.cards, draw()];
          if (total(h.cards) > 21) (h.st = 'bust'), (done = true);
          else if (total(h.cards) === 21) (h.st = 'stand'), (done = true);
        } else if (a.a === 'double' && h.cards.length === 2) {
          h.cards = [...h.cards, draw()];
          h.stake *= 2;
          h.st = total(h.cards) > 21 ? 'bust' : 'stand';
          done = true;
        } else if (a.a === 'stand') (h.st = 'stand'), (done = true);
      } else if (time > (r.turnEnds ?? 0)) (h.st = 'stand'), (done = true);
      else return;
      const hands = { ...r.hands, [id]: h };
      if (!done) return setRound(tb.id, { ...r, hands, turnEnds: time + 30_000 });
      const next = r.order![r.order!.indexOf(id) + 1];
      if (next) return setRound(tb.id, { ...r, hands, turn: next, turnEnds: time + 30_000 });
      return finish(tb, { ...r, hands, turn: null });
    }
  }
  /** Reveal, let the dealer draw to 17, pay everyone. */
  function finish(tb: LiveTable<BlackjackRound>, r: BlackjackRound) {
    let dealer = [...r.dealer!, d.current.hole!];
    const anyAlive = Object.values(r.hands!).some((h) => h.st === 'stand');
    if (anyAlive && !natural(dealer)) while (total(dealer) < 17) dealer = [...dealer, draw()];
    const dt = total(dealer);
    const paid: Record<string, number> = {};
    for (const [id, h] of Object.entries(r.hands!)) {
      const pt = total(h.cards);
      if (h.st === 'bust') paid[id] = 0;
      else if (h.st === 'bj') paid[id] = natural(dealer) ? h.stake : Math.floor(h.stake * 2.5);
      else if (natural(dealer)) paid[id] = 0;
      else if (dt > 21 || pt > dt) paid[id] = h.stake * 2;
      else if (pt === dt) paid[id] = h.stake;
      else paid[id] = 0;
    }
    return setRound(tb.id, { ...r, phase: 'paid', dealer, hole: false, paid, paidAt: now(), turn: null });
  }

  useHostLoop(t, isHost, step);
  const r = t.round;
  const mine = r.hands?.[me.id];
  useSettle(
    t,
    (x) => x.round.hands?.[me.id]?.stake ?? null,
    (x) => x.round.paid?.[me.id] ?? 0,
    (x) => ({ blackjack: x.round.hands?.[me.id]?.st === 'bj' }),
  );
  const myBet = t.bets[me.id]?.n === r.n ? t.bets[me.id] : undefined;
  const myTurn = r.phase === 'play' && r.turn === me.id;
  const left = (until?: number) => Math.max(0, Math.ceil(((until ?? 0) - now()) / 1000));
  const move = (a: string) => act(t, me.id, { a, n: r.n });
  return (
    <Felt className="space-y-6">
      <div className="text-center">
        <p className="felt-label">Dealer {r.dealer && !r.hole ? `· ${total(r.dealer)}` : ''}</p>
        <div className="flex min-h-36 justify-center gap-2">
          {(r.dealer ?? []).map((c, i) => (
            <PlayingCard key={`${r.n}-${i}`} c={c} i={i} />
          ))}
          {r.hole && <PlayingCard down />}
        </div>
      </div>
      <p className="felt-rule">{r.phase === 'bets' ? `Bets close in ${left(r.closesAt)}s` : r.phase === 'play' ? `${t.seats[r.turn ?? '']?.name ?? ''} to act · ${left(r.turnEnds)}s` : 'Blackjack pays 3 to 2'}</p>
      <div className="flex flex-wrap justify-center gap-6">
        {Object.entries(r.hands ?? {}).map(([id, h]) => (
          <div key={id} className={`live-seat ${r.turn === id ? 'turn' : ''} ${id === me.id ? 'me' : ''}`}>
            <div className="flex justify-center gap-1">
              {h.cards.map((c, i) => (
                <PlayingCard key={`${r.n}-${i}`} c={c} i={i} />
              ))}
            </div>
            <p className="felt-label">
              {t.seats[id]?.name ?? '?'} · {total(h.cards)} {h.st === 'bust' ? '· bust' : h.st === 'bj' ? '· blackjack' : ''} · {chipsFmt(h.stake)}
            </p>
            {r.phase === 'paid' && <p className={`text-sm font-bold ${(r.paid?.[id] ?? 0) > h.stake ? 'text-yellow-200' : (r.paid?.[id] ?? 0) === h.stake ? 'text-gray-200' : 'text-red-300'}`}>{(r.paid?.[id] ?? 0) > h.stake ? `+${chipsFmt((r.paid?.[id] ?? 0) - h.stake)}` : (r.paid?.[id] ?? 0) === h.stake ? 'Push' : 'Lost'}</p>}
          </div>
        ))}
      </div>
      {r.phase === 'paid' && mine && <Result text={(r.paid?.[me.id] ?? 0) > mine.stake ? 'You win!' : (r.paid?.[me.id] ?? 0) === mine.stake ? 'Push.' : 'Dealer takes it.'} tone={(r.paid?.[me.id] ?? 0) > mine.stake ? 'win' : (r.paid?.[me.id] ?? 0) === mine.stake ? 'push' : 'lose'} />}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {myTurn ? (
          <>
            <button className="btn-gold" onClick={() => (sfx.card(), move('hit'))}>
              Hit
            </button>
            <button className="btn-gold" onClick={() => move('stand')}>
              Stand
            </button>
            {mine && mine.cards.length === 2 && (
              <button className="btn-ghost" disabled={balance < mine.stake} onClick={async () => (await stake(me.id, mine.stake), move('double'))}>
                Double ({chipsFmt(mine.stake)})
              </button>
            )}
          </>
        ) : r.phase === 'bets' && !myBet ? (
          <>
            <BetPicker bet={bet} setBet={setBet} min={Math.max(min, t.minBet)} max={max} balance={balance} />
            <button className="btn-gold" disabled={bet < Math.max(min, t.minBet) || bet > balance} onClick={async () => (await stake(me.id, bet), placeBets(t, me.id, r.n, bet), sfx.chip())}>
              Bet {chipsFmt(bet)}
            </button>
          </>
        ) : r.phase === 'bets' ? (
          <p className="felt-label">You're in for {chipsFmt(myBet!.total)}. Waiting for the deal…</p>
        ) : null}
      </div>
    </Felt>
  );
}

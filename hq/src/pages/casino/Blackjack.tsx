import { useRef, useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, deck, settle, stake, type Card } from '../../lib/casino';
import { pace, sfx } from '../../lib/sound';
import { BetBar, BetSpot, Felt, HandTotal, payOut, PlayingCard, rake, Result, Stack, useChips, wait } from './common';

/** Hand value, counting aces as 11 when it doesn't bust. */
export function total(h: Card[]) {
  let t = 0;
  let aces = 0;
  for (const c of h) {
    if (c.r === 'A') (t += 11), aces++;
    else if (['K', 'Q', 'J'].includes(c.r)) t += 10;
    else t += Number(c.r);
  }
  while (t > 21 && aces) (t -= 10), aces--;
  return t;
}
const natural = (h: Card[]) => h.length === 2 && total(h) === 21;
const tenish = (c: Card) => ['10', 'J', 'Q', 'K'].includes(c.r);
const sameValue = (a: Card, b: Card) => a.r === b.r || (tenish(a) && tenish(b));

interface Hand {
  cards: Card[];
  bet: number;
  done: boolean;
  /** Split from a pair (a 21 isn't a blackjack then); split aces get one card each. */
  split?: boolean;
  doubled?: boolean;
}
type Phase = 'bet' | 'insurance' | 'play' | 'dealer' | 'done';

const MAX_HANDS = 4;

/**
 * Blackjack against the house: dealer stands on 17, blackjack pays 3:2, double on any two, split pairs (up to four
 * hands), insurance when the dealer shows an ace.
 */
export default function Blackjack() {
  const { me } = useHub();
  const { balance, min, max, bonus } = useChips();
  const [bet, setBet] = useState(0);
  const shoe = useRef<Card[]>(deck(6));
  const [hands, setHands] = useState<Hand[]>([]);
  const [active, setActive] = useState(0);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [hole, setHole] = useState(true);
  const [phase, setPhase] = useState<Phase>('bet');
  const [insurance, setInsurance] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });
  const [round, setRound] = useState(0);
  const staked = useRef(0);

  const draw = () => {
    if (shoe.current.length < 52) shoe.current = deck(6);
    sfx.card();
    return shoe.current.shift()!;
  };
  const handEl = (i: number) => document.querySelector(`[data-hand="${i}"]`);

  /** Pays every hand, moves the chips and books the round. */
  async function settleRound(hs: Hand[], d: Card[], ins: number) {
    setPhase('done');
    const dt = total(d);
    const dbj = natural(d);
    let paid = 0;
    const lines: string[] = [];
    let anyWin = false;
    let anyLose = false;
    hs.forEach((h, i) => {
      const pt = total(h.cards);
      const bj = natural(h.cards) && !h.split;
      let p = 0;
      if (pt > 21) lines.push(hs.length > 1 ? `Hand ${i + 1} busts` : `Bust with ${pt}`);
      else if (bj && !dbj) (p = Math.floor(h.bet * 2.5)), lines.push('Blackjack!');
      else if (dbj && !bj) lines.push('Dealer has blackjack');
      else if (dt > 21) (p = h.bet * 2), lines.push(hs.length > 1 ? `Hand ${i + 1} wins` : 'Dealer busts');
      else if (pt > dt) (p = h.bet * 2), lines.push(hs.length > 1 ? `Hand ${i + 1}: ${pt} beats ${dt}` : `${pt} beats ${dt}`);
      else if (pt === dt) (p = h.bet), lines.push(`Push at ${pt}`);
      else lines.push(hs.length > 1 ? `Hand ${i + 1}: ${dt} beats ${pt}` : `${dt} beats ${pt}`);
      if (p > h.bet) (anyWin = true), void payOut(handEl(i), p, i * pace(150));
      else if (p === h.bet) void payOut(handEl(i), p, i * pace(150));
      else (anyLose = true), void rake(handEl(i), h.bet, i * pace(120));
      paid += p;
    });
    if (ins) {
      if (dbj) (paid += ins * 3), lines.push(`Insurance pays ${chipsFmt(ins * 2)}`);
      else lines.push('Insurance lost');
    }
    const wager = staked.current;
    const net = paid - wager;
    setMsg({ text: `${lines.join(' · ')}${net ? ` · ${net > 0 ? '+' : '−'}${chipsFmt(Math.abs(net))}` : ''}`, tone: net > 0 ? 'win' : net === 0 ? 'push' : 'lose' });
    if (net > 0) sfx.win();
    else if (anyLose && !anyWin) sfx.lose();
    await settle(me.id, wager, paid, { blackjack: hs.some((h) => natural(h.cards) && !h.split), bonus, game: 'blackjack', name: me.name, note: lines[0] ?? '' });
  }

  /** The dealer turns the hole card and draws to 17 (unless every hand is bust). */
  async function dealerPlays(hs: Hand[], d0: Card[], ins: number) {
    setPhase('dealer');
    setHole(false);
    let d = d0;
    await wait(500);
    if (hs.some((h) => total(h.cards) <= 21)) {
      while (total(d) < 17) {
        d = [...d, draw()];
        setDealer(d);
        await wait(520);
      }
    }
    await settleRound(hs, d, ins);
  }

  /** Moves to the next unfinished hand, or lets the dealer play. */
  async function next(hs: Hand[], from: number) {
    const i = hs.findIndex((h, k) => k >= from && !h.done);
    if (i >= 0) {
      setActive(i);
      setHands(hs);
      return;
    }
    setHands(hs);
    await dealerPlays(hs, dealer, insurance);
  }

  async function deal() {
    if (bet < min || bet > balance) return;
    setMsg({ text: '', tone: '' });
    await stake(me.id, bet);
    staked.current = bet;
    setRound((r) => r + 1);
    setInsurance(0);
    setHole(true);
    setActive(0);
    // Deal the way a dealer does: player, dealer, player, dealer (the second one face down).
    const p = [draw()];
    setHands([{ cards: p, bet, done: false }]);
    setDealer([]);
    await wait(260);
    const d = [draw()];
    setDealer(d);
    await wait(260);
    p.push(draw());
    setHands([{ cards: [...p], bet, done: false }]);
    await wait(260);
    d.push(draw());
    setDealer([...d]);
    await wait(380);
    const hs: Hand[] = [{ cards: p, bet, done: false }];
    if (d[0]!.r === 'A' && balance - bet >= Math.floor(bet / 2) && Math.floor(bet / 2) > 0) {
      setHands(hs);
      setPhase('insurance');
      return;
    }
    await afterPeek(hs, d, 0);
  }
  /** After insurance: if anyone has blackjack, the hand ends right away. */
  async function afterPeek(hs: Hand[], d: Card[], ins: number) {
    if (natural(d) || natural(hs[0]!.cards)) {
      setHole(false);
      setHands(hs);
      await wait(400);
      return settleRound(hs, d, ins);
    }
    if (ins) setMsg({ text: 'No dealer blackjack · insurance lost', tone: 'lose' });
    setHands(hs);
    setPhase('play');
  }
  async function insure(take: boolean) {
    const amt = take ? Math.floor(hands[0]!.bet / 2) : 0;
    if (take) {
      await stake(me.id, amt);
      staked.current += amt;
      setInsurance(amt);
    }
    await afterPeek(hands, dealer, amt);
  }

  function hit() {
    const hs = hands.map((h) => ({ ...h, cards: [...h.cards] }));
    const h = hs[active]!;
    h.cards.push(draw());
    if (total(h.cards) >= 21) h.done = true;
    if (h.done) void next(hs, active + 1);
    else setHands(hs);
  }
  function standHand() {
    const hs = hands.map((h, i) => (i === active ? { ...h, done: true } : h));
    void next(hs, active + 1);
  }
  async function double() {
    const h0 = hands[active]!;
    if (balance < h0.bet) return;
    await stake(me.id, h0.bet);
    staked.current += h0.bet;
    const hs = hands.map((h, i) => (i === active ? { ...h, bet: h.bet * 2, doubled: true, cards: [...h.cards, draw()], done: true } : h));
    void next(hs, active + 1);
  }
  async function split() {
    const h0 = hands[active]!;
    if (balance < h0.bet) return;
    await stake(me.id, h0.bet);
    staked.current += h0.bet;
    const aces = h0.cards[0]!.r === 'A';
    const a: Hand = { cards: [h0.cards[0]!, draw()], bet: h0.bet, done: aces, split: true };
    await wait(200);
    const b: Hand = { cards: [h0.cards[1]!, draw()], bet: h0.bet, done: aces, split: true };
    for (const h of [a, b]) if (total(h.cards) === 21) h.done = true;
    const hs = [...hands.slice(0, active), a, b, ...hands.slice(active + 1)];
    void next(hs, active);
  }

  const cur = hands[active];
  const canDouble = phase === 'play' && !!cur && cur.cards.length === 2 && balance >= cur.bet;
  const canSplit = phase === 'play' && !!cur && cur.cards.length === 2 && sameValue(cur.cards[0]!, cur.cards[1]!) && hands.length < MAX_HANDS && balance >= cur.bet;
  const betting = phase === 'bet' || phase === 'done';
  return (
    <div>
      <Felt>
        <span className="bj-shoe" aria-hidden />
        <div className="space-y-4" key={round}>
          <div className="flex flex-col items-center gap-2" style={{ ['--shoe-x' as string]: '160px', ['--shoe-y' as string]: '-30px' }}>
            <p className="felt-label flex items-center gap-2">
              Dealer <HandTotal cards={hole && phase !== 'done' ? dealer.slice(0, 1) : dealer} />
            </p>
            <div className="bj-cards min-h-[90px]">
              {dealer.map((c, i) => (
                <PlayingCard key={i} c={c} down={hole && i === 1} />
              ))}
            </div>
          </div>
          <p className="felt-rule">
            Blackjack pays 3 to 2 · Dealer stands on 17<span className="hidden sm:inline"> · Insurance pays 2 to 1</span>
          </p>
          <div className="flex flex-wrap items-end justify-center gap-3" style={{ ['--shoe-x' as string]: '200px', ['--shoe-y' as string]: '-220px' }}>
            {hands.length ? (
              hands.map((h, i) => (
                <div key={i} className={`bj-hand ${phase === 'play' && i === active && hands.length > 1 ? 'active' : ''}`}>
                  <div className="bj-cards">
                    {h.cards.map((c, k) => (
                      <PlayingCard key={k} c={c} />
                    ))}
                  </div>
                  <span className="flex items-center gap-3">
                    <HandTotal cards={h.cards} />
                    <span data-hand={i} className="inline-flex h-10 items-end">
                      <Stack amount={h.bet} size={28} />
                    </span>
                  </span>
                </div>
              ))
            ) : (
              <div className="flex min-h-[150px] flex-col items-center justify-end gap-2">
                <BetSpot amount={bet} />
              </div>
            )}
          </div>
          {insurance > 0 && <p className="text-center text-xs text-smoke">Insurance {chipsFmt(insurance)}</p>}
          <Result {...msg} />
        </div>
      </Felt>
      <BetBar bet={betting ? bet : staked.current} min={min} max={max} balance={balance} onAdd={(v) => (phase === 'done' && setHands([]), setDealer((d) => (phase === 'done' ? [] : d)), setMsg({ text: '', tone: '' }), setPhase('bet'), setBet((b) => Math.min(Math.min(max, balance), b + v)))} onClear={() => setBet(0)} locked={!betting}>
        {phase === 'insurance' ? (
          <>
            <button className="btn-ghost" onClick={() => insure(false)}>
              No insurance
            </button>
            <button className="btn-gold" onClick={() => insure(true)}>
              Insure {chipsFmt(Math.floor((hands[0]?.bet ?? 0) / 2))}
            </button>
          </>
        ) : phase === 'play' ? (
          <>
            <button className="btn-gold" onClick={hit}>
              Hit
            </button>
            <button className="btn-gold" onClick={standHand}>
              Stand
            </button>
            {canDouble && (
              <button className="btn-ghost" onClick={double}>
                Double
              </button>
            )}
            {canSplit && (
              <button className="btn-ghost" onClick={split}>
                Split
              </button>
            )}
          </>
        ) : phase === 'dealer' ? (
          <button className="btn-ghost" disabled>
            Dealer…
          </button>
        ) : (
          <button className="btn-gold" onClick={deal} disabled={bet < min || bet > balance}>
            Deal
          </button>
        )}
      </BetBar>
    </div>
  );
}

import { useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, deck, settle, stake, type Card } from '../../lib/casino';
import { sfx } from '../../lib/sound';
import { BetPicker, Felt, PlayingCard, Result, useChips } from './common';

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

type Phase = 'bet' | 'play' | 'done';

/** Blackjack against the house: dealer stands on soft 17, blackjack pays 3:2, double on any two. */
export default function Blackjack() {
  const { me } = useHub();
  const { balance, min, max } = useChips();
  const [bet, setBet] = useState(min);
  const [shoe, setShoe] = useState<Card[]>(() => deck(6));
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [phase, setPhase] = useState<Phase>('bet');
  const [stakeNow, setStakeNow] = useState(0);
  const [msg, setMsg] = useState<{ text: string; tone: 'win' | 'lose' | 'push' | '' }>({ text: '', tone: '' });

  const draw = (s: Card[]) => {
    const fresh = s.length < 52 ? deck(6) : s;
    return [fresh[0]!, fresh.slice(1)] as const;
  };

  async function finish(p: Card[], d0: Card[], s0: Card[], wager: number, playerDone = true) {
    let d = d0;
    let s = s0;
    // The dealer plays only if the player didn't bust.
    if (playerDone && total(p) <= 21) {
      while (total(d) < 17) {
        const [c, rest] = draw(s);
        d = [...d, c];
        s = rest;
      }
    }
    setDealer(d);
    setShoe(s);
    setPhase('done');
    const pt = total(p);
    const dt = total(d);
    let paid = 0;
    let text = '';
    let tone: 'win' | 'lose' | 'push' = 'lose';
    if (pt > 21) text = `Bust with ${pt}.`;
    else if (natural(p) && !natural(d)) (paid = Math.floor(wager * 2.5)), (text = `Blackjack! +${chipsFmt(paid - wager)}`), (tone = 'win');
    else if (natural(d) && !natural(p)) text = 'Dealer has blackjack.';
    else if (dt > 21) (paid = wager * 2), (text = `Dealer busts. +${chipsFmt(wager)}`), (tone = 'win');
    else if (pt > dt) (paid = wager * 2), (text = `${pt} beats ${dt}. +${chipsFmt(wager)}`), (tone = 'win');
    else if (pt === dt) (paid = wager), (text = `Push at ${pt}.`), (tone = 'push');
    else text = `${dt} beats ${pt}.`;
    setMsg({ text, tone });
    if (tone === 'win') sfx.win();
    else if (tone === 'lose') sfx.lose();
    await settle(me.id, wager, paid, { blackjack: natural(p) });
  }

  async function deal() {
    if (bet < min || bet > balance) return;
    await stake(me.id, bet);
    let s = shoe.length < 52 ? deck(6) : shoe;
    const p = [s[0]!, s[2]!];
    const d = [s[1]!, s[3]!];
    s = s.slice(4);
    [0, 1, 2, 3].forEach((i) => setTimeout(sfx.card, i * 130));
    setPlayer(p);
    setDealer(d);
    setShoe(s);
    setStakeNow(bet);
    setMsg({ text: '', tone: '' });
    if (natural(p) || natural(d)) return finish(p, d, s, bet, false);
    setPhase('play');
  }
  function hit() {
    const [c, s] = draw(shoe);
    const p = [...player, c];
    sfx.card();
    setPlayer(p);
    setShoe(s);
    if (total(p) > 21) void finish(p, dealer, s, stakeNow, false);
    else if (total(p) === 21) void finish(p, dealer, s, stakeNow);
  }
  async function double() {
    if (balance < stakeNow) return;
    await stake(me.id, stakeNow);
    const [c, s] = draw(shoe);
    const p = [...player, c];
    sfx.card();
    setPlayer(p);
    void finish(p, dealer, s, stakeNow * 2, total(p) <= 21);
  }

  const hide = phase === 'play';
  return (
    <Felt className="space-y-6">
      <div className="text-center">
        <p className="felt-label">Dealer {phase !== 'bet' && !hide ? `· ${total(dealer)}` : ''}</p>
        <div className="flex min-h-36 justify-center gap-2">
          {dealer.map((c, i) => (
            <PlayingCard key={i} c={c} i={i} down={hide && i === 1} />
          ))}
        </div>
      </div>
      <p className="felt-rule">Blackjack pays 3 to 2 · Dealer stands on 17</p>
      <div className="text-center">
        <div className="flex min-h-36 justify-center gap-2">
          {player.map((c, i) => (
            <PlayingCard key={i} c={c} i={i} />
          ))}
        </div>
        <p className="felt-label">You {player.length ? `· ${total(player)}` : ''}</p>
      </div>
      <Result {...msg} />
      <div className="flex flex-wrap items-center justify-center gap-3">
        {phase === 'play' ? (
          <>
            <button className="btn-gold" onClick={hit}>
              Hit
            </button>
            <button className="btn-gold" onClick={() => finish(player, dealer, shoe, stakeNow)}>
              Stand
            </button>
            {player.length === 2 && (
              <button className="btn-ghost" onClick={double} disabled={balance < stakeNow}>
                Double ({chipsFmt(stakeNow)})
              </button>
            )}
          </>
        ) : (
          <>
            <BetPicker bet={bet} setBet={setBet} min={min} max={max} balance={balance} />
            <button className="btn-gold" onClick={deal} disabled={bet < min || bet > balance}>
              Deal
            </button>
          </>
        )}
      </div>
    </Felt>
  );
}

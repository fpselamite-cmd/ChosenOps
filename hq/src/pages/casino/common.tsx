import { Volume2, VolumeX } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, DEFAULT_CASINO, isRed, type Card, type CasinoSettings, type Chips } from '../../lib/casino';
import { isMuted, setMuted, sfx } from '../../lib/sound';

export function useChips() {
  const { me } = useHub();
  const c = useDoc<Chips>(`chips/${me.id}`);
  const s = { ...DEFAULT_CASINO, ...(useDoc<CasinoSettings>('settings/casino') ?? {}) };
  const event = !!s.eventUntil && s.eventUntil.toMillis() > Date.now();
  return { chips: c, balance: c?.balance ?? 0, settings: s, event, max: event ? s.eventMax : s.max, min: s.min };
}

/** A playing card that flips in. */
export function PlayingCard({ c, down, i = 0, held, onClick }: { c?: Card; down?: boolean; i?: number; held?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`pc ${down || !c ? 'down' : ''} ${c && isRed(c) ? 'red' : ''} ${held ? 'held' : ''}`} style={{ animationDelay: `${i * 0.12}s` }} onClick={onClick} disabled={!onClick} tabIndex={onClick ? 0 : -1}>
      {c && !down ? (
        <>
          <span className="pc-corner">
            {c.r}
            <br />
            {c.s}
          </span>
          <span className="pc-mid">{c.s}</span>
          <span className="pc-corner br">
            {c.r}
            <br />
            {c.s}
          </span>
        </>
      ) : (
        <span className="pc-back" />
      )}
      {held && <span className="pc-held">HELD</span>}
    </button>
  );
}

const CHIP_VALUES = [10, 25, 50, 100, 250, 500, 1000];
/** Pick a bet by stacking chips. */
export function BetPicker({ bet, setBet, min, max, balance, disabled }: { bet: number; setBet: (n: number) => void; min: number; max: number; balance: number; disabled?: boolean }) {
  const cap = Math.min(max, balance);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHIP_VALUES.filter((v) => v <= max).map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled || bet + v > cap}
          className={`casino-chip v${v}`}
          onClick={() => {
            sfx.chip();
            setBet(Math.min(cap, bet + v));
          }}
        >
          {v >= 1000 ? `${v / 1000}K` : v}
        </button>
      ))}
      <button type="button" className="btn-ghost btn-sm" disabled={disabled || !bet} onClick={() => setBet(0)}>
        Clear
      </button>
      <span className="ml-1 font-hud text-lg text-gold-100">
        Bet <b>{chipsFmt(bet)}</b>
      </span>
      <span className="text-xs text-smoke">
        ({min}–{chipsFmt(max)})
      </span>
    </div>
  );
}

export function SoundToggle() {
  const [m, setM] = useState(isMuted());
  return (
    <button className="btn-ghost btn-sm" onClick={() => (setMuted(!m), setM(!m))} title={m ? 'Sound off' : 'Sound on'} aria-label="Toggle sound">
      {m ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}

/** Green felt with gold trim and the crest. */
export function Felt({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`felt ${className}`}>{children}</div>;
}

export function Result({ text, tone }: { text: string; tone: 'win' | 'lose' | 'push' | '' }) {
  if (!text) return null;
  return <p className={`casino-result ${tone}`}>{text}</p>;
}

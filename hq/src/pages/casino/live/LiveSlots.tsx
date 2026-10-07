import { useHub } from '../../../hooks/useHub';
import { chipsFmt } from '../../../lib/casino';
import { postSpin, type LiveTable } from '../../../lib/tables';
import Slots, { SYMBOLS } from '../Slots';

/** The slot hall: everyone plays their own machine, and sees each other's spins and jackpots. */
export default function LiveSlots({ t }: { t: LiveTable }) {
  const { me } = useHub();
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(t.seats)
          .filter(([id]) => id !== me.id)
          .map(([id, s]) => {
            const l = t.last[id];
            return (
              <div key={id} className={`live-seat ${l && l.mult >= SYMBOLS[0]!.pays ? 'turn' : ''}`}>
                <p className="felt-label">{s.name}</p>
                <div className="flex justify-center gap-1">
                  {(l?.line ?? [5, 5, 5]).map((x, i) => {
                    const S = SYMBOLS[x]!;
                    return <S.icon key={i} className={`size-8 ${l ? '' : 'opacity-20'}`} style={{ color: S.color }} />;
                  })}
                </div>
                <p className="text-xs text-gold-100/80">{l ? (l.mult ? `${l.mult}× · +${chipsFmt(l.bet * l.mult - l.bet)}` : `lost ${chipsFmt(l.bet)}`) : 'No spins yet'}</p>
              </div>
            );
          })}
      </div>
      <Slots onSpin={(line, mult, bet) => void postSpin(t, me.id, line, mult, bet).catch(() => {})} />
    </div>
  );
}

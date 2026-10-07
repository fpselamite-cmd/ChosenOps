import { Link } from 'react-router-dom';
import { FancyName, Framed, TitleTag } from '../../components/HonorArt';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { useHonors } from './useHonors';

/** Honor score leaderboard for the Hall of Fame. */
export function HonorBoard() {
  const { roster } = useHub();
  const { score, equipped, ownedBy } = useHonors();
  const rows = roster
    .map((m) => ({ m, s: score(m.id), n: ownedBy(m.id).length }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 10);
  if (!rows.length) return null;
  return (
    <div className="mb-10">
      <Panel title="Honor score · the most decorated">
        <ol className="divide-y divide-line-soft">
          {rows.map(({ m, s, n }, i) => {
            const e = equipped(m.id);
            return (
              <li key={m.id}>
                <Link to={`/members/${m.id}?view=honors`} className="flex items-center gap-3 py-2.5 hover:bg-raised/40">
                  <span className={`w-7 text-center font-display text-lg ${i === 0 ? 'text-gold-200' : 'text-smoke'}`}>{i + 1}</span>
                  <Framed member={m} frame={e.frame} size="md" />
                  <span className="min-w-0 flex-1">
                    <FancyName name={m.name} hue={e.nameHue} effect={e.effect?.effect} className="block truncate font-hud text-base font-bold" />
                    {e.title && <TitleTag h={e.title} className="text-[11px]" />}
                  </span>
                  <span className="text-right">
                    <b className="block font-display text-xl text-gold-100">{s.toLocaleString()}</b>
                    <span className="text-[11px] text-smoke">{n} honors</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </Panel>
    </div>
  );
}

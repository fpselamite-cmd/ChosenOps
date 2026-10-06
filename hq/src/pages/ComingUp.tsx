import { CircleDashed, Hammer } from 'lucide-react';
import { NAV } from '../lib/nav';
import { ROADMAP } from '../lib/roadmap';
import { PageHeader, Panel } from '../components/Page';

export default function ComingUp({ page }: { page: keyof typeof ROADMAP }) {
  const r = ROADMAP[page]!;
  const icon = NAV.flatMap((g) => g.items).find((i) => i.to === `/${page}`)?.icon ?? Hammer;
  return (
    <>
      <PageHeader icon={icon} kicker={r.kicker} title={r.title} sub={r.sub} />
      <Panel title={`Under construction · Step ${r.step}`} right={<Hammer className="size-4 text-gold-500" />}>
        <ul className="space-y-2.5">
          {r.features.map((f) => (
            <li key={f} className="flex gap-3 text-ash">
              <CircleDashed className="mt-0.5 size-4 shrink-0 text-gold-600" />
              {f}
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

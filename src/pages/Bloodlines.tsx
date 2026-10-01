import { useState, type ReactNode } from 'react';
import { Avatar } from '../components/Avatar';
import { Empty, PageHeader } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { SectionTitle } from '../components/Ornament';
import { RankBadge } from '../components/RankBadge';
import { tieLabel, TieForm } from '../components/Ties';
import { useHub } from '../hooks/useHub';
import { useLore } from '../hooks/useLore';
import { displayName } from '../lib/format';
import { RELATIONSHIP_TYPES, type Relationship } from '../lib/types';

export default function Bloodlines() {
  const { memberById, can } = useHub();
  const { relationships } = useLore();
  const [adding, setAdding] = useState(false);
  const ties = relationships.filter((t) => memberById.has(t.a) && memberById.has(t.b));

  const parentTies = ties.filter((t) => t.type === 'parent');
  const spouseTies = ties.filter((t) => t.type === 'spouse');
  const childrenOf = (id: string) => parentTies.filter((t) => t.a === id).map((t) => t.b);
  const parentsOf = (id: string) => parentTies.filter((t) => t.b === id).map((t) => t.a);
  const spousesOf = (id: string) => spouseTies.flatMap((t) => (t.a === id ? [t.b] : t.b === id ? [t.a] : []));

  const people = new Set([...parentTies, ...spouseTies].flatMap((t) => [t.a, t.b]));
  // A root has no parents, and isn't married into a family that has parents
  // (in-laws are drawn beside their spouse instead). Couples of two roots get one tree.
  const roots: string[] = [];
  const claimed = new Set<string>();
  for (const id of [...people].sort((x, y) => displayName(memberById.get(x)).localeCompare(displayName(memberById.get(y))))) {
    if (claimed.has(id) || parentsOf(id).length) continue;
    const spouses = spousesOf(id);
    if (spouses.some((s) => parentsOf(s).length)) continue;
    if (!childrenOf(id).length && !spouses.some((s) => childrenOf(s).length) && !spouses.length) continue;
    roots.push(id);
    claimed.add(id);
    spouses.forEach((s) => claimed.add(s));
  }

  function renderUnit(id: string, seen: Set<string>): ReactNode {
    if (seen.has(id)) return null;
    const next = new Set(seen).add(id);
    const spouses = spousesOf(id).filter((s) => !seen.has(s));
    spouses.forEach((s) => next.add(s));
    const kids = [...new Set([id, ...spouses].flatMap(childrenOf))].filter((k) => !next.has(k));
    return (
      <li key={id}>
        <div className="inline-flex items-center gap-2">
          <PersonCard id={id} />
          {spouses.map((s) => (
            <span key={s} className="inline-flex items-center gap-2">
              <span className="font-serif text-2xl text-gold-400" title="Spouse">
                ⚭
              </span>
              <PersonCard id={s} />
            </span>
          ))}
        </div>
        {kids.length > 0 && <ul>{kids.map((k) => renderUnit(k, next))}</ul>}
      </li>
    );
  }

  const otherTies = ties.filter((t) => t.type !== 'parent' && t.type !== 'spouse');

  return (
    <div>
      <PageHeader
        title="Bloodlines"
        subtitle="Who was born to whom, who married whom, and who swore what."
        actions={
          can('writeLore') && (
            <button className="btn-gold" onClick={() => setAdding(true)}>
              + Record a tie
            </button>
          )
        }
      />

      <section className="mb-12">
        <SectionTitle>Family trees</SectionTitle>
        {roots.length === 0 ? (
          <Empty>No bloodlines yet. Record a "Parent of" or "Spouse of" tie to start a family tree.</Empty>
        ) : (
          <div className="space-y-10">
            {roots.map((r) => (
              <div key={r} className="panel overflow-x-auto p-6">
                <div className="tree min-w-max">
                  <ul>{renderUnit(r, new Set())}</ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Bonds &amp; feuds</SectionTitle>
        {otherTies.length === 0 ? (
          <Empty>No sworn bonds, rivalries or siblings recorded yet.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {otherTies.map((t) => (
              <TieRow key={t.id} tie={t} />
            ))}
          </ul>
        )}
      </section>

      {adding && <TieForm onClose={() => setAdding(false)} />}
    </div>
  );
}

function PersonCard({ id }: { id: string }) {
  const { memberById, rankById } = useHub();
  const m = memberById.get(id);
  return (
    <MemberName id={id} className="group block">
      <div className="w-32 rounded-xl border border-edge bg-coal/90 p-3 transition group-hover:border-gold-500 group-hover:shadow-[0_0_24px_-8px_rgba(212,175,55,.6)]">
        <div className="flex justify-center">
          <Avatar member={m} size="md" ring />
        </div>
        <div className="mt-2 truncate font-display text-sm font-bold text-bone group-hover:text-gold-200">{displayName(m)}</div>
        <div className="mt-1 flex justify-center">
          <RankBadge rank={m?.rankId ? rankById.get(m.rankId) : null} className="!px-1.5 !text-[9px]" />
        </div>
      </div>
    </MemberName>
  );
}

const GROUP_STYLE: Record<string, string> = { Blood: 'text-blood', Bond: 'text-bond', Feud: 'text-feud' };

function TieRow({ tie }: { tie: Relationship }) {
  const { memberById } = useHub();
  const group = RELATIONSHIP_TYPES[tie.type].group;
  return (
    <li className="panel flex items-center gap-3 p-3">
      <MemberName id={tie.a}>
        <Avatar member={memberById.get(tie.a)} size="sm" />
      </MemberName>
      <div className="min-w-0 flex-1 text-sm">
        <MemberName id={tie.a} /> <span className={`mx-1 text-xs uppercase tracking-wider ${GROUP_STYLE[group]}`}>{tieLabel(tie, tie.a)}</span>{' '}
        <MemberName id={tie.b} />
        {tie.note && <div className="truncate font-serif italic text-parchment/70">{tie.note}</div>}
      </div>
      <MemberName id={tie.b}>
        <Avatar member={memberById.get(tie.b)} size="sm" />
      </MemberName>
    </li>
  );
}

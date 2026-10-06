import { Crown, Network } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { CrewChip, RankBadge } from '../components/Badges';
import { PageHeader, Tabs } from '../components/Page';
import { useHub } from '../hooks/useHub';
import type { Member } from '../lib/types';

function PersonCard({ m, big }: { m: Member; big?: boolean }) {
  const { rankById, crewsOf, isOnline, crews } = useHub();
  const rank = rankById.get(m.rankId ?? '');
  const leads = crews.filter((c) => c.leaderId === m.id);
  return (
    <Link
      to={`/members/${m.id}`}
      className={`hud group flex flex-col items-center gap-2 px-3 py-4 text-center transition hover:-translate-y-0.5 ${big ? 'w-52 sm:w-56' : 'w-[9.5rem] sm:w-40'}`}
      style={rank?.order === 0 ? { boxShadow: '0 0 32px rgba(212,175,55,0.25)' } : undefined}
    >
      {rank?.order === 0 && <Crown className="size-5 text-gold-300 drop-shadow-[0_0_6px_#d4af37]" />}
      <Avatar member={m} size={big ? 'xl' : 'lg'} online={isOnline(m.id)} />
      <span className="w-full truncate font-hud text-base font-bold text-gold-100 group-hover:text-gold-200">{m.name}</span>
      <RankBadge rank={rank} />
      {(leads.length > 0 || crewsOf(m.id).length > 0) && (
        <span className="flex flex-wrap justify-center gap-1">
          {crewsOf(m.id).map((c) => (
            <span key={c.id} title={leads.includes(c) ? `Leads ${c.name}` : c.name}>
              <CrewChip crew={c} link={false} />
            </span>
          ))}
        </span>
      )}
    </Link>
  );
}

/** Rank tiers, top of the family first. Leadership below the top shares one row. */
function Tiers() {
  const { roster, ranks } = useHub();
  const top = ranks[0];
  const council = ranks.slice(1).filter((r) => r.leadership);
  const rest = ranks.slice(1).filter((r) => !r.leadership);
  const tiers = [
    ...(top ? [{ key: top.id, label: top.name, people: roster.filter((m) => m.rankId === top.id), vacant: true, big: true }] : []),
    ...(council.length
      ? [{ key: 'council', label: 'Leadership', people: council.flatMap((r) => roster.filter((m) => m.rankId === r.id)), vacant: false, big: false }]
      : []),
    ...rest.map((r) => ({ key: r.id, label: r.name, people: roster.filter((m) => m.rankId === r.id), vacant: false, big: false })),
  ].filter((t) => t.people.length || t.vacant);

  return (
    <div>
      {tiers.map((t, i) => (
        <section key={t.key}>
          {i > 0 && <div className="mx-auto h-6 w-px bg-gradient-to-b from-gold-700 to-gold-400/60" />}
          <p className="label mb-3 text-center text-gold-500">
            <span className="text-gold-700">───</span> {t.label} <span className="text-gold-700">───</span>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {t.people.map((m) => (
              <PersonCard key={m.id} m={m} big={t.big} />
            ))}
            {!t.people.length && (
              <div className="flex h-20 w-40 items-center justify-center border border-dashed border-line font-hud text-sm tracking-widest text-smoke uppercase">
                Vacant
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Who answers to whom, drawn as an org chart. */
function Chain() {
  const { roster, rankById } = useHub();
  const ids = new Set(roster.map((m) => m.id));
  const kids = new Map<string, Member[]>();
  const roots: Member[] = [];
  for (const m of roster) {
    if (m.reportsTo && ids.has(m.reportsTo) && m.reportsTo !== m.id) {
      kids.set(m.reportsTo, [...(kids.get(m.reportsTo) ?? []), m]);
    } else roots.push(m);
  }
  const byRank = (a: Member, b: Member) =>
    (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99) || a.name.localeCompare(b.name);
  // The top of the family heads the tree; anyone else without a boss hangs beside them.
  roots.sort(byRank);

  const seen = new Set<string>();
  const node = (m: Member): React.ReactNode => {
    if (seen.has(m.id)) return null;
    seen.add(m.id);
    const children = (kids.get(m.id) ?? []).sort(byRank);
    return (
      <li key={m.id}>
        <PersonCard m={m} big={rankById.get(m.rankId ?? '')?.order === 0} />
        {children.length > 0 && <ul>{children.map(node)}</ul>}
      </li>
    );
  };

  const top = roots[0];
  const loose = roots.slice(1);
  return (
    <div className="space-y-8">
      <div className="orgtree overflow-x-auto pb-4">
        <ul className="min-w-max">{top && node(top)}</ul>
      </div>
      {loose.length > 0 && (
        <div>
          <p className="label mb-3 text-center">No one above them in the chain yet</p>
          <div className="orgtree overflow-x-auto pb-4">
            <ul className="min-w-max gap-2">{loose.map(node)}</ul>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Family() {
  const { can } = useHub();
  const [view, setView] = useState<'tiers' | 'chain'>('tiers');
  return (
    <>
      <PageHeader
        icon={Network}
        kicker="People"
        title="The Family"
        sub={
          <>
            The chain of command, from the Boss down.
            {can('manageMembers') && ' Set ranks and who answers to whom in Admin → Members.'}
          </>
        }
      />
      <div className="mb-6">
        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { id: 'tiers', label: 'By rank' },
            { id: 'chain', label: 'Chain of command' },
          ]}
        />
      </div>
      {view === 'tiers' ? <Tiers /> : <Chain />}
    </>
  );
}

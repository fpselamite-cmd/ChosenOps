import { useState } from 'react';
import { Avatar } from '../components/Avatar';
import { Empty, PageHeader } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { RankBadge } from '../components/RankBadge';
import { StatusPill } from '../components/StatusPill';
import { useHub } from '../hooks/useHub';
import { displayName } from '../lib/format';
import type { Member, Rank } from '../lib/types';

type View = 'grid' | 'list';
const VIEW_KEY = 'chosen.memberWallView';

function loadView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export default function Members() {
  const { members, ranks } = useHub();
  const [view, setViewState] = useState<View>(loadView);
  const [search, setSearch] = useState('');
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  const q = search.trim().toLowerCase();
  const active = members.filter(
    (m) =>
      m.status === 'active' &&
      (!q ||
        [displayName(m), m.username, m.character?.alias, m.character?.specialty].some((s) => s?.toLowerCase().includes(q))),
  );
  const tiers = ranks
    .map((rank) => ({
      rank,
      members: active.filter((m) => m.rankId === rank.id).sort((a, b) => displayName(a).localeCompare(displayName(b))),
    }))
    .filter((t) => t.members.length);

  return (
    <div>
      <PageHeader
        title="The Family"
        subtitle={`${members.filter((m) => m.status === 'active').length} made members, from the top down.`}
        actions={
          <>
            <input className="input w-48" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex overflow-hidden rounded-lg border border-edge" role="group" aria-label="View">
              {(['grid', 'list'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-3 py-2 text-sm ${view === v ? 'bg-gold-400 font-semibold text-ink' : 'text-smoke hover:text-bone'}`}
                >
                  {v === 'grid' ? '▦ Portraits' : '☰ List'}
                </button>
              ))}
            </div>
          </>
        }
      />

      {tiers.length === 0 && <Empty>No one matches that.</Empty>}

      <div className="space-y-10">
        {tiers.map(({ rank, members }) => (
          <section key={rank.id}>
            <TierHeader rank={rank} count={members.length} />
            {view === 'grid' ? (
              <div className="flex flex-wrap justify-center gap-4">
                {members.map((m) => (
                  <div key={m.id} className={rank.order === 0 ? 'w-60' : rank.order <= 2 ? 'w-48' : 'w-40'}>
                    <PortraitCard member={m} rank={rank} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="panel divide-y divide-edge">
                {members.map((m) => (
                  <ListRow key={m.id} member={m} rank={rank} />
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function TierHeader({ rank, count }: { rank: Rank; count: number }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-gold-700/70" />
      <h2 className="font-display text-sm font-bold uppercase tracking-[0.3em]" style={{ color: rank.color || '#e6c35c' }}>
        {rank.order === 0 && '♛ '}
        {rank.name}
        <span className="ml-2 text-smoke">· {count}</span>
      </h2>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-gold-700/70" />
    </div>
  );
}

function PortraitCard({ member, rank }: { member: Member; rank: Rank }) {
  const c = member.character ?? {};
  return (
    <MemberName id={member.id} className="group block">
      <div
        className={`panel overflow-hidden transition group-hover:-translate-y-0.5 group-hover:border-gold-500/70 group-hover:shadow-[0_0_30px_-10px_rgba(212,175,55,.6)] ${
          rank.order === 0 ? 'border-gold-500/60' : ''
        }`}
      >
        <div className="relative aspect-square bg-coal">
          {member.avatar ? (
            <img src={member.avatar} alt={displayName(member)} className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <Avatar member={member} size={rank.order === 0 ? 'xl' : 'lg'} />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <div className="truncate font-display text-base font-bold text-bone">{displayName(member)}</div>
            {c.alias && <div className="truncate text-xs italic text-gold-300">“{c.alias}”</div>}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2">
          <RankBadge rank={rank} />
          <StatusPill status={c.characterStatus} />
        </div>
      </div>
    </MemberName>
  );
}

function ListRow({ member, rank }: { member: Member; rank: Rank }) {
  const { memberById } = useHub();
  const c = member.character ?? {};
  const boss = member.reportsTo ? memberById.get(member.reportsTo) : null;
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <MemberName id={member.id}>
        <Avatar member={member} size="sm" />
      </MemberName>
      <div className="min-w-0 flex-1">
        <MemberName id={member.id} />
        {c.alias && <span className="ml-2 text-xs italic text-gold-300/80">“{c.alias}”</span>}
        <div className="text-xs text-smoke">@{member.username}</div>
      </div>
      <div className="hidden w-40 truncate text-sm text-smoke md:block">{c.specialty || '—'}</div>
      <div className="hidden w-40 text-sm lg:block">{boss ? <MemberName id={boss.id} className="text-sm" /> : <span className="text-smoke">—</span>}</div>
      <div className="hidden w-28 sm:block">
        <StatusPill status={c.characterStatus} />
      </div>
      <RankBadge rank={rank} />
    </div>
  );
}

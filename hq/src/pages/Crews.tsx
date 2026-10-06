import { Crown, Plus, Search, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Avatar, AvatarStack } from '../components/Avatar';
import { CrewChip, RankBadge } from '../components/Badges';
import { CrewEmblem } from '../components/CrewEmblem';
import { CrewForm } from '../components/CrewForm';
import { Empty } from '../components/Field';
import { PageHeader, Tabs } from '../components/Page';
import { useHub } from '../hooks/useHub';
import { ago } from '../lib/format';
import type { Crew } from '../lib/types';

function CrewCard({ crew }: { crew: Crew }) {
  const { memberById, me, isOnline } = useHub();
  const members = crew.memberIds.map((id) => memberById.get(id)).filter((m) => m && m.status === 'active') as NonNullable<
    ReturnType<typeof memberById.get>
  >[];
  const leader = crew.leaderId ? memberById.get(crew.leaderId) : undefined;
  const online = members.filter((m) => isOnline(m.id)).length;
  const mine = crew.memberIds.includes(me.id);
  return (
    <Link
      to={`/crews/${crew.id}`}
      className="hud group block overflow-hidden transition hover:-translate-y-0.5"
      style={{ boxShadow: `inset 0 3px 0 ${crew.color}` }}
    >
      <div className="flex items-start gap-4 p-4">
        <CrewEmblem crew={crew} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display text-lg font-bold text-gold-100 group-hover:text-gold-200">{crew.name}</h3>
            {mine && <span className="chip bg-gold-400/15 text-gold-300">Yours</span>}
          </div>
          {crew.motto && <p className="truncate text-sm text-smoke italic">“{crew.motto}”</p>}
          <p className="mt-2 flex items-center gap-1.5 text-sm text-ash">
            <Crown className="size-3.5 text-gold-400" />
            {leader ? leader.name : <span className="text-smoke">No leader</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-line-soft px-4 py-2.5">
        <AvatarStack members={members} />
        <span className="font-mono text-xs text-smoke">
          {members.length} {members.length === 1 ? 'member' : 'members'} · <span className="text-ok">{online} on</span>
        </span>
      </div>
    </Link>
  );
}

function Roster() {
  const { roster, rankById, crewsOf, crews, isOnline, presence } = useHub();
  const [q, setQ] = useState('');
  const [crewId, setCrewId] = useState('');
  const shown = roster.filter(
    (m) =>
      (!q || m.name.toLowerCase().includes(q.toLowerCase()) || m.alias?.toLowerCase().includes(q.toLowerCase())) &&
      (!crewId || (crewId === 'none' ? !crewsOf(m.id).length : crewsOf(m.id).some((c) => c.id === crewId))),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <label className="relative min-w-48 flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-smoke" />
          <input className="input pl-9" placeholder="Search by name or alias" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <select className="input w-auto" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
          <option value="">All crews</option>
          {crews.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">In no crew</option>
        </select>
      </div>
      <div className="hud divide-y divide-line-soft">
        {shown.map((m) => {
          const on = isOnline(m.id);
          return (
            <Link key={m.id} to={`/members/${m.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
              <Avatar member={m} size="md" online={on} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-hud text-base font-bold text-gold-100">
                  {m.name} {m.alias && <span className="font-sans text-sm font-normal text-smoke">“{m.alias}”</span>}
                </p>
                <p className="text-xs text-smoke">{on ? presence.get(m.id)?.status || 'Online now' : `Last seen ${ago(presence.get(m.id)?.at)}`}</p>
              </div>
              <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                {crewsOf(m.id).map((c) => (
                  <CrewChip key={c.id} crew={c} link={false} />
                ))}
              </div>
              <RankBadge rank={rankById.get(m.rankId ?? '')} />
            </Link>
          );
        })}
        {!shown.length && <p className="px-4 py-6 text-center text-sm text-smoke">Nobody matches.</p>}
      </div>
    </div>
  );
}

export default function Crews() {
  const { crews, can, roster } = useHub();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'crews' | 'roster') ?? 'crews';
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        icon={Users}
        kicker="People"
        title="Crews"
        sub="Every crew in the family and everyone in it. A person can run with more than one crew."
        actions={
          can('manageCrews') && (
            <button className="btn-gold" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New crew
            </button>
          )
        }
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={(t) => setParams(t === 'crews' ? {} : { tab: t })}
          tabs={[
            { id: 'crews', label: `Crews · ${crews.length}` },
            { id: 'roster', label: `Roster · ${roster.length}` },
          ]}
        />
      </div>
      {tab === 'crews' ? (
        crews.length ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {crews.map((c) => (
              <CrewCard key={c.id} crew={c} />
            ))}
          </div>
        ) : (
          <Empty icon={<Users className="size-8" />} title="No crews yet">
            {can('manageCrews') ? 'Create the first crew and pick its leader.' : 'Leadership hasn’t set up any crews yet.'}
          </Empty>
        )
      ) : (
        <Roster />
      )}
      {creating && <CrewForm onClose={() => setCreating(false)} onCreated={(id) => nav(`/crews/${id}`)} />}
    </>
  );
}

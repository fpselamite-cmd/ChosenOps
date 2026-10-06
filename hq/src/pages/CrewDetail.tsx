import { ArrowLeft, Camera, Crosshair, Crown, Pencil, Plus, Swords, Timer, Trash2, UserMinus, Warehouse } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { RankBadge } from '../components/Badges';
import { CrewEmblem } from '../components/CrewEmblem';
import { CrewForm } from '../components/CrewForm';
import { Modal } from '../components/Modal';
import { Panel, Stat } from '../components/Page';
import { useHub } from '../hooks/useHub';
import { addToCrew, deleteCrew, removeFromCrew, setCrewLeader, updateCrew } from '../lib/crews';
import { squareImage } from '../lib/image';

function AddMembers({ crewId, current, onClose }: { crewId: string; current: string[]; onClose: () => void }) {
  const { roster, rankById } = useHub();
  const [q, setQ] = useState('');
  const options = roster.filter((m) => !current.includes(m.id) && m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Add to crew" onClose={onClose}>
      <input className="input mb-3" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {options.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-2 py-1.5">
            <Avatar member={m} />
            <span className="flex-1 font-semibold">{m.name}</span>
            <RankBadge rank={rankById.get(m.rankId ?? '')} />
            <button className="btn-gold btn-sm" onClick={() => addToCrew(crewId, m.id)}>
              <Plus className="size-3.5" /> Add
            </button>
          </li>
        ))}
        {!options.length && <li className="py-4 text-center text-sm text-smoke">Everyone is already in this crew.</li>}
      </ul>
    </Modal>
  );
}

/** What each crew will own as the rest of HQ gets built. */
const COMING = [
  { icon: Warehouse, title: 'Crew ops', text: 'Grows, labs and stash houses this crew runs, with its own stock totals.' },
  { icon: Timer, title: 'Crew timers', text: 'Grow timers, meth cooks and coke runs for this crew, in one strip.' },
  { icon: Crosshair, title: 'Blacksite record', text: 'Wins, losses, rep earned and who showed up.' },
  { icon: Swords, title: 'Crew armory', text: 'Gear this crew holds and the loadouts it runs.' },
];

export default function CrewDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const { crewById, memberById, rankById, me, can, isOnline, roster } = useHub();
  const crew = crewById.get(id);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickLeader, setPickLeader] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!crew) return <Navigate to="/crews" replace />;

  const lead = can('manageCrews');
  const isLeader = crew.leaderId === me.id;
  const manage = lead || isLeader;
  const members = crew.memberIds
    .map((mid) => memberById.get(mid))
    .filter((m): m is NonNullable<typeof m> => !!m && m.status === 'active')
    .sort((a, b) => (a.id === crew.leaderId ? -1 : b.id === crew.leaderId ? 1 : (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99)));
  const leader = crew.leaderId ? memberById.get(crew.leaderId) : undefined;

  async function onEmblem(file?: File) {
    if (!file || !crew) return;
    await updateCrew(crew.id, { emblem: await squareImage(file, 192) });
  }

  return (
    <>
      <Link to="/crews" className="label mb-4 inline-flex items-center gap-1.5 hover:text-gold-300">
        <ArrowLeft className="size-3.5" /> All crews
      </Link>

      {/* Banner */}
      <section
        className="hud mb-6 overflow-hidden"
        style={{ background: `linear-gradient(120deg, ${crew.color}26, transparent 55%), linear-gradient(180deg, #18181a, #0e0e0f)` }}
      >
        <div className="scanlines flex flex-wrap items-center gap-5 p-5 sm:p-6">
          <div className="relative">
            <CrewEmblem crew={crew} size="lg" />
            {manage && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute -right-1 -bottom-1 rounded-full bg-gold-400 p-1.5 text-void shadow"
                  title="Change emblem"
                >
                  <Camera className="size-3.5" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onEmblem(e.target.files?.[0])} />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="label" style={{ color: crew.color }}>
              Crew · {crew.tag}
            </p>
            <h1 className="foil font-display text-3xl font-bold sm:text-4xl">{crew.name}</h1>
            {crew.motto && <p className="mt-1 text-ash italic">“{crew.motto}”</p>}
            <p className="mt-2 flex items-center gap-1.5 text-sm">
              <Crown className="size-4 text-gold-400" />
              <span className="label">Leader</span>
              {leader ? (
                <Link to={`/members/${leader.id}`} className="font-semibold text-gold-100 hover:underline">
                  {leader.name}
                </Link>
              ) : (
                <span className="text-smoke">None yet</span>
              )}
              {lead && (
                <button className="ml-1 text-xs text-gold-400 hover:underline" onClick={() => setPickLeader(true)}>
                  change
                </button>
              )}
            </p>
          </div>
          {manage && (
            <div className="flex gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </button>
              {lead && (
                <button
                  className="btn-danger btn-sm"
                  onClick={async () => {
                    if (confirm(`Disband ${crew.name}? Its members stay in the family.`)) {
                      await deleteCrew(crew.id);
                      nav('/crews');
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Disband
                </button>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Members" value={members.length} />
        <Stat label="Online now" value={<span className="text-ok">{members.filter((m) => isOnline(m.id)).length}</span>} />
        <Stat label="Blacksite wins" value="—" sub="Step 5" />
        <Stat label="Ops run" value="—" sub="Step 2" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Panel
          title={`Members · ${members.length}`}
          right={
            manage && (
              <button className="btn-gold btn-sm" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" /> Add
              </button>
            )
          }
          pad={false}
        >
          <ul className="divide-y divide-line-soft">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                <Avatar member={m} online={isOnline(m.id)} ring={m.id === crew.leaderId ? crew.color : undefined} />
                <Link to={`/members/${m.id}`} className="min-w-0 flex-1 truncate font-semibold text-gold-100 hover:underline">
                  {m.name}
                </Link>
                {m.id === crew.leaderId && (
                  <span className="chip text-void" style={{ background: crew.color }}>
                    <Crown className="size-3" /> Leader
                  </span>
                )}
                <RankBadge rank={rankById.get(m.rankId ?? '')} />
                {manage && m.id !== crew.leaderId && (
                  <button className="p-1 text-smoke hover:text-red-300" title="Remove from crew" onClick={() => removeFromCrew(crew.id, m.id)}>
                    <UserMinus className="size-4" />
                  </button>
                )}
              </li>
            ))}
            {!members.length && <li className="px-4 py-6 text-center text-sm text-smoke">Nobody in this crew yet.</li>}
          </ul>
        </Panel>

        <div className="space-y-3">
          {COMING.map((c) => (
            <div key={c.title} className="hud flex gap-3 p-4 opacity-75">
              <c.icon className="mt-0.5 size-5 shrink-0" style={{ color: crew.color }} />
              <div>
                <p className="font-hud font-bold text-gold-200">{c.title}</p>
                <p className="text-sm text-smoke">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {editing && <CrewForm crew={crew} onClose={() => setEditing(false)} />}
      {adding && <AddMembers crewId={crew.id} current={crew.memberIds} onClose={() => setAdding(false)} />}
      {pickLeader && (
        <Modal title="Pick the crew leader" onClose={() => setPickLeader(false)}>
          <ul className="max-h-96 space-y-1 overflow-y-auto">
            {roster.map((m) => (
              <li key={m.id}>
                <button
                  className={`flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-white/[0.04] ${m.id === crew.leaderId ? 'bg-gold-400/10' : ''}`}
                  onClick={async () => {
                    await setCrewLeader(crew.id, m.id);
                    setPickLeader(false);
                  }}
                >
                  <Avatar member={m} />
                  <span className="flex-1 font-semibold">{m.name}</span>
                  <RankBadge rank={rankById.get(m.rankId ?? '')} />
                </button>
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </>
  );
}

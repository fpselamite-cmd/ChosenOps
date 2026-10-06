import { Camera, Crown, KeyRound, Pencil, Plus, Trash2, UserMinus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { addToCrew, deleteCrew, removeFromCrew, setCrewLeader, updateCrew } from '../lib/crews';
import { squareImage } from '../lib/image';
import { PAGES, type Crew, type PageId } from '../lib/types';
import { Avatar } from './Avatar';
import { RankBadge } from './Badges';
import { CrewEmblem } from './CrewEmblem';
import { CrewForm } from './CrewForm';
import { Modal } from './Modal';

function PickMember({ title, exclude, onPick, onClose }: { title: string; exclude: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const { roster, rankById } = useHub();
  const [q, setQ] = useState('');
  const options = roster.filter((m) => !exclude.includes(m.id) && m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title={title} onClose={onClose}>
      <input className="input mb-3" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {options.map((m) => (
          <li key={m.id}>
            <button className="flex w-full items-center gap-3 px-2 py-1.5 text-left hover:bg-white/[0.04]" onClick={() => onPick(m.id)}>
              <Avatar member={m} />
              <span className="flex-1 font-semibold">{m.name}</span>
              <RankBadge rank={rankById.get(m.rankId ?? '')} />
            </button>
          </li>
        ))}
        {!options.length && <li className="py-4 text-center text-sm text-smoke">Nobody left to add.</li>}
      </ul>
    </Modal>
  );
}

/** Everything about one crew: its role (pages it unlocks), leader and members. */
export function CrewPanel({ crew, onClose }: { crew: Crew; onClose: () => void }) {
  const { memberById, rankById, me, can, isOnline } = useHub();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pickLeader, setPickLeader] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const lead = can('manageCrews');
  const manage = lead || crew.leaderId === me.id;
  const members = crew.memberIds
    .map((id) => memberById.get(id))
    .filter((m): m is NonNullable<typeof m> => !!m && m.status === 'active')
    .sort((a, b) =>
      a.id === crew.leaderId ? -1 : b.id === crew.leaderId ? 1 : (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99),
    );
  const unlocks = (Object.keys(PAGES) as PageId[]).filter((p) => crew.pages?.[p]);

  if (editing) return <CrewForm crew={crew} onClose={() => setEditing(false)} />;
  if (adding)
    return <PickMember title={`Add to ${crew.name}`} exclude={crew.memberIds} onPick={(id) => addToCrew(crew.id, id)} onClose={() => setAdding(false)} />;
  if (pickLeader)
    return (
      <PickMember
        title="Pick the crew leader"
        exclude={crew.leaderId ? [crew.leaderId] : []}
        onPick={async (id) => {
          await setCrewLeader(crew.id, id);
          setPickLeader(false);
        }}
        onClose={() => setPickLeader(false)}
      />
    );

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span className="flex items-center gap-3">
          <span className="relative">
            <CrewEmblem crew={crew} />
            {manage && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute -right-1 -bottom-1 rounded-full bg-gold-400 p-1 text-void"
                  title="Change emblem"
                >
                  <Camera className="size-3" />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => e.target.files?.[0] && updateCrew(crew.id, { emblem: await squareImage(e.target.files[0], 192) })}
                />
              </>
            )}
          </span>
          <span>
            {crew.name}
            {crew.motto && <span className="block font-sans text-sm font-normal text-smoke italic">“{crew.motto}”</span>}
          </span>
        </span>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Crown className="size-4 text-gold-400" />
          <span className="label">Leader</span>
          {crew.leaderId && memberById.get(crew.leaderId) ? (
            <Link to={`/members/${crew.leaderId}`} className="font-semibold text-gold-100 hover:underline">
              {memberById.get(crew.leaderId)!.name}
            </Link>
          ) : (
            <span className="text-smoke">None yet</span>
          )}
          {lead && (
            <button className="text-xs text-gold-400 hover:underline" onClick={() => setPickLeader(true)}>
              change
            </button>
          )}
          {manage && (
            <span className="ml-auto flex gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </button>
              {lead && (
                <button
                  className="btn-danger btn-sm"
                  onClick={async () => {
                    if (confirm(`Disband ${crew.name}? Its members stay in the family.`)) {
                      await deleteCrew(crew.id);
                      onClose();
                    }
                  }}
                >
                  <Trash2 className="size-3.5" /> Disband
                </button>
              )}
            </span>
          )}
        </div>

        <div className="border border-line-soft bg-coal/60 p-3">
          <p className="label mb-2 flex items-center gap-1.5">
            <KeyRound className="size-3.5" /> Being in this crew unlocks
          </p>
          {unlocks.length ? (
            <div className="flex flex-wrap gap-1.5">
              {unlocks.map((p) => (
                <span key={p} className="chip text-void" style={{ background: crew.color }}>
                  {PAGES[p]}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-smoke">No extra pages. Members see what their rank allows.</p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="label">Members · {members.length}</p>
            {manage && (
              <button className="btn-gold btn-sm" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" /> Add
              </button>
            )}
          </div>
          <ul className="divide-y divide-line-soft border border-line-soft">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
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
            {!members.length && <li className="px-3 py-5 text-center text-sm text-smoke">Nobody in this crew yet.</li>}
          </ul>
        </div>
      </div>
    </Modal>
  );
}

import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { MemberName } from '../../components/MemberName';
import { RankBadge } from '../../components/RankBadge';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { displayName } from '../../lib/format';
import type { Member } from '../../lib/types';

export default function MembersTab() {
  const { members, rankById } = useHub();
  const [showSuspended, setShowSuspended] = useState(false);
  const list = members
    .filter((m) => m.status === 'active' || (showSuspended && m.status === 'suspended'))
    .sort((a, b) => (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99) || displayName(a).localeCompare(displayName(b)));

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm text-smoke">
        <input type="checkbox" checked={showSuspended} onChange={(e) => setShowSuspended(e.target.checked)} className="accent-gold-400" />
        Show suspended / denied
      </label>
      <div className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-smoke">
            <tr>
              <th className="px-5 py-2 font-medium">Member</th>
              <th className="px-3 py-2 font-medium">Rank</th>
              <th className="px-3 py-2 font-medium">Reports to</th>
              <th className="px-3 py-2 font-medium">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {list.map((m) => (
              <MemberRow key={m.id} member={m} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  const { ranks, rankById, outranks, members } = useHub();
  const [error, setError] = useState('');
  const editable = outranks(member.rankId);
  const rank = member.rankId ? rankById.get(member.rankId) : null;
  const bosses = members.filter((m) => m.status === 'active' && m.id !== member.id && (rankById.get(m.rankId ?? '')?.order ?? 99) <= (rank?.order ?? 99));

  const save = async (patch: Partial<Member>) => {
    setError('');
    try {
      await updateDoc(doc(db, 'users', member.id), patch);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <tr className={member.status === 'suspended' ? 'opacity-50' : ''}>
      <td className="px-5 py-2">
        <div className="flex items-center gap-3">
          <Avatar member={member} size="sm" />
          <div>
            <MemberName id={member.id} />
            <div className="text-xs text-smoke">@{member.username}</div>
            {error && <div className="text-xs text-red-400">{error}</div>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <select className="input w-44" value={member.rankId ?? ''} onChange={(e) => save({ rankId: e.target.value })}>
            {ranks
              .filter((r) => outranks(r.id))
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        ) : (
          <RankBadge rank={rank} />
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          <select className="input w-44" value={member.reportsTo ?? ''} onChange={(e) => save({ reportsTo: e.target.value || null })}>
            <option value="">— Nobody —</option>
            {bosses.map((b) => (
              <option key={b.id} value={b.id}>
                {displayName(b)}
              </option>
            ))}
          </select>
        ) : member.reportsTo ? (
          <MemberName id={member.reportsTo} />
        ) : (
          <span className="text-smoke">—</span>
        )}
      </td>
      <td className="px-3 py-2">
        {editable ? (
          member.status === 'active' ? (
            <button className="btn-danger px-3 py-1 text-xs" onClick={() => confirm(`Suspend ${displayName(member)}? They'll lose hub access.`) && save({ status: 'suspended' })}>
              Suspend
            </button>
          ) : (
            <button
              className="btn-ghost px-3 py-1 text-xs"
              onClick={() => save({ status: 'active', rankId: member.rankId ?? ranks.filter((r) => outranks(r.id)).at(-1)?.id ?? null })}
            >
              Reinstate
            </button>
          )
        ) : (
          <span className="text-xs text-smoke">Above your pay grade</span>
        )}
      </td>
    </tr>
  );
}

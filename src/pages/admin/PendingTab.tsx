import { doc, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Empty } from '../../components/Field';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { formatDate } from '../../lib/format';
import type { Member } from '../../lib/types';

export default function PendingTab() {
  const { members } = useHub();
  const pending = members.filter((m) => m.status === 'pending');
  if (!pending.length) return <Empty>No one waiting at the door.</Empty>;
  return (
    <div className="panel divide-y divide-edge">
      {pending.map((m) => (
        <PendingRow key={m.id} member={m} />
      ))}
    </div>
  );
}

function PendingRow({ member }: { member: Member }) {
  const { ranks, outranks } = useHub();
  const assignable = ranks.filter((r) => outranks(r.id));
  const [rankId, setRankId] = useState(assignable[assignable.length - 1]?.id ?? '');
  const [error, setError] = useState('');

  const act = async (status: 'active' | 'suspended') => {
    setError('');
    try {
      await updateDoc(doc(db, 'users', member.id), status === 'active' ? { status, rankId } : { status });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-4 px-5 py-4">
      <Avatar member={member} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">@{member.username}</div>
        <div className="text-xs text-smoke">Requested {formatDate(member.joinedAt, true)}</div>
        {error && <div className="text-xs text-red-400">{error}</div>}
      </div>
      <select className="input w-48" value={rankId} onChange={(e) => setRankId(e.target.value)}>
        {assignable.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <button className="btn-gold" disabled={!rankId} onClick={() => act('active')}>
        Vouch & approve
      </button>
      <button className="btn-danger" onClick={() => confirm(`Turn away @${member.username}?`) && act('suspended')}>
        Deny
      </button>
    </div>
  );
}

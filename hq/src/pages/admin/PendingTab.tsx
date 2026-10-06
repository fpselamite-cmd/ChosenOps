import { Check, UserX } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Empty } from '../../components/Field';
import { useHub } from '../../hooks/useHub';
import { ago } from '../../lib/format';
import { approveMember, setStatus } from '../../lib/members';
import { outranks } from '../../lib/permissions';

export default function PendingTab() {
  const { members, ranks, myRank } = useHub();
  const pending = members.filter((m) => m.status === 'pending');
  const grantable = ranks.filter((r) => outranks(myRank, r));
  const [pick, setPick] = useState<Record<string, string>>({});
  const lowest = grantable[grantable.length - 1]?.id ?? '';

  if (!pending.length) return <Empty title="Nobody at the door">New sign-ups show up here for approval.</Empty>;
  return (
    <div className="hud divide-y divide-line-soft">
      {pending.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Avatar member={m} size="md" />
          <div className="min-w-0 flex-1">
            <p className="font-hud text-base font-bold text-gold-100">{m.name}</p>
            <p className="text-xs text-smoke">Asked {ago(m.joinedAt)}</p>
          </div>
          <select className="input w-auto" value={pick[m.id] ?? lowest} onChange={(e) => setPick({ ...pick, [m.id]: e.target.value })}>
            {grantable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <button className="btn-gold btn-sm" disabled={!grantable.length} onClick={() => approveMember(m.id, pick[m.id] ?? lowest)}>
            <Check className="size-3.5" /> Let in
          </button>
          <button className="btn-danger btn-sm" onClick={() => setStatus(m.id, 'suspended')}>
            <UserX className="size-3.5" /> Turn away
          </button>
        </div>
      ))}
    </div>
  );
}

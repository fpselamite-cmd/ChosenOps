import { Check, MessageSquareHeart, UserX } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Empty } from '../../components/Field';
import { useHub } from '../../hooks/useHub';
import { feed, sendWelcome } from '../../lib/adminData';
import { ago } from '../../lib/format';
import { approveMember, setReportsTo, setStatus } from '../../lib/members';

/** Newcomers at the door: leadership and admins pick a starting rank, who they answer to, and can leave a welcome note. */
export default function PendingTab() {
  const { me, members, ranks, roster, actsOn } = useHub();
  const pending = members.filter((m) => m.status === 'pending');
  const grantable = ranks.filter((r) => actsOn(r));
  const lowest = grantable[grantable.length - 1]?.id ?? '';
  const [pick, setPick] = useState<Record<string, { rank?: string; boss?: string; note?: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const set = (id: string, p: { rank?: string; boss?: string; note?: string }) => setPick((x) => ({ ...x, [id]: { ...x[id], ...p } }));

  if (!pending.length) return <Empty title="Nobody at the door">New sign-ups show up here for approval.</Empty>;
  return (
    <div className="hud divide-y divide-line-soft">
      {pending.map((m) => {
        const p = pick[m.id] ?? {};
        const rankId = p.rank ?? lowest;
        return (
          <div key={m.id} className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar member={m} size="md" />
              <div className="min-w-0 flex-1">
                <p className="font-hud text-base font-bold text-gold-100">{m.name}</p>
                <p className="text-xs text-smoke">Asked {ago(m.joinedAt)}</p>
              </div>
              <label className="text-xs text-smoke">
                Starting rank
                <select className="input mt-1 w-auto" value={rankId} onChange={(e) => set(m.id, { rank: e.target.value })}>
                  {grantable.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-smoke">
                Answers to
                <select className="input mt-1 w-auto" value={p.boss ?? ''} onChange={(e) => set(m.id, { boss: e.target.value })}>
                  <option value="">Nobody yet</option>
                  {roster.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="relative min-w-[16rem] flex-1">
                <MessageSquareHeart className="absolute top-2.5 left-3 size-4 text-gold-600" />
                <input className="input pl-9" placeholder="Welcome note (optional): shows on their first Dashboard" maxLength={300} value={p.note ?? ''} onChange={(e) => set(m.id, { note: e.target.value })} />
              </label>
              <button
                className="btn-gold btn-sm"
                disabled={!grantable.length || busy === m.id}
                onClick={async () => {
                  setBusy(m.id);
                  try {
                    await approveMember(m.id, rankId);
                    if (p.boss) await setReportsTo(m.id, p.boss).catch(() => {});
                    if (p.note?.trim()) await sendWelcome(me, m.id, p.note).catch(() => {});
                    void feed(me, 'join', `Let ${m.name} in as ${ranks.find((r) => r.id === rankId)?.name ?? rankId}`, { target: m.id });
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <Check className="size-3.5" /> Let in
              </button>
              <button
                className="btn-danger btn-sm"
                onClick={() => setStatus(m.id, 'suspended').then(() => feed(me, 'status', `Turned ${m.name} away at the door`, { target: m.id }))}
              >
                <UserX className="size-3.5" /> Turn away
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

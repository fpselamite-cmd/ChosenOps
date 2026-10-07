import { KeyRound, Search } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { CrewChip, RankBadge } from '../../components/Badges';
import { Modal } from '../../components/Modal';
import { useHub } from '../../hooks/useHub';
import { issueResetCode } from '../../lib/auth';
import { fmtTime } from '../../lib/format';
import { setRank, setReportsTo, setStatus } from '../../lib/members';
import type { Member } from '../../lib/types';

function ResetPin({ m, onClose }: { m: Member; onClose: () => void }) {
  const { me } = useHub();
  const [result, setResult] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Reset ${m.name}'s PIN`} onClose={onClose}>
      {result ? (
        <div className="space-y-4">
          <p className="text-ash">Give {m.name} this code. They enter it under “Forgot your PIN?” on the sign-in page and pick a new PIN.</p>
          <p className="hud py-4 text-center font-mono text-3xl tracking-[0.3em] text-gold-200">{result.code}</p>
          <p className="text-sm text-smoke">Works once, until {fmtTime(result.expiresAt)} tomorrow. Making a new code cancels this one.</p>
          <button className="btn-gold" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-ash">This makes a one-time reset code. Their old PIN keeps working until they use it.</p>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <button
            className="btn-gold"
            onClick={() =>
              issueResetCode(m.id, me.id).then(setResult, () => setError('Could not make a code. You may not have permission.'))
            }
          >
            <KeyRound className="size-4" /> Make reset code
          </button>
        </div>
      )}
    </Modal>
  );
}

export default function MembersTab() {
  const { members, ranks, rankById, actsOn, me, can, crewsOf, roster } = useHub();
  const [q, setQ] = useState('');
  const [resetting, setResetting] = useState<Member | null>(null);
  const grantable = ranks.filter((r) => actsOn(r));
  const list = members
    .filter((m) => m.status !== 'pending' && m.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99) || a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <label className="relative block max-w-sm">
        <Search className="absolute top-2.5 left-3 size-4 text-smoke" />
        <input className="input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="hud overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="label border-b border-line text-left">
              <th className="px-4 py-2.5">Member</th>
              <th className="px-2">Rank</th>
              <th className="px-2">Answers to</th>
              <th className="px-2">Status</th>
              <th className="px-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {list.map((m) => {
              const rank = rankById.get(m.rankId ?? '');
              const below = m.id !== me.id && actsOn(rank);
              const manage = below && can('manageMembers');
              return (
                <tr key={m.id} className={m.status === 'suspended' ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar member={m} />
                      <span>
                        <span className="block font-semibold text-gold-100">{m.name}</span>
                        <span className="flex gap-1">
                          {crewsOf(m.id).map((c) => (
                            <CrewChip key={c.id} crew={c} link={false} />
                          ))}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-2">
                    {manage ? (
                      <select className="input py-1" value={m.rankId ?? ''} onChange={(e) => setRank(m.id, e.target.value, (rankById.get(e.target.value)?.order ?? 99) < (rankById.get(m.rankId ?? '')?.order ?? 99))}>
                        {grantable.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <RankBadge rank={rank} />
                    )}
                  </td>
                  <td className="px-2">
                    {manage ? (
                      <select className="input py-1" value={m.reportsTo ?? ''} onChange={(e) => setReportsTo(m.id, e.target.value || null)}>
                        <option value="">Nobody</option>
                        {roster
                          .filter((x) => x.id !== m.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="text-ash">{members.find((x) => x.id === m.reportsTo)?.name ?? '—'}</span>
                    )}
                  </td>
                  <td className="px-2">
                    {manage ? (
                      <select className="input py-1" value={m.status} onChange={(e) => setStatus(m.id, e.target.value as Member['status'])}>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    ) : (
                      <span className="capitalize text-ash">{m.status}</span>
                    )}
                  </td>
                  <td className="px-4 text-right">
                    {below && can('resetPins') && (
                      <button className="btn-ghost btn-sm" onClick={() => setResetting(m)}>
                        <KeyRound className="size-3.5" /> Reset PIN
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {resetting && <ResetPin m={resetting} onClose={() => setResetting(null)} />}
    </div>
  );
}

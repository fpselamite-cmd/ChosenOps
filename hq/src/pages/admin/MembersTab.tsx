import { doc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { AlertTriangle, Eye, GitMerge, KeyRound, Pencil, Search, Trash2, Wrench } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { RankBadge } from '../../components/Badges';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { deleteMember, feed, mergeMembers, previewMember } from '../../lib/adminData';
import { issueResetCode } from '../../lib/auth';
import { db } from '../../lib/firebase';
import { fmtTime } from '../../lib/format';
import { setRank, setReportsTo, setStatus } from '../../lib/members';
import { addMyCash } from '../../lib/money';
import type { Streak } from '../../lib/streak';
import type { Member } from '../../lib/types';

function ResetPin({ m }: { m: Member }) {
  const { me } = useHub();
  const [result, setResult] = useState<{ code: string; expiresAt: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  return result ? (
    <div className="space-y-2">
      <p className="text-sm text-ash">Give {m.name} this code. They enter it under “Forgot your PIN?” on the sign-in page and pick a new PIN.</p>
      <p className="hud py-3 text-center font-mono text-3xl tracking-[0.3em] text-gold-200">{result.code}</p>
      <p className="text-xs text-smoke">Works once, until {fmtTime(result.expiresAt)} tomorrow. Making a new code cancels this one.</p>
    </div>
  ) : (
    <div className="space-y-2">
      <p className="text-sm text-ash">Makes a one-time reset code. Their old PIN keeps working until they use it.</p>
      {error && <p className="text-sm text-red-300">{error}</p>}
      <button className="btn-gold btn-sm" onClick={() => issueResetCode(m.id, me.id).then(setResult, () => setError('Could not make a code. You may not have permission.'))}>
        <KeyRound className="size-3.5" /> Make reset code
      </button>
    </div>
  );
}

/** Every admin fix asks why (it goes in the Activity feed), unless it's pushed through quietly. */
function useFixTrail() {
  const [reason, setReason] = useState('');
  const [quiet, setQuiet] = useState(false);
  const ok = quiet || reason.trim().length >= 3;
  const ui = (
    <div className="flex flex-wrap items-end gap-3 border-t border-line-soft pt-3">
      <label className="min-w-[14rem] flex-1">
        <span className="label mb-1 block">Why</span>
        <input className="input" placeholder="e.g. Logged twice by mistake" maxLength={140} value={reason} onChange={(e) => setReason(e.target.value)} disabled={quiet} />
      </label>
      <label className="flex items-center gap-2 pb-2 text-xs text-smoke">
        <input type="checkbox" checked={quiet} onChange={(e) => setQuiet(e.target.checked)} /> Quiet fix (not in the feed)
      </label>
    </div>
  );
  return { ok, reason: reason.trim(), quiet, ui, reset: () => setReason('') };
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 border border-line-soft p-3">
      <p className="label flex items-center gap-2 text-gold-300">
        {icon} {title}
      </p>
      {children}
    </section>
  );
}

function FixData({ m }: { m: Member }) {
  const { me } = useHub();
  const petty = useDoc<{ rep?: number }>(`petty/${m.id}`);
  const streak = useDoc<Streak>(`streaks/${m.id}`);
  const stats = useDoc<Record<string, number>>(`stats/${m.id}`);
  const trail = useFixTrail();
  const [rep, setRep] = useState('');
  const [dirty, setDirty] = useState('');
  const [clean, setClean] = useState('');
  const [cur, setCur] = useState('');
  const [best, setBest] = useState('');
  const [st, setSt] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const num = (v: string) => Math.round(Number(v.replace(/[^0-9-]/g, '')) || 0);
  const done = async (what: string) => {
    if (!trail.quiet) await feed(me, 'fix', `Fixed ${m.name}'s ${what}`, { target: m.id, reason: trail.reason });
    setMsg(`Saved: ${what}.`);
    trail.reset();
  };
  const run = (what: string, fn: () => Promise<unknown>) => () => {
    if (!trail.ok) return setMsg('Say why first, or tick Quiet fix.');
    setMsg('');
    fn().then(() => done(what), () => setMsg('That didn’t save. You may not have permission.'));
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <p className="label">Petty rep · now {(petty?.rep ?? 0).toLocaleString()}</p>
          <div className="flex gap-2">
            <input className="input font-mono" inputMode="numeric" placeholder="New total" value={rep} onChange={(e) => setRep(e.target.value)} />
            <button className="btn-ghost btn-sm" disabled={!rep} onClick={run(`petty rep (${petty?.rep ?? 0} → ${num(rep)})`, () => setDoc(doc(db, 'petty', m.id), { rep: Math.max(0, num(rep)) }, { merge: true }))}>
              Set
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="label">Locker cash · add or take (use − to take)</p>
          <div className="flex gap-2">
            <input className="input font-mono" placeholder="Dirty $" value={dirty} onChange={(e) => setDirty(e.target.value)} />
            <input className="input font-mono" placeholder="Clean $" value={clean} onChange={(e) => setClean(e.target.value)} />
            <button className="btn-ghost btn-sm" disabled={!dirty && !clean} onClick={run(`locker cash (dirty ${num(dirty)}, clean ${num(clean)})`, () => addMyCash(m.id, num(dirty), num(clean), `Admin fix${trail.reason ? `: ${trail.reason}` : ''}`))}>
              Add
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="label">
            Daily streak · now {streak?.current ?? 0} (best {streak?.best ?? 0})
          </p>
          <div className="flex gap-2">
            <input className="input font-mono" placeholder="Current" value={cur} onChange={(e) => setCur(e.target.value)} />
            <input className="input font-mono" placeholder="Best" value={best} onChange={(e) => setBest(e.target.value)} />
            <button
              className="btn-ghost btn-sm"
              disabled={!cur && !best}
              onClick={run('daily streak', () => {
                const c = cur ? num(cur) : (streak?.current ?? 0);
                const b = Math.max(c, best ? num(best) : (streak?.best ?? 0));
                return setDoc(doc(db, 'streaks', m.id), { current: Math.max(0, c), best: b, last: streak?.last ?? '', freezes: streak?.freezes ?? {}, at: serverTimestamp() }, { merge: true });
              })}
            >
              Set
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="label">NoelOps work stats</p>
          <div className="grid grid-cols-4 gap-1.5">
            {['harvests', 'pressed', 'cooks', 'runs'].map((k) => (
              <input key={k} className="input px-2 font-mono text-xs" placeholder={`${k} ${stats?.[k] ?? 0}`} value={st[k] ?? ''} onChange={(e) => setSt({ ...st, [k]: e.target.value })} title={k} />
            ))}
          </div>
          <button
            className="btn-ghost btn-sm"
            disabled={!Object.values(st).some(Boolean)}
            onClick={run('work stats', () => setDoc(doc(db, 'stats', m.id), Object.fromEntries(Object.entries(st).filter(([, v]) => v).map(([k, v]) => [k, Math.max(0, num(v))])), { merge: true }))}
          >
            Set stats
          </button>
        </div>
      </div>
      <p className="text-xs text-smoke">
        Trophies: give or take them on{' '}
        <Link to={`/members/${m.id}?view=trophies`} className="text-gold-300 hover:underline">
          {m.name}’s Trophy Wall
        </Link>
        . Blacksite K/D comes from the fight records: fix it on the fight itself.
      </p>
      {trail.ui}
      {msg && <p className="text-sm text-gold-300">{msg}</p>}
    </div>
  );
}

function Rename({ m }: { m: Member }) {
  const { me, members } = useHub();
  const [name, setName] = useState(m.name);
  const [msg, setMsg] = useState('');
  const clean = name.trim().replace(/\s+/g, ' ');
  const taken = members.some((x) => x.id !== m.id && x.name.toLowerCase() === clean.toLowerCase());
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input" value={name} maxLength={30} onChange={(e) => (setName(e.target.value), setMsg(''))} />
        <button
          className="btn-gold btn-sm"
          disabled={clean.length < 2 || clean === m.name || taken}
          onClick={async () => {
            const b = writeBatch(db);
            b.update(doc(db, 'members', m.id), { name: clean, nameLower: clean.toLowerCase() });
            b.set(doc(db, 'names', clean.toLowerCase()), { uid: m.id, v: 0 });
            try {
              await b.commit();
              void feed(me, 'fix', `Renamed ${m.name} to ${clean}`, { target: m.id });
              setMsg('Renamed.');
            } catch {
              setMsg('That name is taken, or you can’t rename them.');
            }
          }}
        >
          Rename
        </button>
      </div>
      {taken && <p className="text-xs text-red-300">Someone already has that name.</p>}
      <p className="text-xs text-smoke">Their display name changes everywhere now. They keep signing in with their old name until they use a PIN reset code with the new one.</p>
      {msg && <p className="text-sm text-gold-300">{msg}</p>}
    </div>
  );
}

function DangerZone({ m, onDone, startDelete }: { m: Member; onDone: () => void; startDelete?: boolean }) {
  const { me, members, isOwner } = useHub();
  const [mode, setMode] = useState<'merge' | 'delete' | null>(null);
  const [into, setInto] = useState('');
  const [typed, setTyped] = useState('');
  const [preview, setPreview] = useState<{ label: string; n: number }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const target = members.find((x) => x.id === into);
  const start = (k: 'merge' | 'delete') => {
    setMode(k);
    setTyped('');
    setPreview(null);
    previewMember(m.id).then(setPreview, () => setPreview([]));
  };
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!startDelete) return;
    start('delete');
    setTimeout(() => box.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={box} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {isOwner && (
          <button className="btn-ghost btn-sm" onClick={() => start('merge')}>
            <GitMerge className="size-3.5" /> Merge into another account
          </button>
        )}
        <button className="btn-danger btn-sm" onClick={() => start('delete')}>
          <Trash2 className="size-3.5" /> Delete account
        </button>
      </div>
      {mode && (
        <div className="space-y-3 border border-red-400/40 bg-red-500/5 p-3">
          {mode === 'merge' && (
            <Field label={`Move ${m.name}'s things to`}>
              <select className="input" value={into} onChange={(e) => setInto(e.target.value)}>
                <option value="">Pick the account to keep…</option>
                {members
                  .filter((x) => x.id !== m.id && x.status !== 'pending')
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <div className="text-sm">
            <p className="label mb-1">{mode === 'merge' ? 'What moves over' : 'What gets deleted'}</p>
            {preview === null ? (
              <p className="text-smoke">Counting…</p>
            ) : preview.length ? (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ash">
                {preview.map((p) => (
                  <li key={p.label}>
                    <b className="font-mono text-gold-100">{p.n}</b> {p.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-smoke">Nothing besides their member file.</p>
            )}
            <p className="mt-1 text-xs text-smoke">
              {mode === 'merge'
                ? 'Petty rep and work stats add up. A locker storage the other account already has is left behind for you to sort by hand. Then this member file is removed.'
                : 'Their member file, name, lockers and everything listed go for good. Their sign-in account stays but has nothing to open.'}
            </p>
          </div>
          <Field label={`Type “${m.name}” to confirm`}>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </Field>
          <button
            className="btn-danger"
            disabled={busy || typed !== m.name || (mode === 'merge' && !target)}
            onClick={async () => {
              setBusy(true);
              setMsg('');
              try {
                if (mode === 'merge' && target) {
                  const r = await mergeMembers(m, target);
                  void feed(me, 'merge', `Merged ${m.name} into ${target.name}`, { target: target.id, reason: r.skipped.length ? `Left behind: ${r.skipped.join(', ')}` : '' });
                } else {
                  await deleteMember(m);
                  void feed(me, 'delete', `Deleted ${m.name}'s account`, { target: m.id });
                }
                onDone();
              } catch {
                setMsg('It stopped partway. Nothing past that point changed; try again or check by hand.');
              } finally {
                setBusy(false);
              }
            }}
          >
            <AlertTriangle className="size-4" /> {mode === 'merge' ? 'Merge' : 'Delete for good'}
          </button>
          {msg && <p className="text-sm text-red-300">{msg}</p>}
        </div>
      )}
    </div>
  );
}

/** Who you can delete: never yourself, the top rank, or an HQ owner; owners and admins only. */
export function useCanDelete() {
  const { isAdmin, isOwner, me, rankById } = useHub();
  const owners = useDoc<{ ids?: string[] }>('meta/owners', isOwner);
  return (m: Member) => m.id !== me.id && (isOwner || (isAdmin && (rankById.get(m.rankId ?? '')?.order ?? 99) > 0 && !(owners?.ids ?? []).includes(m.id)));
}

function MemberTools({ m, onClose, startDelete }: { m: Member; onClose: () => void; startDelete?: boolean }) {
  const { isAdmin, isOwner, can, actsOn, rankById, setPreview, me } = useHub();
  const below = m.id !== me.id && actsOn(rankById.get(m.rankId ?? ''));
  const canDelete = useCanDelete();
  return (
    <Modal title={`Admin · ${m.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost btn-sm" onClick={() => (setPreview({ memberId: m.id }), onClose())}>
              <Eye className="size-3.5" /> View the app as {m.name}
            </button>
            <Link to={`/members/${m.id}`} className="btn-ghost btn-sm">
              Open profile
            </Link>
          </div>
        )}
        {isAdmin && (
          <Section title="Display name" icon={<Pencil className="size-3.5" />}>
            <Rename m={m} />
          </Section>
        )}
        {below && can('resetPins') && (
          <Section title="PIN" icon={<KeyRound className="size-3.5" />}>
            <ResetPin m={m} />
          </Section>
        )}
        {isAdmin && (
          <Section title="Fix their numbers" icon={<Wrench className="size-3.5" />}>
            <FixData m={m} />
          </Section>
        )}
        {canDelete(m) && (
          <Section title={isOwner ? 'Danger zone · owners only' : 'Danger zone'} icon={<AlertTriangle className="size-3.5 text-red-300" />}>
            <DangerZone m={m} onDone={onClose} startDelete={startDelete} />
          </Section>
        )}
      </div>
    </Modal>
  );
}

export default function MembersTab() {
  const { members, ranks, rankById, actsOn, me, can, roster, isAdmin, isOwner } = useHub();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ m: Member; del?: boolean } | null>(null);
  const canDelete = useCanDelete();
  const grantable = ranks.filter((r) => actsOn(r));
  const list = members
    .filter((m) => m.status !== 'pending' && m.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99) || a.name.localeCompare(b.name));
  const log = (text: string, target: string) => void feed(me, 'rank', text, { target });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block max-w-sm flex-1">
          <Search className="absolute top-2.5 left-3 size-4 text-smoke" />
          <input className="input pl-9" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <p className="text-xs text-smoke">Promotions, leave and the like also live on the Family page and each profile.</p>
      </div>
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
              const self = m.id === me.id;
              // Admin is out-of-character: an admin may set their own in-character rank (not the top one).
              const manage = can('manageMembers') && (self ? isAdmin && rank?.order !== 0 : actsOn(rank));
              // Rank alone: an admin can set their own (even stepping off the top rank); owners can set anyone's, top rank included.
              const rankable = manage || isOwner || (self && isAdmin);
              const choices = isOwner ? ranks : [...(rank && !grantable.includes(rank) ? [rank] : []), ...grantable];
              return (
                <tr key={m.id} className={m.status === 'suspended' ? 'opacity-50' : ''}>
                  <td className="px-4 py-2.5">
                    <span className="flex items-center gap-2.5">
                      <Avatar member={m} />
                      <span>
                        <span className="block font-semibold text-gold-100">
                          {m.name} {self && <span className="text-xs text-smoke">(you)</span>}
                        </span>
                        {m.admin && <span className="label text-[9px] text-sky-300">Admin</span>}
                      </span>
                    </span>
                  </td>
                  <td className="px-2">
                    {rankable ? (
                      <select
                        className="input py-1"
                        value={m.rankId ?? ''}
                        onChange={(e) => {
                          if (self && rank?.order === 0 && !isOwner && !confirm(`Step down from ${rank.name}? Only an HQ owner can put someone back at the top rank.`)) return;
                          const up = (rankById.get(e.target.value)?.order ?? 99) < (rankById.get(m.rankId ?? '')?.order ?? 99);
                          void setRank(m.id, e.target.value, up && !self).then(() => log(`${up ? 'Promoted' : 'Moved'} ${m.name} to ${rankById.get(e.target.value)?.name}`, m.id));
                        }}
                      >
                        {choices.map((r) => (
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
                    {manage && !self ? (
                      <select className="input py-1" value={m.status} onChange={(e) => setStatus(m.id, e.target.value as Member['status']).then(() => log(`Set ${m.name} to ${e.target.value}`, m.id))}>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                      </select>
                    ) : (
                      <span className="text-ash capitalize">{m.status}</span>
                    )}
                  </td>
                  <td className="px-4 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      {(isAdmin || can('resetPins')) && (
                        <button className="btn-ghost btn-sm" onClick={() => setOpen({ m })}>
                          <Wrench className="size-3.5" /> Tools
                        </button>
                      )}
                      {canDelete(m) && (
                        <button className="p-1.5 text-smoke hover:text-red-300" onClick={() => setOpen({ m, del: true })} title={`Delete ${m.name}`} aria-label={`Delete ${m.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {open && <MemberTools m={open.m} startDelete={open.del} onClose={() => setOpen(null)} />}
    </div>
  );
}

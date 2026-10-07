import { Award, Crown, Pencil, Plus, Sparkles, Trash2, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { Empty, Field } from '../../components/Field';
import { MemberName } from '../../components/MemberName';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { feed, slugId } from '../../lib/adminData';
import { MOVED, removeRole, saveRole, setMemberRoles, setUpRoles, type Role } from '../../lib/roles';
import { PAGES, PERMISSIONS, type PageId, type Permission } from '../../lib/types';

function RoleEditor({ role, onClose, onDelete }: { role: Role | null; onClose: () => void; onDelete?: () => void }) {
  const { roles, roleById, holders, me } = useHub();
  const [r, setR] = useState<Role>(role ?? { id: '', name: '', order: roles.length, perms: {}, pages: {} });
  const [busy, setBusy] = useState(false);
  const togglePerm = (p: Permission) => setR({ ...r, perms: { ...r.perms, [p]: !r.perms?.[p] } });
  const togglePage = (p: PageId) => setR({ ...r, pages: { ...r.pages, [p]: !r.pages?.[p] } });
  return (
    <Modal title={role ? `Edit ${role.name}` : 'New role'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const clean: Role = {
            ...r,
            id: r.id || `r_${slugId(r.name)}`,
            name: r.name.trim().slice(0, 30),
            perms: r.honor ? {} : Object.fromEntries(Object.entries(r.perms ?? {}).filter(([, v]) => v)),
            pages: r.honor ? {} : Object.fromEntries(Object.entries(r.pages ?? {}).filter(([, v]) => v)),
            lead: !r.honor && !!r.lead,
            honor: !!r.honor,
            note: (r.note ?? '').trim().slice(0, 140),
          };
          await saveRole(clean, holders, roleById);
          void feed(me, 'settings', `${role ? 'Edited' : 'Made'} the ${clean.name} role`);
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name">
            <input className="input" value={r.name} maxLength={30} onChange={(e) => setR({ ...r, name: e.target.value })} required />
          </Field>
          <Field label="What it's for">
            <input className="input" value={r.note ?? ''} maxLength={140} onChange={(e) => setR({ ...r, note: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={!!r.honor} onChange={(e) => setR({ ...r, honor: e.target.checked })} /> Honor only (a badge, no powers)
          </label>
          {!r.honor && (
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!r.lead} onChange={(e) => setR({ ...r, lead: e.target.checked })} /> Counts as leadership (like High Table)
            </label>
          )}
        </div>
        {!r.honor && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="label mb-1.5">Powers</p>
              <div className="space-y-1">
                {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ash">
                    <input type="checkbox" checked={!!r.perms?.[p]} onChange={() => togglePerm(p)} /> {PERMISSIONS[p]}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="label mb-1.5">Pages it opens</p>
              <div className="space-y-1">
                {(Object.keys(PAGES) as PageId[]).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ash">
                    <input type="checkbox" checked={!!r.pages?.[p]} onChange={() => togglePage(p)} /> {PAGES[p]}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-smoke">Adds to whatever their rank already opens.</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {onDelete && (
            <button type="button" className="btn-danger mr-auto" onClick={onDelete}>
              <Trash2 className="size-4" /> Delete role
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy || !r.name.trim()}>
            Save role
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RoleCard({ role, onEdit }: { role: Role; onEdit: () => void }) {
  const { holders, roleById, roster, me } = useHub();
  const [adding, setAdding] = useState('');
  const who = holders.filter((h) => h.roles.includes(role.id));
  const perms = Object.keys(role.perms ?? {}).filter((k) => role.perms?.[k as Permission]) as Permission[];
  const pages = Object.keys(role.pages ?? {}).filter((k) => role.pages?.[k as PageId]) as PageId[];
  const give = async (memberId: string, on: boolean) => {
    const cur = holders.find((h) => h.id === memberId)?.roles ?? [];
    const next = on ? [...new Set([...cur, role.id])] : cur.filter((x) => x !== role.id);
    await setMemberRoles(memberId, next, roleById);
    const name = roster.find((m) => m.id === memberId)?.name ?? 'someone';
    void feed(me, 'rank', `${on ? 'Gave' : 'Took'} ${role.name} ${on ? 'to' : 'from'} ${name}`, { target: memberId });
  };
  return (
    <div className="hud flex flex-col p-4">
      <div className="flex items-start gap-3">
        <span className={`grid size-9 shrink-0 place-items-center border ${role.honor ? 'border-sky-400/50 text-sky-300' : role.lead ? 'border-gold-300 text-gold-200' : 'border-gold-600/50 text-gold-400'}`}>
          {role.honor ? <Award className="size-4" /> : role.lead ? <Crown className="size-4" /> : <Sparkles className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-hud text-lg leading-tight font-bold text-gold-100">{role.name}</p>
          <p className="text-xs text-smoke">{role.honor ? 'Honor' : role.lead ? 'Leadership powers' : `${perms.length} ${perms.length === 1 ? 'power' : 'powers'}${pages.length ? ` · ${pages.length} pages` : ''}`}</p>
        </div>
        <button className="text-smoke hover:text-gold-200" onClick={onEdit} aria-label="Edit">
          <Pencil className="size-4" />
        </button>
      </div>
      {role.note && <p className="mt-2 text-sm text-ash">{role.note}</p>}
      {!role.honor && !role.lead && perms.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-smoke">
          {perms.map((p) => (
            <li key={p}>· {PERMISSIONS[p]}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex-1">
        <p className="label mb-1">Held by · {who.length}</p>
        <ul className="flex flex-wrap gap-1.5">
          {who.map((h) => (
            <li key={h.id} className="flex items-center gap-1.5 rounded-full border border-line-soft py-0.5 pr-1 pl-0.5 text-xs">
              <Avatar member={roster.find((m) => m.id === h.id)} size="xs" />
              <MemberName id={h.id} className="text-xs" />
              <button className="text-smoke hover:text-red-300" onClick={() => give(h.id, false)} aria-label="Take it away">
                <X className="size-3" />
              </button>
            </li>
          ))}
          {!who.length && <li className="text-xs text-smoke">Nobody yet.</li>}
        </ul>
      </div>
      <div className="mt-3 flex gap-2">
        <select className="input py-1 text-sm" value={adding} onChange={(e) => setAdding(e.target.value)}>
          <option value="">Give it to…</option>
          {roster
            .filter((m) => !who.some((h) => h.id === m.id))
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <button className="btn-ghost btn-sm" disabled={!adding} onClick={() => give(adding, true).then(() => setAdding(''))}>
          <UserPlus className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Jobs and honors held on top of rank. Leadership and admins hand them out. */
export default function RolesTab() {
  const { roles, ranks, holders, roleById, me } = useHub();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const jobs = roles.filter((r) => !r.honor);
  const honors = roles.filter((r) => r.honor);
  return (
    <div className="space-y-6">
      {!roles.length ? (
        <Panel title="Set up roles">
          <p className="text-sm text-ash">
            Adds the starting roles (High Table, Welcome Committee, Rep Keeper, Washer, Event Planner, Archivist, and the Enforcer, Cop Killer and Founder honors) and moves these powers off ranks that
            aren’t leadership:
          </p>
          <ul className="my-2 space-y-0.5 text-sm text-smoke">
            {MOVED.map((m) => (
              <li key={m.perm}>
                · {PERMISSIONS[m.perm]} → {m.to}
              </li>
            ))}
          </ul>
          <p className="mb-3 text-xs text-smoke">Leadership ranks and the top rank keep every power. Give the roles out afterwards so nobody loses a job they do today.</p>
          <button
            className="btn-gold"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const changed = await setUpRoles(ranks, roles).catch(() => null);
              setBusy(false);
              if (!changed) return setMsg('That didn’t save. Only leadership with rank editing can do this.');
              void feed(me, 'settings', `Set up roles${changed.length ? `; moved ${changed.join('; ')}` : ''}`);
              setMsg(changed.length ? `Done. Changed: ${changed.join(' · ')}` : 'Done. No rank powers needed moving.');
            }}
          >
            <Sparkles className="size-4" /> Set up roles
          </button>
          {msg && <p className="mt-2 text-sm text-gold-300">{msg}</p>}
        </Panel>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex-1 text-sm text-ash">Roles add powers and pages on top of rank. Honors are just badges. Getting or losing a role is quiet; it shows in Admin → Activity.</p>
            <button className="btn-gold btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-3.5" /> New role
            </button>
          </div>
          {msg && <p className="text-sm text-gold-300">{msg}</p>}
          <section>
            <p className="label mb-2 text-gold-500">Jobs</p>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {jobs.map((r) => (
                <RoleCard key={r.id} role={r} onEdit={() => setEditing(r)} />
              ))}
            </div>
          </section>
          <section>
            <p className="label mb-2 text-gold-500">Honors</p>
            {honors.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {honors.map((r) => (
                  <RoleCard key={r.id} role={r} onEdit={() => setEditing(r)} />
                ))}
              </div>
            ) : (
              <Empty title="No honors">Make a role and tick “Honor only”.</Empty>
            )}
          </section>
        </>
      )}
      {editing && (
        <RoleEditor
          role={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDelete={
            editing === 'new'
              ? undefined
              : async () => {
                  if (!confirm(`Delete the ${editing.name} role? Everyone loses it.`)) return;
                  await removeRole(editing.id, holders, roleById);
                  void feed(me, 'settings', `Deleted the ${editing.name} role`);
                  setEditing(null);
                }
          }
        />
      )}
    </div>
  );
}

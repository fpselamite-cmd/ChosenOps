import { Timestamp } from 'firebase/firestore';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Field } from '../../components/Field';
import { HonorPic, ICONS, RarityChip } from '../../components/HonorArt';
import { Modal } from '../../components/Modal';
import { useHub } from '../../hooks/useHub';
import { approveHonor, BADGE_SHAPES, EFFECTS, FRAME_THEMES, KINDS, RARITIES, removeHonor, saveHonor, STATS, type Honor, type HonorKind } from '../../lib/honors';
import { useHonors } from './useHonors';

type Draft = Omit<Honor, 'at'>;
const blank = (kind: HonorKind): Draft => ({
  id: '',
  kind,
  name: '',
  description: '',
  rarity: 'rare',
  source: 'honor',
  stat: null,
  goal: 0,
  secret: false,
  season: null,
  startsAt: null,
  endsAt: null,
  icon: 'Star',
  shape: 'gem',
  theme: 'iron',
  color: '#d4af37',
  effect: 'shimmer',
  status: 'active',
});
const day = (t?: Timestamp | null) => (t ? new Date(t.toMillis()).toISOString().slice(0, 10) : '');
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'honor';

function Editor({ d, onClose }: { d: Draft; onClose: () => void }) {
  const { me, isLead } = useHub();
  const [x, setX] = useState<Draft>(d);
  const isNew = !d.id;
  const save = async () => {
    if (!x.name.trim()) return;
    const id = x.id || `${slug(x.name)}-${Date.now().toString(36).slice(-4)}`;
    // The Archivist proposes; High Table makes it real.
    await saveHonor({ ...x, id, name: x.name.trim().slice(0, 40), description: x.description.slice(0, 160), status: isLead ? (x.status === 'proposed' ? 'active' : x.status) : 'proposed', by: x.by ?? me.id, rarity: !isLead && x.rarity === 'mythic' ? 'legendary' : x.rarity });
    onClose();
  };
  return (
    <Modal title={isNew ? (isLead ? 'Forge a new honor' : 'Propose a new honor') : `Edit · ${d.name}`} onClose={onClose} wide>
      <div className="grid gap-6 lg:grid-cols-[1fr_200px]">
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Kind">
              <select className="input" value={x.kind} onChange={(e) => setX({ ...x, kind: e.target.value as HonorKind })} disabled={!isNew}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Name">
              <input className="input" value={x.name} maxLength={40} onChange={(e) => setX({ ...x, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Rarity">
              <select className="input" value={x.rarity} onChange={(e) => setX({ ...x, rarity: e.target.value as Honor['rarity'] })}>
                {RARITIES.filter((r) => isLead || r.id !== 'mythic').map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label} · {r.points} pts
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Description (shown once earned)">
            <input className="input" value={x.description} maxLength={160} onChange={(e) => setX({ ...x, description: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="How it's earned">
              <select className="input" value={x.source} onChange={(e) => setX({ ...x, source: e.target.value as Honor['source'], stat: e.target.value === 'milestone' ? (x.stat ?? 'runs') : null })}>
                <option value="milestone">Milestone (unlocks itself)</option>
                <option value="honor">Given by High Table</option>
              </select>
            </Field>
            {x.source === 'milestone' && (
              <>
                <Field label="Counts">
                  <select className="input" value={x.stat ?? 'runs'} onChange={(e) => setX({ ...x, stat: e.target.value as Honor['stat'] })}>
                    {STATS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.group} · {s.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Goal">
                  <input className="input font-mono" inputMode="numeric" value={x.goal || ''} onChange={(e) => setX({ ...x, goal: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
                </Field>
              </>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Season (optional)">
              <input className="input" value={x.season ?? ''} placeholder="Autumn War 2026" maxLength={30} onChange={(e) => setX({ ...x, season: e.target.value || null })} />
            </Field>
            <Field label="From">
              <input type="date" className="input" value={day(x.startsAt)} onChange={(e) => setX({ ...x, startsAt: e.target.value ? Timestamp.fromDate(new Date(`${e.target.value}T00:00:00`)) : null })} />
            </Field>
            <Field label="Until">
              <input type="date" className="input" value={day(x.endsAt)} onChange={(e) => setX({ ...x, endsAt: e.target.value ? Timestamp.fromDate(new Date(`${e.target.value}T23:59:59`)) : null })} />
            </Field>
          </div>
          {isLead && (
            <Field label="Chip shop price (0 = not for sale)">
              <input className="input w-40 font-mono" inputMode="numeric" value={x.price || ''} onChange={(e) => setX({ ...x, price: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!x.secret} onChange={(e) => setX({ ...x, secret: e.target.checked })} /> Secret: shows as “???” until earned
          </label>

          {x.kind === 'badge' && (
            <>
              <Field label="Icon">
                <div className="flex flex-wrap gap-1">
                  {Object.entries(ICONS).map(([k, I]) => (
                    <button key={k} type="button" title={k} onClick={() => setX({ ...x, icon: k })} className={`grid size-8 place-items-center border ${x.icon === k ? 'border-gold-300 text-gold-200' : 'border-line text-smoke'}`}>
                      <I className="size-4" />
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Shape">
                <div className="flex gap-2">
                  {BADGE_SHAPES.map((s) => (
                    <button key={s} type="button" onClick={() => setX({ ...x, shape: s })} className={`chip px-3 py-1 text-xs capitalize ${x.shape === s ? 'border-gold-400 text-gold-200' : 'text-smoke'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}
          {x.kind === 'frame' && (
            <Field label="Theme">
              <div className="flex flex-wrap gap-2">
                {FRAME_THEMES.map((t) => (
                  <button key={t} type="button" onClick={() => setX({ ...x, theme: t })} className={`chip px-3 py-1 text-xs capitalize ${x.theme === t ? 'border-gold-400 text-gold-200' : 'text-smoke'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {x.kind === 'hue' && (
            <Field label="Color">
              <input type="color" className="h-10 w-20 cursor-pointer bg-transparent" value={x.color ?? '#d4af37'} onChange={(e) => setX({ ...x, color: e.target.value })} />
            </Field>
          )}
          {x.kind === 'effect' && (
            <Field label="Effect">
              <div className="flex flex-wrap gap-2">
                {EFFECTS.map((t) => (
                  <button key={t} type="button" onClick={() => setX({ ...x, effect: t })} className={`chip px-3 py-1 text-xs capitalize ${x.effect === t ? 'border-gold-400 text-gold-200' : 'text-smoke'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </Field>
          )}
          {isLead && !isNew && (
            <Field label="Status">
              <select className="input w-auto" value={x.status} onChange={(e) => setX({ ...x, status: e.target.value as Honor['status'] })}>
                <option value="active">Active</option>
                <option value="retired">Retired (kept by owners, can't be earned)</option>
                <option value="proposed">Proposed</option>
              </select>
            </Field>
          )}
        </div>
        <div className="flex flex-col items-center gap-3 border border-line-soft p-4 text-center">
          <p className="label text-[9px]">Preview</p>
          <HonorPic h={{ ...x, name: x.name || 'Name' }} member={me} />
          <b className="font-display text-gold-100">{x.name || 'Name'}</b>
          <RarityChip r={x.rarity} />
          <button className="btn-gold mt-auto w-full" onClick={save} disabled={!x.name.trim()}>
            {isLead ? 'Save' : 'Propose to High Table'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Forge({ onClose }: { onClose: () => void }) {
  const { isLead } = useHub();
  const { honors } = useHonors();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [kind, setKind] = useState<HonorKind>('badge');
  const proposed = honors.filter((h) => h.status === 'proposed');
  const list = honors.filter((h) => h.kind === kind && h.status !== 'proposed').sort((a, b) => RARITIES.findIndex((r) => r.id === a.rarity) - RARITIES.findIndex((r) => r.id === b.rarity));
  return (
    <Modal title="The Forge" onClose={onClose} wide>
      <div className="space-y-5">
        <p className="text-sm text-ash">{isLead ? 'Make, change and retire honors. The Archivist’s proposals wait here for your yes.' : 'Propose a new honor. High Table decides if it’s made.'}</p>
        {!!proposed.length && (
          <div className="space-y-2 border border-yellow-400/40 p-3">
            <p className="label text-yellow-200">Proposed · {proposed.length}</p>
            {proposed.map((h) => (
              <div key={h.id} className="flex flex-wrap items-center gap-3">
                <HonorPic h={h} />
                <span className="min-w-0 flex-1">
                  <b className="text-gold-100">{h.name}</b> <RarityChip r={h.rarity} />
                  <span className="block text-xs text-smoke">{h.description}</span>
                </span>
                {isLead && (
                  <>
                    <button className="btn-gold btn-sm" onClick={() => approveHonor(h.id)}>
                      <Check className="size-3.5" /> Approve
                    </button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(h)}>
                      Edit
                    </button>
                    <button className="text-smoke hover:text-red-300" onClick={() => removeHonor(h.id)} aria-label="Turn down">
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {KINDS.map((k) => (
            <button key={k.id} className={`chip px-3 py-1 text-xs ${kind === k.id ? 'border-gold-400 text-gold-200' : 'text-smoke'}`} onClick={() => setKind(k.id)}>
              {k.plural}
            </button>
          ))}
          <button className="btn-gold btn-sm ml-auto" onClick={() => setEditing(blank(kind))}>
            <Plus className="size-3.5" /> {isLead ? 'New' : 'Propose'}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {list.map((h) => (
            <button key={h.id} className={`flex items-center gap-3 border border-line-soft p-2 text-left hover:border-gold-600 ${h.status === 'retired' ? 'opacity-50' : ''}`} onClick={() => isLead && setEditing(h)} disabled={!isLead}>
              <HonorPic h={h} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-gold-100">{h.name}</b>
                <span className="block truncate text-xs text-smoke">
                  {h.source === 'milestone' ? `${STATS.find((s) => s.id === h.stat)?.label} ${h.goal?.toLocaleString()}` : 'Given'}
                  {h.secret ? ' · secret' : ''}
                  {h.season ? ` · ${h.season}` : ''}
                  {h.status === 'retired' ? ' · retired' : ''}
                </span>
              </span>
              <RarityChip r={h.rarity} />
            </button>
          ))}
        </div>
      </div>
      {editing && <Editor d={editing} onClose={() => setEditing(null)} />}
    </Modal>
  );
}

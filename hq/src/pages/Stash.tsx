import { Cannabis, Crown, ExternalLink, FlaskConical, Minus, Package, Pencil, Plus, Snowflake, Trash2, Vault, Warehouse } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrewChip } from '../components/Badges';
import { Empty, ErrorText, Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from '../hooks/useCollection';
import { db } from '../lib/firebase';
import { ago } from '../lib/format';
import type { Signout } from '../lib/locker';
import { useHub } from '../hooks/useHub';
import { BRICK_SIZE, MAIN_STASH, STRAINS, budCell, n, rootOf, toCount, type OpsLocation } from '../noel/data';
import { NOELOPS_URL } from '../lib/noelops';
import { ItemPicker } from '../components/ItemPicker';
import { ITEM_KINDS, itemTitle, kindOf, type ItemType } from '../lib/items';
import { useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { ToastProvider, useToast } from '../noel/ui';

/** What can be kept besides drugs. */
const CATEGORIES = ITEM_KINDS;


function placeIcon(l: OpsLocation) {
  if (l.id === MAIN_STASH) return Vault;
  return l.kind === 'grow' ? Cannabis : Warehouse;
}

// ---------- Add / edit a place ----------

function PlaceForm({ place, onClose }: { place?: OpsLocation; onClose: () => void }) {
  const { crews } = useHub();
  const ops = useOps('stash');
  const [name, setName] = useState(place?.name ?? '');
  const [postal, setPostal] = useState(place?.postal ?? '');
  const [crewId, setCrewId] = useState(place?.crewId ?? '');
  const [note, setNote] = useState(place?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError('Give the stash house a name.');
    try {
      await ops.saveLocation(place?.id ?? null, {
        kind: 'stash',
        name: name.trim().slice(0, 40),
        postal: postal.trim().slice(0, 12) || undefined,
        crewId: crewId || null,
        note: note.trim().slice(0, 60),
      });
      onClose();
    } catch {
      setError("Couldn't save. You need the Manage ops power.");
    }
  }

  return (
    <Modal title={place ? `Edit ${place.name}` : 'Add a stash house'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-smoke">Stash houses are shared with NoelOps: the name and note show there too.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Postal">
            <input className="input font-mono" value={postal} onChange={(e) => setPostal(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        {place?.id !== MAIN_STASH && (
          <Field label="Run by" hint="A crew's places show first for its members. Gang-wide places are for everyone.">
            <select className="input" value={crewId} onChange={(e) => setCrewId(e.target.value)}>
              <option value="">The whole gang</option>
              {crews.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        {place?.id !== MAIN_STASH && (
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Optional" />
          </Field>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">{place ? 'Save' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Items ----------

function AddItem({ loc, types, onClose }: { loc: OpsLocation; types: ItemType[]; onClose: () => void }) {
  const ops = useOps('stash');
  const toast = useToast();
  const [typeId, setTypeId] = useState<string>(types.length ? '' : 'new');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('gun');
  const [count, setCount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const { locLabel } = useNarcotics();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = toCount(count);
    if (!c) return setError('How many?');
    let id = typeId;
    if (!id) return setError('Pick an item.');
    let label = types.find((t) => t.id === id)?.name ?? '';
    try {
      if (id === 'new') {
        if (!name.trim()) return setError('Name the item.');
        id = await ops.addItemType(name, category);
        label = name.trim();
      }
      await toast.run(ops.adjustItem(loc.id, id, c, `${label} at ${locLabel(loc.id)}`));
      onClose();
    } catch {
      setError("Couldn't add that.");
    }
  }
  return (
    <Modal title={`Add to ${loc.name || `Postal ${loc.postal}`}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {typeId !== 'new' ? (
          <div>
            <ItemPicker types={types} value={typeId || null} onChange={setTypeId} />
            <button type="button" className="mt-1.5 text-xs text-gold-300 hover:underline" onClick={() => setTypeId('new')}>
              Not in the list? Add something new
            </button>
          </div>
        ) : (
          types.length > 0 && (
            <button type="button" className="text-xs text-gold-300 hover:underline" onClick={() => setTypeId('')}>
              ← Back to the list
            </button>
          )
        )}
        {typeId === 'new' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus placeholder="e.g. Pistol .50" />
            </Field>
            <Field label="Kind">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        <Field label={typeId && typeId !== 'new' ? `How many · ${types.find((t) => t.id === typeId)?.name}` : 'How many'}>
          <input className="input font-mono" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} />
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Add</button>
        </div>
      </form>
    </Modal>
  );
}

function Items({ loc, types }: { loc: OpsLocation; types: ItemType[] }) {
  const { stock, locLabel } = useNarcotics();
  const ops = useOps('stash');
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const items = stock.get(loc.id)?.items ?? {};
  const held = types.filter((t) => toCount(items[t.id]) > 0);
  const byId = new Map(types.map((t) => [t.id, t]));
  return (
    <Panel
      title="Guns, gear & items"
      right={
        <button className="btn-gold btn-sm" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" /> Add
        </button>
      }
    >
      {held.length ? (
        <div className="space-y-4">
          {CATEGORIES.map((cat) => {
            const list = held.filter((t) => kindOf(t, byId) === cat.id).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            if (!list.length) return null;
            return (
              <div key={cat.id}>
                <p className="label mb-1.5">{cat.label}</p>
                <ul className="divide-y divide-line-soft border border-line-soft">
                  {list.map((t) => {
                    const c = toCount(items[t.id]);
                    const label = `${t.name} at ${locLabel(loc.id)}`;
                    return (
                      <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                        <span className="flex-1 font-semibold text-gold-100">{itemTitle(t, byId)}</span>
                        <button className="btn-ghost btn-sm px-2" onClick={() => toast.run(ops.adjustItem(loc.id, t.id, -1, label))} aria-label={`One less ${t.name}`}>
                          <Minus className="size-3" />
                        </button>
                        <span className="w-10 text-center font-mono text-lg text-gold-100">{n(c)}</span>
                        <button className="btn-ghost btn-sm px-2" onClick={() => toast.run(ops.adjustItem(loc.id, t.id, 1, label))} aria-label={`One more ${t.name}`}>
                          <Plus className="size-3" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-smoke">Nothing but drugs here yet. Add guns, attachments, ammo or anything else the family keeps.</p>
      )}
      {adding && <AddItem loc={loc} types={types} onClose={() => setAdding(false)} />}
    </Panel>
  );
}

function Drugs({ loc }: { loc: OpsLocation }) {
  const { stock, noelDown } = useNarcotics();
  const s = stock.get(loc.id);
  const strains = STRAINS.map((st) => ({ st, c: budCell(s, st.id) })).filter(({ c }) => c.bricks || c.trimmed || c.untrimmed);
  const coke = { coca: rootOf(s, 'coca'), small: rootOf(s, 'cokeSmall'), large: rootOf(s, 'cokeLarge') };
  const meth = rootOf(s, 'meth');
  const empty = !strains.length && !coke.coca && !coke.small && !coke.large && !meth;
  return (
    <Panel
      title="Narcotics here"
      right={
        <a href={NOELOPS_URL} target="_blank" rel="noopener" className="label inline-flex items-center gap-1 hover:text-gold-300">
          Live from NoelOps <ExternalLink className="size-3" />
        </a>
      }
    >
      {noelDown ? (
        <p className="text-sm text-amber-200">Can’t reach NoelOps right now, so drug counts aren’t showing.</p>
      ) : empty ? (
        <p className="text-sm text-smoke">No drugs kept here.</p>
      ) : (
        <div className="space-y-3">
          {strains.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {strains.map(({ st, c }) => (
                <div key={st.id} className="flex items-center gap-3 border border-line-soft bg-coal/60 px-3 py-2" style={{ boxShadow: `inset 3px 0 0 rgb(${st.tint})` }}>
                  <img src={`/noel/logos/${st.id}.png`} alt="" className="size-8 object-contain" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gold-100">{st.name}</span>
                    <span className="text-xs text-smoke">
                      {n(c.trimmed)} trimmed · {n(c.untrimmed)} untrimmed
                    </span>
                  </span>
                  <span className="text-right font-mono">
                    <span className="block text-lg text-gold-100">{n(c.bricks)}</span>
                    <span className="text-[10px] text-smoke">+{Math.floor(c.trimmed / BRICK_SIZE)} to press</span>
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(coke.small > 0 || coke.large > 0 || coke.coca > 0) && (
              <span className="flex items-center gap-2 border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200">
                <Snowflake className="size-4" /> {coke.small} small · {coke.large} large · {n(coke.coca)} leaves
              </span>
            )}
            {meth > 0 && (
              <span className="flex items-center gap-2 border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm text-cyan-200">
                <FlaskConical className="size-4" /> {meth} meth {meth === 1 ? 'bin' : 'bins'}
              </span>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Leadership: gang property members have taken into their lockers and not brought back. */
function SignedOut() {
  const q = useMemo(() => query(collection(db, 'signouts'), where('status', 'in', ['out', 'lost', 'seized'])), []);
  const rows = (useCollection<Signout>(q) ?? []).sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const out = rows.filter((r) => r.status === 'out');
  const gone = rows.filter((r) => r.status !== 'out').slice(0, 10);
  return (
    <Panel title={`Signed out to members · ${out.length}`}>
      {out.length ? (
        <ul className="divide-y divide-line-soft">
          {out.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <b className="text-gold-100">{s.memberName}</b>
              <span className="text-ash">
                has {s.thing.qty} × {s.thing.label}
              </span>
              <span className="text-smoke">
                from {s.fromLabel} · {ago(s.at)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-smoke">Nothing signed out right now.</p>
      )}
      {gone.length > 0 && (
        <>
          <p className="label mt-4 mb-1">Lost or seized</p>
          <ul className="space-y-1 text-sm">
            {gone.map((s) => (
              <li key={s.id} className="text-smoke">
                <span className={s.status === 'seized' ? 'text-red-300' : 'text-amber-300'}>{s.status === 'seized' ? 'Seized' : 'Lost'}</span> · {s.memberName} · {s.thing.qty} × {s.thing.label} from {s.fromLabel} · {ago(s.closedAt)}
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  );
}

function Body() {
  const { ready, locations, locById, visible, totalsFor, stock, crewFilter, setCrewFilter, noelGrows } = useNarcotics();
  const { can, crewById, myCrews } = useHub();
  const ops = useOps('stash');
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const [params, setParams] = useSearchParams();
  const [form, setForm] = useState<{ place?: OpsLocation } | null>(null);
  const manage = can('manageOps');

  if (!ready) return null;
  const places = locations.filter((l) => (l.kind === 'stash' || l.storage) && visible(l));
  const grows = locations.filter((l) => l.kind === 'grow' && !l.storage && visible(l));
  const sel = locById.get(params.get('place') ?? '') ?? places[0];
  const itemCount = (id: string) => Object.values(stock.get(id)?.items ?? {}).reduce((s: number, v) => s + toCount(v), 0);

  return (
    <>
      <PageHeader
        icon={Warehouse}
        kicker="Ops"
        title="Stash"
        sub="Every place the family keeps things. Drug counts are live from NoelOps; guns, attachments and gear are kept here. The Main Stash belongs to the whole gang."
        actions={
          <>
            {myCrews.length > 0 && (
              <div className="flex border border-line">
                {(['all', 'mine'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setCrewFilter(f)}
                    className={`px-3 py-1.5 font-hud text-xs font-bold tracking-widest uppercase ${crewFilter === f ? 'bg-gold-400 text-void' : 'text-smoke hover:text-gold-200'}`}
                  >
                    {f === 'all' ? 'All crews' : 'My crews'}
                  </button>
                ))}
              </div>
            )}
            {manage && (
              <>
                <a className="btn-ghost" href={NOELOPS_URL} target="_blank" rel="noopener" title="Grows, cooks and coke runs are run in NoelOps">
                  <Cannabis className="size-4" /> Grows in NoelOps <ExternalLink className="size-3" />
                </a>
                <button className="btn-gold" onClick={() => setForm({})}>
                  <Plus className="size-4" /> Add stash house
                </button>
              </>
            )}
          </>
        }
      />

      {!places.length ? (
        <Empty icon={<Package className="size-8" />} title="No stash houses yet">
          {manage ? 'Add the first stash house.' : 'Leadership hasn’t set up any places yet.'}
        </Empty>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="space-y-2">
            {places.map((l) => {
              const Icon = placeIcon(l);
              const t = totalsFor([l.id]);
              const crew = l.crewId ? crewById.get(l.crewId) : undefined;
              const on = sel?.id === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setParams({ place: l.id })}
                  className={`hud flex w-full items-center gap-3 px-3 py-3 text-left transition ${on ? 'bg-gold-400/10' : 'hover:bg-white/[0.02]'}`}
                  style={crew ? { boxShadow: `inset 3px 0 0 ${crew.color}` } : l.id === MAIN_STASH ? { boxShadow: 'inset 3px 0 0 #d4af37' } : undefined}
                >
                  <Icon className={`size-5 shrink-0 ${on ? 'text-gold-300' : 'text-gold-600'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-hud text-base font-bold text-gold-100">
                      {l.kind === 'grow' ? `Postal ${l.postal}` : l.name}
                    </span>
                    <span className="text-xs text-smoke">
                      {n(t.bricks)} bricks · {n(t.meth)} meth · {n(itemCount(l.id))} items
                    </span>
                  </span>
                  {l.id === MAIN_STASH ? <Crown className="size-4 text-gold-400" /> : crew ? <CrewChip crew={crew} link={false} /> : null}
                </button>
              );
            })}
            {grows.length > 0 && (
              <p className="px-1 pt-2 text-xs text-smoke">
                {grows.length} {grows.length === 1 ? 'grow keeps' : 'grows keep'} no stock on site: {grows.map((g) => g.postal).join(', ')}.
              </p>
            )}
          </div>

          {sel && (
            <div className="space-y-6">
              <section className="hud scanlines p-5">
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="label text-gold-500">
                      {sel.id === MAIN_STASH ? 'Gang-wide · Main Stash' : sel.kind === 'grow' ? 'Grow · stock on site' : sel.crewId ? 'Crew stash house' : 'Gang-wide stash house'}
                      {sel.postal && sel.kind !== 'grow' && <> · Postal {sel.postal}</>}
                    </p>
                    <h2 className="foil mt-1 font-display text-2xl font-bold">{sel.kind === 'grow' ? `Postal ${sel.postal}` : sel.name}</h2>
                    {sel.note && <p className="mt-1 text-sm text-ash">{sel.note}</p>}
                    {sel.crewId && crewById.get(sel.crewId) && (
                      <p className="mt-2 flex items-center gap-2 text-sm text-smoke">
                        Run by <CrewChip crew={crewById.get(sel.crewId)!} full />
                      </p>
                    )}
                  </div>
                  {manage && sel.kind === 'stash' && (
                    <div className="flex gap-2">
                      <button className="btn-ghost btn-sm" onClick={() => setForm({ place: sel })}>
                        <Pencil className="size-3.5" /> Edit
                      </button>
                      {sel.id !== MAIN_STASH && (
                        <button
                          className="btn-danger btn-sm"
                          onClick={async () => {
                            if (!confirm(`Remove ${sel.name}? Everything in it moves to the Main Stash, here and in NoelOps.`)) return;
                            await ops.deleteLocation(sel, stock.get(sel.id), noelGrows);
                            setParams({});
                          }}
                        >
                          <Trash2 className="size-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </section>
              <Items loc={sel} types={types} />
              <Drugs loc={sel} />
              {(can('money') || can('manageOps')) && <SignedOut />}
            </div>
          )}
        </div>
      )}
      {form && <PlaceForm place={form.place} onClose={() => setForm(null)} />}
    </>
  );
}

export default function Stash() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}

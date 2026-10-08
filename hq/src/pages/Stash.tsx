import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { AlertTriangle, ArrowDownToLine, Bell, Box, Cannabis, Check, ClipboardList, Crown, Download, ExternalLink, Eye, Hand, Lock, Minus, Package, Plus, Search, Settings2, ShoppingCart, Vault, Warehouse, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Empty, ErrorText, Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Tabs } from '../components/Page';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { keyOf } from '../lib/calendar';
import { db } from '../lib/firebase';
import { ago } from '../lib/format';
import { itemTitle, kindOf, type ItemType } from '../lib/items';
import { KIND_COLOR, KIND_ICON } from '../lib/kindStyle';
import { thingKey, thingsIn, useLocker, type Signout, type Thing } from '../lib/locker';
import type { BmSettings } from '../lib/money';
import { NOELOPS_URL } from '../lib/noelops';
import { addPin } from '../lib/pins';
import { addToShopping, askGang, useShopping } from '../lib/shopping';
import { logMoves, nudge, parseCounts, removeSnap, saveStashSettings, snapshotToday, stashAccess, type MoveKind, type StashMove } from '../lib/stash';
import { MAIN_STASH, ROOT_FIELDS, STRAINS, toCount, type OpsLocation, type StockDoc } from '../noel/data';
import { useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { ToastProvider, useToast } from '../noel/ui';
import { useDefaults, useLists } from '../lib/adminData';

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const DRAG = 'application/x-chosenops-stash';

/** A place things are kept: a gang stash house (or grow), or one of my own locker storages. */
interface Place {
  /** Where its stock lives: a stash id, or a locker path. */
  key: string;
  name: string;
  personal: boolean;
  loc?: OpsLocation;
  storageId?: string;
  stock?: StockDoc;
}

function useNames() {
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const name = (id: string) => itemTitle(byId.get(id), byId);
  /** A thing key's label: an item, or "Strain bricks" / "Meth bins". */
  const keyLabel = (key: string) => {
    if (byId.has(key)) return name(key);
    const root = key.replace(/^x-/, '');
    if (root in ROOT_FIELDS) return ROOT_FIELDS[root as keyof typeof ROOT_FIELDS];
    const [strain, field] = key.split('-');
    const st = STRAINS.find((s) => s.id === strain);
    return st ? `${st.name} ${field}` : key;
  };
  /** The Thing a key stands for, at count `qty`. */
  const keyThing = (key: string, qty: number): Thing => {
    if (byId.has(key)) return { field: 'meth', item: key, qty, label: name(key) };
    const root = key.replace(/^x-/, '');
    if (root in ROOT_FIELDS) return { field: root as Thing['field'], qty, label: keyLabel(key) };
    const [strain, field] = key.split('-');
    return { strain: strain as Thing['strain'], field: field as Thing['field'], qty, label: keyLabel(key) };
  };
  return { types, byId, name, keyLabel, keyThing };
}

const kindOfThing = (t: Thing, byId: Map<string, ItemType>) => (t.item ? kindOf(byId.get(t.item), byId) : 'drug');
const logoOf = (t: Thing) => `/noel/logos/${t.strain ?? (t.field === 'coca' ? 'cokeSmall' : t.field)}.png`;

/** What one of a thing is worth here: the owner's value, or the BlackMarket price for drugs that sell. */
/** BlackMarket prices, plus catalog items sold as products (keyed item:<id>). */
function useStashPrices(base?: Record<string, number>) {
  const products = useLists().products;
  return useMemo(() => {
    const p: Record<string, number> = { ...(base ?? {}) };
    products.forEach((x) => {
      if (!x.retired && p[x.id]) p[`item:${x.itemId}`] = p[x.id]!;
    });
    return p;
  }, [base, products]);
}

function unitValue(t: Thing, loc: OpsLocation | undefined, prices: Record<string, number>) {
  const own = loc?.values?.[thingKey(t)];
  if (own) return own;
  // Catalog items sold on the BlackMarket carry that product's price.
  if (t.item) return prices[`item:${t.item}`] ?? 0;
  if (t.strain && t.field === 'bricks') return prices[t.strain] ?? 0;
  if (!t.strain && (t.field === 'meth' || t.field === 'cokeSmall' || t.field === 'cokeLarge')) return prices[t.field] ?? 0;
  return 0;
}

// ---------- the vault door ----------

function VaultDoor({ onOpen }: { onOpen: () => void }) {
  const [opening, setOpening] = useState(false);
  return (
    <button className={`vault ${opening ? 'opening' : ''}`} onClick={() => setOpening(true)} onAnimationEnd={(e) => e.animationName === 'vault-open' && onOpen()} aria-label="Open the stash">
      <span className="vault-half l" />
      <span className="vault-half r" />
      <span className="vault-wheel">
        {Array.from({ length: 6 }, (_, i) => (
          <i key={i} style={{ rotate: `${i * 30}deg` }} />
        ))}
      </span>
      {!opening && (
        <span className="vault-hint">
          <Lock className="size-4" /> Tap to open
        </span>
      )}
    </button>
  );
}

// ---------- a tile ----------

function Tile({ t, byId, low, value, onOpen, onDragStart }: { t: Thing; byId: Map<string, ItemType>; low: boolean; value: number; onOpen: () => void; onDragStart?: (e: DragEvent<HTMLButtonElement>) => void }) {
  const kind = kindOfThing(t, byId);
  const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? Box;
  const color = KIND_COLOR[kind] ?? KIND_COLOR.other!;
  return (
    <button
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={onOpen}
      title={`${t.label} × ${t.qty.toLocaleString()}`}
      className={`locker-tile group relative flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden border bg-coal/80 p-1.5 transition hover:-translate-y-0.5 ${low ? 'stash-low' : ''}`}
      style={{ borderColor: `${color}88`, boxShadow: `inset 0 0 18px ${color}22` }}
    >
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      {t.item ? <Icon className="size-[42%] transition group-hover:scale-110" style={{ color }} /> : <img src={logoOf(t)} alt="" className="size-[58%] object-contain" />}
      <span className="w-full truncate text-center text-[10px] leading-tight text-gold-100 sm:text-[11px]">{t.label}</span>
      <span className="absolute right-1 bottom-1 rounded-sm bg-black/70 px-1 font-mono text-[10px] text-gold-200">×{t.qty.toLocaleString()}</span>
      {value > 0 && <span className="absolute top-1 left-1 rounded-sm bg-black/60 px-1 font-mono text-[9px] text-green-300">{money(value * t.qty)}</span>}
      {low && <span className="absolute top-1 right-1 rounded-sm bg-red-500/80 px-1 text-[8px] font-black tracking-wider text-white">LOW</span>}
    </button>
  );
}

// ---------- inspect one thing ----------

function Inspect({ place, t, access, onClose }: { place: Place; t: Thing; access: { manage: boolean; take: boolean }; onClose: () => void }) {
  const { me, isAdmin } = useHub();
  const ops = useOps('stash');
  const toast = useToast();
  const locker = useLocker();
  const { stock, storage, locLabel } = useNarcotics();
  const names = useNames();
  const shop = useShopping(me.id);
  const key = thingKey(t);
  const loc = place.loc;
  const count = thingsIn(place.stock, names.name).find((x) => thingKey(x) === key)?.qty ?? 0;
  const [min, setMin] = useState(String(loc?.mins?.[key] ?? ''));
  const [value, setValue] = useState(String(loc?.values?.[key] ?? ''));
  const [takeN, setTakeN] = useState('1');
  const [into, setInto] = useState('onme');
  // Who has it signed out from here (leadership and admins can read every sign-out).
  const outQ = useMemo(() => query(collection(db, 'signouts'), where('fromLoc', '==', place.key), where('status', '==', 'out')), [place.key]);
  const out = (useCollection<Signout>(outQ, !place.personal) ?? []).filter((s) => thingKey(s.thing) === key);
  const movesQ = useMemo(() => query(collection(db, 'stashLog'), where('key', '==', key), orderBy('at', 'desc'), limit(30)), [key]);
  const moves = (useCollection<StashMove>(movesQ, isAdmin) ?? []).filter((m) => m.from === place.key || m.to === place.key).slice(0, 8);
  const elsewhere = storage
    .filter((l) => l.id !== place.key)
    .map((l) => ({ l, qty: thingsIn(stock.get(l.id), names.name).find((x) => thingKey(x) === key)?.qty ?? 0 }))
    .filter((x) => x.qty > 0);

  const bump = async (d: number) => {
    const applied = await ops.applyDeltas([{ loc: place.key, strain: t.strain, field: t.field, item: t.item, delta: d }]);
    if (applied.length) void logMoves(me, 'edit', [{ ...t, qty: applied[0]!.delta }], d > 0 ? { to: place.key, toLabel: place.name } : { from: place.key, fromLabel: place.name });
  };
  async function take() {
    const q = Math.max(1, Math.min(count, toCount(takeN)));
    const got = await locker.signOut(place.key, place.name, into, { ...t, qty: q });
    toast.done({ text: got ? `Signed out ${got} × ${t.label} to your ${locker.storages.find((s) => s.id === into)?.name}.` : 'Nothing left to take.' });
    onClose();
  }

  return (
    <Modal title={t.label} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="grid size-20 shrink-0 place-items-center border border-line bg-coal">{t.item ? <Package className="size-9 text-gold-400" /> : <img src={logoOf(t)} alt="" className="size-14 object-contain" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-smoke">At {place.name}</p>
            <p className="font-mono text-3xl text-gold-100">{count.toLocaleString()}</p>
            {loc?.mins?.[key] ? <p className={`text-xs ${count < loc.mins[key]! ? 'text-red-300' : 'text-smoke'}`}>Minimum {loc.mins[key]}</p> : null}
          </div>
          {access.manage && (
            <span className="flex items-center gap-1">
              <button className="btn-ghost btn-sm px-2" onClick={() => bump(-1)} aria-label="One less">
                <Minus className="size-3.5" />
              </button>
              <button className="btn-ghost btn-sm px-2" onClick={() => bump(1)} aria-label="One more">
                <Plus className="size-3.5" />
              </button>
            </span>
          )}
        </div>

        {access.take && !place.personal && count > 0 && (
          <div className="flex flex-wrap items-center gap-2 border border-line-soft p-2.5">
            <Hand className="size-4 text-gold-400" />
            <span className="text-sm text-ash">Take</span>
            <input className="input w-16 py-1 font-mono" inputMode="numeric" value={takeN} onChange={(e) => setTakeN(e.target.value.replace(/\D/g, ''))} />
            <span className="text-sm text-ash">into</span>
            <select className="input w-auto py-1 text-sm" value={into} onChange={(e) => setInto(e.target.value)}>
              {locker.storages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button className="btn-gold btn-sm ml-auto" onClick={take}>
              Sign it out
            </button>
          </div>
        )}

        {access.manage && !place.personal && (
          <form
            className="grid grid-cols-2 gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const mins = { ...(loc?.mins ?? {}) };
              const values = { ...(loc?.values ?? {}) };
              if (toCount(min)) mins[key] = toCount(min);
              else delete mins[key];
              if (toCount(value)) values[key] = toCount(value);
              else delete values[key];
              await saveStashSettings(place.key, { mins, values });
              toast.done({ text: 'Saved.' });
            }}
          >
            <Field label="Low below">
              <input className="input font-mono" inputMode="numeric" value={min} onChange={(e) => setMin(e.target.value.replace(/\D/g, ''))} placeholder="No minimum" />
            </Field>
            <Field label="Value each">
              <input className="input font-mono" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} placeholder={unitValue(t, undefined, {}) ? '' : '$'} />
            </Field>
            <button className="btn-ghost btn-sm col-span-2 justify-self-end">Save minimum & value</button>
          </form>
        )}

        {!place.personal && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="label mb-1">Signed out from here</p>
              {out.length ? (
                <ul className="space-y-1 text-sm">
                  {out.map((s) => (
                    <li key={s.id} className="flex items-center gap-2">
                      <MemberName id={s.memberId} /> <span className="font-mono text-gold-200">×{s.thing.qty}</span>
                      <span className="text-xs text-smoke">{ago(s.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-smoke">Nobody has any out.</p>
              )}
            </div>
            <div>
              <p className="label mb-1">Also kept at</p>
              {elsewhere.length ? (
                <ul className="space-y-1 text-sm">
                  {elsewhere.map(({ l, qty }) => (
                    <li key={l.id} className="flex justify-between">
                      <span className="text-ash">{locLabel(l.id)}</span>
                      <span className="font-mono text-gold-200">{qty.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-smoke">Nowhere else.</p>
              )}
            </div>
          </div>
        )}

        {isAdmin && moves.length > 0 && (
          <div>
            <p className="label mb-1">Recent moves here</p>
            <ul className="space-y-0.5 text-xs">
              {moves.map((m) => (
                <li key={m.id} className="flex gap-2 text-ash">
                  <span className="w-14 shrink-0 text-smoke">{ago(m.at)}</span>
                  <span>
                    {m.byName} {m.kind} {m.qty}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {t.item && shop && (
          <div className="flex flex-wrap gap-2 border-t border-line-soft pt-3">
            <button className="btn-ghost btn-sm" onClick={() => addToShopping(me.id, shop, [{ item: t.item!, qty: 1, from: place.name }]).then(() => toast.done({ text: `${t.label} is on your Personal Wishlist.` }))}>
              <ShoppingCart className="size-3.5" /> Personal Wishlist
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- adding things ----------

/** Fast entry: every catalog item with a number box. Saves only what changed. */
function CountMode({ title, onSave, onClose }: { title: string; onSave: (counts: { item: string; qty: number }[]) => Promise<void>; onClose: () => void }) {
  const { types, byId } = useNames();
  const [q, setQ] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const list = types.filter((t) => t.category !== 'attachment' || q).filter((t) => !q || itemTitle(t, byId).toLowerCase().includes(q.toLowerCase()));
  const filled = Object.entries(counts).filter(([, v]) => toCount(v) > 0);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="flex items-center gap-2 border-b border-line-soft">
          <Search className="size-4 text-smoke" />
          <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder={`Search ${types.length} items (attachments show when you search)`} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <ul className="grid max-h-[50dvh] gap-x-4 overflow-y-auto sm:grid-cols-2">
          {list.slice(0, 300).map((t) => (
            <li key={t.id} className="flex items-center gap-2 border-b border-line-soft/60 py-1">
              <span className="min-w-0 flex-1 truncate text-sm text-ash">{itemTitle(t, byId)}</span>
              <input
                className={`input w-16 py-0.5 text-center font-mono text-sm ${toCount(counts[t.id] ?? '') ? 'border-gold-400' : ''}`}
                inputMode="numeric"
                placeholder="0"
                value={counts[t.id] ?? ''}
                onChange={(e) => setCounts({ ...counts, [t.id]: e.target.value.replace(/\D/g, '') })}
              />
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-smoke">{filled.length} items counted</span>
          <span className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-gold"
              disabled={!filled.length || busy}
              onClick={async () => {
                setBusy(true);
                await onSave(filled.map(([item, v]) => ({ item, qty: toCount(v) })));
                onClose();
              }}
            >
              Add {filled.length || ''}
            </button>
          </span>
        </div>
      </div>
    </Modal>
  );
}

/** Paste a list: "Carbine Rifle 12", "Armor Plate x40"… matched to the catalog with a preview. */
function PasteMode({ title, onSave, onClose }: { title: string; onSave: (counts: { item: string; qty: number }[]) => Promise<void>; onClose: () => void }) {
  const { types, name } = useNames();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const rows = parseCounts(text, types);
  const ok = rows.filter((r) => r.item && r.qty > 0);
  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-3">
        <textarea className="input min-h-36 font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Carbine Rifle 12\nArmor Plate x40\n6 Medkit'} autoFocus />
        {rows.length > 0 && (
          <ul className="max-h-48 divide-y divide-line-soft overflow-y-auto border border-line-soft text-sm">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-2 px-2 py-1">
                {r.item ? <Check className="size-3.5 text-ok" /> : <X className="size-3.5 text-red-400" />}
                <span className="min-w-0 flex-1 truncate">{r.item ? name(r.item) : <span className="text-red-300">{r.name} · not in the catalog</span>}</span>
                <span className="font-mono text-gold-200">×{r.qty}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-gold"
            disabled={!ok.length || busy}
            onClick={async () => {
              setBusy(true);
              await onSave(ok.map((r) => ({ item: r.item!, qty: r.qty })));
              onClose();
            }}
          >
            Add {ok.length} {ok.length === 1 ? 'line' : 'lines'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Give things from my own locker to a gang stash. */
function Deposit({ place, onClose }: { place: Place; onClose: () => void }) {
  const { me } = useHub();
  const locker = useLocker();
  const toast = useToast();
  const { name } = useNames();
  const [from, setFrom] = useState(locker.storages[0]?.id ?? 'onme');
  const [n_, setN] = useState<Record<string, string>>({});
  const things = thingsIn(locker.stock.get(from), name);
  return (
    <Modal title={`Give to ${place.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="From">
          <select className="input" value={from} onChange={(e) => (setFrom(e.target.value), setN({}))}>
            {locker.storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        {things.length ? (
          <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto border border-line-soft">
            {things.map((t) => (
              <li key={thingKey(t)} className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-gold-100">{t.label}</span>
                <span className="font-mono text-xs text-smoke">have {t.qty}</span>
                <input className="input w-16 py-0.5 text-center font-mono" inputMode="numeric" placeholder="0" value={n_[thingKey(t)] ?? ''} onChange={(e) => setN({ ...n_, [thingKey(t)]: e.target.value.replace(/\D/g, '') })} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-smoke">Nothing in there.</p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-gold"
            onClick={async () => {
              const give = things.map((t) => ({ ...t, qty: Math.min(t.qty, toCount(n_[thingKey(t)] ?? '')) })).filter((t) => t.qty > 0);
              if (!give.length) return;
              const moved = await locker.move(give, locker.path(from), place.key);
              void logMoves(me, 'deposit', give, { from: locker.path(from), fromLabel: `${me.name}'s locker`, to: place.key, toLabel: place.name });
              toast.done({ text: `Gave ${moved.length} ${moved.length === 1 ? 'thing' : 'things'} to ${place.name}.` });
              onClose();
            }}
          >
            <ArrowDownToLine className="size-4" /> Give
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- stash settings ----------

function StashSettings({ place, onClose }: { place: Place; onClose: () => void }) {
  const { ranks, me, isLead, narco } = useHub();
  const ops = useOps('stash');
  const lead = isLead;
  const loc = place.loc!;
  const [name, setName] = useState(loc.name);
  const [postal, setPostal] = useState(loc.postal ?? '');
  const [note, setNote] = useState(loc.note ?? '');
  const [see, setSee] = useState(loc.seeRank ?? '');
  const [take, setTake] = useState(loc.takeRank ?? '');
  const [owners, setOwners] = useState<string[]>(loc.owners ?? []);
  const [error, setError] = useState<string | null>(null);
  const rankSelect = (v: string, set: (v: string) => void, none: string) => (
    <select className="input" value={v} onChange={(e) => set(e.target.value)}>
      <option value="">{none}</option>
      {ranks.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name} and up
        </option>
      ))}
    </select>
  );
  return (
    <Modal title={`${loc.name} · settings`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            if (loc.kind === 'stash') await ops.saveLocation(loc.id, { kind: 'stash', name: name.trim().slice(0, 40) || loc.name, note: note.trim().slice(0, 60), postal: postal.trim().slice(0, 12) || undefined, crewId: loc.crewId ?? null });
            await saveStashSettings(loc.id, { seeRank: see || null, takeRank: take || null, ...(lead ? { owners } : {}) });
            onClose();
          } catch {
            setError('Couldn’t save that.');
          }
        }}
      >
        {loc.kind === 'stash' && (
          <>
            <div className={`grid gap-3 ${narco ? 'grid-cols-[1fr_120px]' : ''}`}>
              <Field label="Name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
              </Field>
              {/* Postals are Narco only (a blank one never wipes the saved postal). */}
              {narco && (
                <Field label="Postal">
                  <input className="input font-mono" value={postal} onChange={(e) => setPostal(e.target.value)} maxLength={12} />
                </Field>
              )}
            </div>
            <Field label="Note">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} />
            </Field>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Who can see it">{rankSelect(see, setSee, 'Everyone')}</Field>
          <Field label="Who can take from it">{rankSelect(take, setTake, 'Everyone who can see it')}</Field>
        </div>
        <div>
          <p className="label mb-1">Owners</p>
          <div className="flex flex-wrap gap-1.5">
            {owners.map((id) => (
              <span key={id} className="chip flex items-center gap-1 bg-raised px-2 py-0.5 text-xs">
                <MemberName id={id} className="text-xs" />
                {lead && (
                  <button type="button" onClick={() => setOwners(owners.filter((x) => x !== id))} aria-label="Remove owner">
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {!owners.length && <span className="text-xs text-smoke">Leadership runs it.</span>}
          </div>
          {lead && !owners.includes(me.id) && (
            <button type="button" className="mt-1 text-xs text-gold-300 hover:underline" onClick={() => setOwners([...owners, me.id])}>
              + Make me an owner
            </button>
          )}
          <p className="mt-1 text-[11px] text-smoke">Owners set counts, minimums, values and access. Leadership can do everything, and decides who owns it.</p>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- new stash wizard ----------

function NewStash({ onClose, onMade }: { onClose: () => void; onMade: (key: string) => void }) {
  const { me, ranks, narco } = useHub();
  const ops = useOps('stash');
  const locker = useLocker();
  const toast = useToast();
  const { name: itemName } = useNames();
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'gang' | 'personal'>('gang');
  const [postal, setPostal] = useState('');
  const [note, setNote] = useState('');
  const [see, setSee] = useState('');
  const [take, setTake] = useState('');
  const [pin, setPin] = useState(false);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const [start, setStart] = useState<{ item: string; qty: number }[]>([]);
  const [mode, setMode] = useState<null | 'count' | 'paste'>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      let key: string;
      if (kind === 'gang') {
        const id = await ops.saveLocation(null, { kind: 'stash', name: name.trim().slice(0, 40), note: note.trim().slice(0, 60), postal: postal.trim().slice(0, 12) || undefined, crewId: null, createdBy: me.id, owners: [me.id], seeRank: see || null, takeRank: take || null });
        key = id;
      } else {
        const sid = await locker.addStorage(name);
        key = locker.path(sid);
      }
      if (start.length) {
        await ops.applyDeltas(start.map((s) => ({ loc: key, field: 'meth' as const, item: s.item, delta: s.qty })));
        void logMoves(me, 'create', start.map((s) => ({ field: 'meth' as const, item: s.item, qty: s.qty, label: itemName(s.item) })), { to: key, toLabel: name });
      }
      if (narco && pin && at)
        await addPin(me, {
          name: name.trim().slice(0, 40),
          type: 'stash',
          note: note.trim().slice(0, 300),
          x: at.x,
          y: at.y,
          postal: postal.trim().slice(0, 10),
          access: '',
          photo: null,
          stashId: kind === 'gang' ? key : null,
          scope: kind === 'gang' ? 'gang' : 'personal',
          ranks: [],
          crewIds: [],
          minRank: null,
        });
      toast.done({ text: `${name} is ready.` });
      onMade(key);
      onClose();
    } catch {
      setError('Couldn’t make it. Try again.');
      setBusy(false);
    }
  }

  return (
    <Modal title={`New stash · step ${step} of 2`} onClose={onClose} wide>
      {step === 1 ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setStep(2);
          }}
        >
          <div className="flex overflow-hidden rounded-full ring-1 ring-line">
            {(
              [
                ['gang', 'For the family'],
                ['personal', 'Just mine'],
              ] as const
            ).map(([v, l]) => (
              <button type="button" key={v} onClick={() => setKind(v)} className={`flex-1 px-3 py-2 text-xs font-bold ${kind === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {l}
              </button>
            ))}
          </div>
          <p className="text-xs text-smoke">
            {kind === 'gang' ? 'A gang stash house: you own it, and leadership runs it with you. It shows in NoelOps too.' : 'A personal stash is one of your My Locker storages. Only you can see it.'}
          </p>
          <div className={`grid gap-3 ${narco ? 'grid-cols-[1fr_120px]' : ''}`}>
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={kind === 'gang' ? 40 : 30} autoFocus placeholder={kind === 'gang' ? 'e.g. Docks warehouse' : 'e.g. Garage'} />
            </Field>
            {narco && (
              <Field label="Postal">
                <input className="input font-mono" value={postal} onChange={(e) => setPostal(e.target.value)} maxLength={12} placeholder="Optional" />
              </Field>
            )}
          </div>
          {kind === 'gang' && (
            <>
              <Field label="Note">
                <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Optional" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Who can see it">
                  <select className="input" value={see} onChange={(e) => setSee(e.target.value)}>
                    <option value="">Everyone</option>
                    {ranks.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} and up
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Who can take from it">
                  <select className="input" value={take} onChange={(e) => setTake(e.target.value)}>
                    <option value="">Everyone who can see it</option>
                    {ranks.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} and up
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}
          {/* Stash pins are Narco-only on the map, so only Narco can drop one. */}
          {narco && (
            <label className="flex items-center gap-2 text-sm text-ash">
              <input type="checkbox" className="accent-gold-400" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Drop a pin on the map too
            </label>
          )}
          {pin && (
            <div className="relative cursor-crosshair overflow-hidden border border-line" onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAt({ x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height });
            }}>
              <img src="/map/city.jpg" alt="City map" className="block max-h-72 w-full object-contain select-none" draggable={false} onError={(e) => (e.currentTarget.src = '/map/placeholder.svg')} />
              {at && <span className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-gold-400 shadow-[0_0_10px_#d4af37]" style={{ left: `${at.x * 100}%`, top: `${at.y * 100}%` }} />}
              {!at && <span className="pointer-events-none absolute inset-x-0 top-2 text-center text-xs text-gold-100">Tap where it is</span>}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold" disabled={!name.trim() || (pin && !at)}>
              Next: what’s in it
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ash">Put in what’s there now. You can skip this and add things later. Drug counts come from NoelOps.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setMode('count')}>
              <ClipboardList className="size-4" /> Count mode
            </button>
            <button className="btn-ghost" onClick={() => setMode('paste')}>
              <Download className="size-4" /> Paste a list
            </button>
          </div>
          {start.length > 0 && (
            <ul className="max-h-56 divide-y divide-line-soft overflow-y-auto border border-line-soft text-sm">
              {start.map((s) => (
                <li key={s.item} className="flex items-center gap-2 px-2 py-1">
                  <span className="min-w-0 flex-1 truncate text-gold-100">{itemName(s.item)}</span>
                  <span className="font-mono text-gold-200">×{s.qty}</span>
                  <button className="text-smoke hover:text-red-300" onClick={() => setStart(start.filter((x) => x.item !== s.item))} aria-label="Remove">
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ErrorText error={error} />
          <div className="flex justify-between gap-2">
            <button className="btn-ghost" onClick={() => setStep(1)}>
              Back
            </button>
            <button className="btn-gold" disabled={busy} onClick={create}>
              <Check className="size-4" /> {busy ? 'Making it…' : `Make ${name}`}
            </button>
          </div>
        </div>
      )}
      {mode === 'count' && (
        <CountMode
          title="Starting counts"
          onClose={() => setMode(null)}
          onSave={async (c) => setStart([...start.filter((s) => !c.some((x) => x.item === s.item)), ...c])}
        />
      )}
      {mode === 'paste' && (
        <PasteMode
          title="Paste starting counts"
          onClose={() => setMode(null)}
          onSave={async (c) => setStart([...start.filter((s) => !c.some((x) => x.item === s.item)), ...c])}
        />
      )}
    </Modal>
  );
}

// ---------- one stash ----------

function StashView({ place, access, places, onSettings }: { place: Place; access: { manage: boolean; take: boolean }; places: Place[]; onSettings: () => void }) {
  const { me, narco } = useHub();
  const ops = useOps('stash');
  const toast = useToast();
  const { noelDown } = useNarcotics();
  const names = useNames();
  const bm = useDoc<BmSettings>('settings/blackmarket');
  const prices = useStashPrices(bm?.prices);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('all');
  const [inspect, setInspect] = useState<Thing | null>(null);
  const [adding, setAdding] = useState<null | 'count' | 'paste' | 'deposit'>(null);
  const things = thingsIn(place.stock, names.name).sort((a, b) => kindOfThing(a, names.byId).localeCompare(kindOfThing(b, names.byId)) || a.label.localeCompare(b.label));
  const kinds = [...new Set(things.map((t) => kindOfThing(t, names.byId)))];
  const shown = things.filter((t) => (kind === 'all' || kindOfThing(t, names.byId) === kind) && (!q || t.label.toLowerCase().includes(q.toLowerCase())));
  const mins = place.loc?.mins ?? {};
  const low = (t: Thing) => (mins[thingKey(t)] ?? 0) > t.qty;
  const worth = things.reduce((s, t) => s + unitValue(t, place.loc, prices) * t.qty, 0);
  const missing = Object.entries(mins).filter(([k]) => (narco || names.byId.has(k)) && !things.some((t) => thingKey(t) === k));

  async function addCounts(c: { item: string; qty: number }[]) {
    await ops.applyDeltas(c.map((x) => ({ loc: place.key, field: 'meth' as const, item: x.item, delta: x.qty })));
    void logMoves(me, 'edit', c.map((x) => ({ field: 'meth' as const, item: x.item, qty: x.qty, label: names.name(x.item) })), { to: place.key, toLabel: place.name });
    toast.done({ text: `Added ${c.length} ${c.length === 1 ? 'line' : 'lines'} to ${place.name}.` });
  }

  return (
    <div className="relative space-y-4">
      <section className="hud scanlines p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <p className="label text-gold-500">
              {place.personal ? 'My stash · only you see it' : place.loc?.kind === 'grow' ? 'Grow · stock on site' : 'Gang stash house'}
              {place.loc?.postal && <> · Postal {place.loc.postal}</>}
            </p>
            <h2 className="foil mt-1 font-display text-2xl font-bold">{place.name}</h2>
            {place.loc?.note && <p className="mt-1 text-sm text-ash">{place.loc.note}</p>}
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-smoke">
              <span>
                {things.reduce((s, t) => s + t.qty, 0).toLocaleString()} things · <span className="text-green-300">{money(worth)}</span> worth
              </span>
              {!place.personal && (
                <span className="inline-flex items-center gap-1">
                  <Eye className="size-3" /> {place.loc?.seeRank ? 'Limited' : 'Everyone'} · <Hand className="size-3" /> {place.loc?.takeRank ? 'Limited' : 'Everyone'}
                </span>
              )}
              {(place.loc?.owners ?? []).length > 0 && (
                <span className="inline-flex items-center gap-1">
                  Owner{place.loc!.owners!.length > 1 ? 's' : ''}:{' '}
                  {place.loc!.owners!.map((o) => (
                    <MemberName key={o} id={o} className="text-xs" />
                  ))}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {access.take && !place.personal && (
              <button className="btn-ghost btn-sm" onClick={() => setAdding('deposit')}>
                <ArrowDownToLine className="size-3.5" /> Give from my locker
              </button>
            )}
            {access.manage && (
              <>
                <button className="btn-ghost btn-sm" onClick={() => setAdding('count')}>
                  <ClipboardList className="size-3.5" /> Count mode
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setAdding('paste')}>
                  <Download className="size-3.5" /> Paste
                </button>
                {!place.personal && (
                  <button className="btn-ghost btn-sm" onClick={onSettings}>
                    <Settings2 className="size-3.5" /> Settings
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </section>

      <div className="relative min-h-72">
        {!open && <VaultDoor key={place.key} onOpen={() => setOpen(true)} />}
        <div className={open ? 'locker-pop' : 'invisible max-h-96 overflow-hidden'}>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex min-w-48 flex-1 items-center gap-2 border-b border-line-soft">
              <Search className="size-4 text-smoke" />
              <input className="w-full bg-transparent py-1.5 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Search this stash" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1">
              {['all', ...kinds].map((k) => (
                <button key={k} onClick={() => setKind(k)} className={`chip px-2.5 py-1 text-[11px] ${kind === k ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`} style={kind !== k && k !== 'all' ? { boxShadow: `inset 0 -2px 0 ${KIND_COLOR[k]}` } : undefined}>
                  {k === 'all' ? 'All' : k === 'drug' ? 'Narcotics' : k}
                </button>
              ))}
            </div>
          </div>
          {noelDown && narco && <p className="mb-2 text-xs text-amber-200">Can’t reach NoelOps: drug counts aren’t showing.</p>}
          {shown.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {shown.map((t) => (
                <Tile
                  key={thingKey(t)}
                  t={t}
                  byId={names.byId}
                  low={low(t)}
                  value={unitValue(t, place.loc, prices)}
                  onOpen={() => setInspect(t)}
                  onDragStart={access.manage && !place.personal ? (e) => e.dataTransfer.setData(DRAG, JSON.stringify({ from: place.key, fromName: place.name, t })) : undefined}
                />
              ))}
            </div>
          ) : (
            <Empty icon={<Package className="size-7" />} title={things.length ? 'Nothing matches' : 'Empty'}>
              {things.length ? 'Try another filter.' : access.manage ? 'Use Count mode or Paste to put in what’s here.' : 'Nothing kept here yet.'}
            </Empty>
          )}
          {missing.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-red-300">
              <AlertTriangle className="size-3.5" /> Out of: {missing.map(([k]) => names.keyLabel(k)).join(', ')}
            </p>
          )}
          {access.manage && !place.personal && places.length > 1 && <p className="mt-2 text-[11px] text-smoke">Drag a tile onto another stash on the left to move it there.</p>}
        </div>
      </div>

      {inspect && <Inspect place={place} t={inspect} access={access} onClose={() => setInspect(null)} />}
      {adding === 'count' && <CountMode title={`Count ${place.name}`} onClose={() => setAdding(null)} onSave={addCounts} />}
      {adding === 'paste' && <PasteMode title={`Paste into ${place.name}`} onClose={() => setAdding(null)} onSave={addCounts} />}
      {adding === 'deposit' && <Deposit place={place} onClose={() => setAdding(null)} />}
    </div>
  );
}

// ---------- tabs: signed out, restock, log ----------

function SignedOutTab({ places }: { places: Place[] }) {
  const { me } = useHub();
  const toast = useToast();
  const q = useMemo(() => query(collection(db, 'signouts'), where('status', 'in', ['out', 'lost', 'seized'])), []);
  const rows = (useCollection<Signout>(q) ?? []).sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const [by, setBy] = useState<'member' | 'stash'>('member');
  const out = rows.filter((r) => r.status === 'out' && places.some((p) => p.key === r.fromLoc));
  const gone = rows.filter((r) => r.status !== 'out').slice(0, 15);
  const groups = new Map<string, Signout[]>();
  out.forEach((s) => {
    const k = by === 'member' ? s.memberId : s.fromLoc;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  });
  const remind = (s: Signout) => nudge(me, s.memberId, s.id, `Bring back ${s.thing.qty} × ${s.thing.label} to ${s.fromLabel}`).then(() => toast.done({ text: `Reminded ${s.memberName}.` }));
  return (
    <div className="space-y-6">
      <Panel
        title={`Signed out · ${out.length}`}
        right={
          <span className="flex overflow-hidden rounded-full ring-1 ring-line">
            {(
              [
                ['member', 'By member'],
                ['stash', 'By stash'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} onClick={() => setBy(v)} className={`px-2.5 py-1 text-[11px] font-bold ${by === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                {l}
              </button>
            ))}
          </span>
        }
      >
        {groups.size ? (
          <div className="space-y-4">
            {[...groups].map(([k, list]) => (
              <div key={k}>
                <p className="mb-1 flex items-center gap-2 font-hud font-bold text-gold-100">
                  {by === 'member' ? (
                    <>
                      <MemberName id={k} />
                    </>
                  ) : (
                    list[0]!.fromLabel
                  )}
                  <span className="text-xs font-normal text-smoke">· {list.length}</span>
                </p>
                <ul className="divide-y divide-line-soft border border-line-soft">
                  {list.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                      <span className="text-gold-100">
                        {s.thing.qty} × {s.thing.label}
                      </span>
                      <span className="text-xs text-smoke">
                        {by === 'member' ? `from ${s.fromLabel}` : `with ${s.memberName}`} · {ago(s.at)}
                      </span>
                      <button className="btn-ghost btn-sm ml-auto" onClick={() => remind(s)}>
                        <Bell className="size-3.5" /> Remind
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-smoke">Nothing signed out right now.</p>
        )}
      </Panel>
      {gone.length > 0 && (
        <Panel title="Lost or seized">
          <ul className="space-y-1 text-sm">
            {gone.map((s) => (
              <li key={s.id} className="text-smoke">
                <span className={s.status === 'seized' ? 'text-red-300' : 'text-amber-300'}>{s.status === 'seized' ? 'Seized' : 'Lost'}</span> · {s.memberName} · {s.thing.qty} × {s.thing.label} from {s.fromLabel} · {ago(s.closedAt)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

/** Everything under its minimum, across the stashes I can see. */
export function useRestock(places: Place[]) {
  const { narco } = useHub();
  const names = useNames();
  return useMemo(
    () =>
      places.flatMap((p) =>
        // Drug minimums are Narco only (their counts never load for anyone else).
        Object.entries(p.loc?.mins ?? {}).filter(([key]) => narco || names.byId.has(key)).flatMap(([key, min]) => {
          const have = thingsIn(p.stock, names.name).find((t) => thingKey(t) === key)?.qty ?? 0;
          return have < min ? [{ place: p, key, have, min, label: names.keyLabel(key) }] : [];
        }),
      ),
    [places, names, narco],
  );
}

function RestockTab({ places }: { places: Place[] }) {
  const { me } = useHub();
  const toast = useToast();
  const rows = useRestock(places);
  const shop = useShopping(me.id);
  return (
    <Panel title={`Restock · ${rows.length}`}>
      {rows.length ? (
        <ul className="divide-y divide-line-soft">
          {rows.map((r) => (
            <li key={`${r.place.key}${r.key}`} className="flex flex-wrap items-center gap-2 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-semibold text-gold-100">{r.label}</span>
                <span className="block text-xs text-smoke">{r.place.name}</span>
              </span>
              <span className="font-mono text-red-300">
                {r.have}/{r.min}
              </span>
              <button className="btn-ghost btn-sm" onClick={() => askGang(me, r.label, r.min - r.have, `Restock for ${r.place.name}`).then(() => toast.done({ text: `${r.label} is on the wish list.` }))}>
                <Plus className="size-3.5" /> Wish list
              </button>
              {shop && !r.key.includes('-') && (
                <button className="btn-ghost btn-sm" onClick={() => addToShopping(me.id, shop, [{ item: r.key, qty: r.min - r.have, from: r.place.name }]).then(() => toast.done({ text: 'On your Personal Wishlist.' }))}>
                  <ShoppingCart className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-smoke">Nothing is low. Owners set minimums by tapping an item in their stash.</p>
      )}
    </Panel>
  );
}

const MOVE_LABEL: Record<MoveKind, string> = { take: 'took', return: 'returned', deposit: 'gave', edit: 'changed', transfer: 'moved', lost: 'lost', seized: 'had seized', sold: 'sold', loot: 'brought in loot', create: 'stocked' };

function LogTab({ places }: { places: Place[] }) {
  const { roster, narco } = useHub();
  const logQ = useMemo(() => query(collection(db, 'stashLog'), orderBy('at', 'desc'), limit(400)), []);
  const moves = useCollection<StashMove>(logQ) ?? [];
  const snapsQ = useMemo(() => query(collection(db, 'stashSnaps'), orderBy('day', 'desc'), limit(120)), []);
  const snaps = useCollection<{ id: string; day: string; counts: Record<string, Record<string, number>> }>(snapsQ) ?? [];
  const names = useNames();
  const [stash, setStash] = useState('');
  const [who, setWho] = useState('');
  const [q, setQ] = useState('');
  const [day, setDay] = useState('');
  const [allChanges, setAllChanges] = useState(false);
  // Old snapshots roll off (90 days unless an admin changes it).
  const keep = useDefaults().snapDays;
  useEffect(() => {
    const cutoff = keyOf(Date.now() - keep * 86400e3);
    snaps.filter((s) => s.day < cutoff).forEach((s) => void removeSnap(s.id).catch(() => {}));
  }, [snaps, keep]);
  // Drug moves and counts are Narco only; everyone else sees items.
  const list = moves.filter((m) => (narco || names.byId.has(m.key)) && (!stash || m.from === stash || m.to === stash) && (!who || m.by === who) && (!q || m.label.toLowerCase().includes(q.toLowerCase())));
  const snap = snaps.find((s) => s.day === day) ?? snaps[0];
  const prev = snap ? snaps.find((s) => s.day < snap.day) : undefined;
  const changes = snap
    ? places
        .filter((p) => !p.personal)
        .flatMap((p) => {
          const a = prev?.counts[p.key] ?? {};
          const b = snap.counts[p.key] ?? {};
          return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => narco || names.byId.has(k)).map((k) => ({ p, k, d: (b[k] ?? 0) - (a[k] ?? 0), now: b[k] ?? 0 })).filter((x) => x.d);
        })
        .sort((x, y) => x.d - y.d)
    : [];
  const exportCsv = () => {
    const rows = [['When', 'Who', 'What', 'Thing', 'Qty', 'From', 'To']].concat(list.map((m) => [m.at?.toDate().toISOString() ?? '', m.byName, m.kind, m.label, String(m.qty), m.fromLabel ?? '', m.toLabel ?? '']));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'stash-log.csv';
    a.click();
  };
  return (
    <div className="space-y-6">
      <Panel
        title="Every move"
        right={
          <button className="btn-ghost btn-sm" onClick={exportCsv}>
            <Download className="size-3.5" /> CSV
          </button>
        }
        pad={false}
      >
        <div className="flex flex-wrap gap-2 border-b border-line-soft p-3">
          <select className="input w-auto py-1 text-xs" value={stash} onChange={(e) => setStash(e.target.value)}>
            <option value="">Every stash</option>
            {places
              .filter((p) => !p.personal)
              .map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
          </select>
          <select className="input w-auto py-1 text-xs" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <input className="input w-40 py-1 text-xs" placeholder="Item" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.length ? (
          <ul className="max-h-[60dvh] divide-y divide-line-soft overflow-y-auto">
            {list.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-sm">
                <span className="w-20 shrink-0 text-xs text-smoke">{ago(m.at)}</span>
                <b className="text-gold-100">{m.byName}</b>
                <span className="text-ash">
                  {MOVE_LABEL[m.kind] ?? m.kind} {m.qty} × {m.label}
                </span>
                <span className="text-xs text-smoke">
                  {m.fromLabel && `from ${m.fromLabel}`} {m.toLabel && `→ ${m.toLabel}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-4 text-sm text-smoke">No moves logged yet.</p>
        )}
      </Panel>
      <Panel
        title="Daily snapshots"
        right={
          <select className="input w-auto py-1 text-xs" value={snap?.day ?? ''} onChange={(e) => setDay(e.target.value)}>
            {snaps.map((s) => (
              <option key={s.id} value={s.day}>
                {s.day}
              </option>
            ))}
          </select>
        }
      >
        {snap ? (
          changes.length ? (
            <ul className="divide-y divide-line-soft text-sm">
              {changes.slice(0, allChanges ? undefined : 20).map((c) => (
                <li key={`${c.p.key}${c.k}`} className="flex items-center gap-2 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-ash">
                    <span className="text-gold-100">{names.keyLabel(c.k)}</span> · {c.p.name}
                  </span>
                  <span className={`font-mono ${c.d < 0 ? 'text-red-300' : 'text-ok'}`}>
                    {c.d > 0 ? '+' : ''}
                    {c.d}
                  </span>
                  <span className="w-14 text-right font-mono text-xs text-smoke">{c.now}</span>
                </li>
              ))}
              {changes.length > 20 && (
                <li className="pt-2">
                  <button className="btn-ghost btn-sm" onClick={() => setAllChanges(!allChanges)}>
                    {allChanges ? 'Show fewer' : `Show all ${changes.length}`}
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="text-sm text-smoke">{prev ? `No change since ${prev.day}.` : 'The first snapshot; changes show from tomorrow.'}</p>
          )
        ) : (
          <p className="text-sm text-smoke">No snapshots yet. The first one is taken today.</p>
        )}
        <p className="mt-2 text-[11px] text-smoke">Taken at the first visit each day; kept {keep} days. Biggest drops first.</p>
      </Panel>
    </div>
  );
}

// ---------- page ----------

type TabId = 'inventory' | 'out' | 'restock' | 'log';

function Body() {
  const { ready, locations, stock, storage, locLabel } = useNarcotics();
  const { me, myRank, rankById, isAdmin, isLead, can } = useHub();
  const ops = useOps('stash');
  const toast = useToast();
  const locker = useLocker();
  const names = useNames();
  const bm = useDoc<BmSettings>('settings/blackmarket');
  const [params, setParams] = useSearchParams();
  const [making, setMaking] = useState(false);
  const [settings, setSettings] = useState<Place | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const lead = isLead || can('manageOps');
  const snapped = useRef(false);

  const access = (p: Place) => (p.personal ? { manage: true, see: true, take: true } : stashAccess(p.loc!, me, myRank, rankById, lead));
  const gang: Place[] = storage
    .filter((l) => l.kind === 'stash')
    .map((l) => ({ key: l.id, name: l.name, personal: false, loc: l, stock: stock.get(l.id) }))
    .filter((p) => access(p).see);
  const grows: Place[] = storage.filter((l) => l.kind === 'grow').map((l) => ({ key: l.id, name: locLabel(l.id), personal: false, loc: l, stock: stock.get(l.id) }));
  const mine: Place[] = locker.storages.map((s) => ({ key: locker.path(s.id), name: s.name, personal: true, storageId: s.id, stock: locker.stock.get(s.id) }));
  const all = [...gang, ...grows, ...mine];
  const sel = all.find((p) => p.key === params.get('place')) ?? gang[0] ?? mine[0];
  const tabParam = params.get('tab');
  const tab: TabId = tabParam === 'out' && lead ? 'out' : tabParam === 'restock' ? 'restock' : tabParam === 'log' && isAdmin ? 'log' : 'inventory';
  const restock = useRestock([...gang, ...grows]);
  const prices = useStashPrices(bm?.prices);

  // The first visitor of the day takes the snapshot.
  useEffect(() => {
    if (!ready || snapped.current || !locations.length) return;
    snapped.current = true;
    void snapshotToday(keyOf(Date.now()), stock, names.name);
  }, [ready, locations.length, stock, names]);

  if (!ready) return null;

  async function dropOn(target: Place, e: DragEvent) {
    e.preventDefault();
    setOver(null);
    const raw = e.dataTransfer.getData(DRAG);
    if (!raw) return;
    const { from, fromName, t } = JSON.parse(raw) as { from: string; fromName: string; t: Thing };
    if (from === target.key || !access(target).manage) return;
    const qty = Math.max(0, Math.min(t.qty, toCount(prompt(`How many ${t.label} to move to ${target.name}?`, String(t.qty)) ?? '0')));
    if (!qty) return;
    const taken = await ops.applyDeltas([{ loc: from, strain: t.strain, field: t.field, item: t.item, delta: -qty }]);
    const got = taken.length ? -taken[0]!.delta : 0;
    if (got) await ops.applyDeltas([{ loc: target.key, strain: t.strain, field: t.field, item: t.item, delta: got }]);
    void logMoves(me, 'transfer', [{ ...t, qty: got }], { from, fromLabel: fromName, to: target.key, toLabel: target.name });
    toast.done({ text: `Moved ${got} × ${t.label} to ${target.name}.` });
  }

  const card = (p: Place) => {
    const things = thingsIn(p.stock, names.name);
    const worth = things.reduce((s, t) => s + unitValue(t, p.loc, prices) * t.qty, 0);
    const lows = restock.filter((r) => r.place.key === p.key).length;
    const on = sel?.key === p.key;
    const Icon = p.personal ? Lock : p.loc?.kind === 'grow' ? Cannabis : p.loc?.id === MAIN_STASH ? Vault : Warehouse;
    return (
      <button
        key={p.key}
        onClick={() => setParams({ place: p.key })}
        onDragOver={(e) => (e.preventDefault(), setOver(p.key))}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => dropOn(p, e)}
        className={`hud flex w-full items-center gap-3 px-3 py-3 text-left transition ${on ? 'bg-gold-400/10' : 'hover:bg-white/[0.02]'} ${over === p.key ? 'locker-drop' : ''}`}
      >
        <Icon className={`size-5 shrink-0 ${on ? 'text-gold-300' : 'text-gold-600'}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-hud text-base font-bold text-gold-100">{p.name}</span>
          <span className="text-xs text-smoke">
            {p.loc?.postal ? `${p.loc.postal} · ` : ''}
            {things.length} kinds · <span className="text-green-300">{money(worth)}</span>
          </span>
        </span>
        {lows > 0 && <span className="rounded-sm bg-red-500/80 px-1.5 text-[9px] font-black tracking-wider text-white">{lows} LOW</span>}
        {p.loc?.owners?.includes(me.id) && <Crown className="size-3.5 text-gold-400" />}
      </button>
    );
  };

  return (
    <>
      <PageHeader
        icon={Warehouse}
        kicker="Business"
        title="Stash"
        sub="Everywhere the family keeps things, and your own stashes. Drug counts are live from NoelOps; everything else is kept here."
        actions={
          <>
            <a className="btn-ghost" href={NOELOPS_URL} target="_blank" rel="noopener">
              <Cannabis className="size-4" /> NoelOps <ExternalLink className="size-3" />
            </a>
            <button className="btn-gold" onClick={() => setMaking(true)}>
              <Plus className="size-4" /> New stash
            </button>
          </>
        }
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={(t) => setParams(t === 'inventory' ? (sel ? { place: sel.key } : {}) : { tab: t })}
          tabs={[
            { id: 'inventory', label: 'Inventory' },
            ...(lead ? [{ id: 'out' as const, label: 'Signed out' }] : []),
            { id: 'restock', label: `Restock${restock.length ? ` · ${restock.length}` : ''}` },
            ...(isAdmin ? [{ id: 'log' as const, label: 'Log' }] : []),
          ]}
        />
      </div>

      {tab === 'inventory' &&
        (!all.length ? (
          <Empty icon={<Package className="size-8" />} title="No stashes yet">
            Make the first one with New stash.
          </Empty>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="space-y-4">
              {gang.length > 0 && (
                <div className="space-y-2">
                  <p className="label">Gang stashes</p>
                  {gang.map(card)}
                </div>
              )}
              {grows.length > 0 && (
                <div className="space-y-2">
                  <p className="label">Grows</p>
                  {grows.map(card)}
                </div>
              )}
              <div className="space-y-2">
                <p className="label">My stashes</p>
                {mine.map(card)}
              </div>
            </div>
            {sel && <StashView key={sel.key} place={sel} access={access(sel)} places={all} onSettings={() => setSettings(sel)} />}
          </div>
        ))}
      {tab === 'out' && <SignedOutTab places={all} />}
      {tab === 'restock' && <RestockTab places={[...gang, ...grows]} />}
      {tab === 'log' && <LogTab places={all} />}

      {making && <NewStash onClose={() => setMaking(false)} onMade={(key) => setParams({ place: key })} />}
      {settings?.loc && <StashSettings place={settings} onClose={() => setSettings(null)} />}
    </>
  );
}

/** Leadership's Dashboard line: how many things are below their minimum. */
export function LowStockLine() {
  return (
    <NarcoticsProvider>
      <LowStockInner />
    </NarcoticsProvider>
  );
}
function LowStockInner() {
  const { ready, storage, stock } = useNarcotics();
  const places = storage.map((l) => ({ key: l.id, name: l.name, personal: false, loc: l, stock: stock.get(l.id) }));
  const rows = useRestock(places);
  if (!ready || !rows.length) return null;
  return (
    <Link to="/stash?tab=restock" className="mt-3 flex items-center gap-2 border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/15">
      <AlertTriangle className="size-4" /> {rows.length} {rows.length === 1 ? 'thing is' : 'things are'} low in the stashes · Restock →
    </Link>
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

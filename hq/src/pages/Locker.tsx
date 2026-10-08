import { ShoppingCart, ArrowLeftRight, Backpack, Box, Zap, Camera, Check, Handshake, PackageCheck, Search, Star, Tag, Gift, Lock, Minus, PackageOpen, Pencil, Plus, Send, ShieldAlert, Trash2, Undo2, Warehouse, X } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { squareImage } from '../lib/image';
import { Avatar } from '../components/Avatar';
import { Safe } from '../components/Safe';
import { Empty, ErrorText, Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { ago } from '../lib/format';
import { ItemPicker } from '../components/ItemPicker';
import { WishlistButton } from '../components/WishlistButton';
import { NewTrade, TradesPanel } from '../components/Trades';
import { NO_CASH } from '../lib/trades';
import { kitNeeds, useMyKits } from '../lib/kits';
import { saveShopping, useShopping } from '../lib/shopping';
import { KIND_COLOR, KIND_ICON } from '../lib/kindStyle';
import { ITEM_KINDS, itemTitle, kindOf, type ItemType } from '../lib/items';
import { countOf, thingKey, thingsIn, useLocker, type ItemMeta, type Kit, type Locker as LockerApi, type Thing } from '../lib/locker';
import { addMyCash, money, useMoney, useMoneyOps, type MyCash } from '../lib/money';
import { collection, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { clearNudges, type Nudge } from '../lib/stash';
import { PRODUCTS, ROOT_FIELDS, STRAINS, toCount, type RootField } from '../noel/data';
import { useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { ToastProvider, useToast } from '../noel/ui';

function useItemTypes() {
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const byId = new Map(types.map((t) => [t.id, t]));
  return { types, name: (id: string) => itemTitle(byId.get(id), byId), byId };
}


/** Boxes and loose rounds per caliber, as little counters at the top of a storage. */
function AmmoPills({ things, byId, bump, onOpen }: { things: Thing[]; byId: Map<string, ItemType>; bump: (t: Thing, d: number) => void; onOpen: (t: Thing) => void }) {
  const cal = new Map<string, { box?: Thing; round?: Thing }>();
  things.forEach((t) => {
    const it = t.item ? byId.get(t.item) : undefined;
    if (it?.category !== 'ammo') return;
    const key = it.caliber ?? it.name;
    cal.set(key, { ...cal.get(key), [it.form === 'round' ? 'round' : 'box']: t });
  });
  if (!cal.size) return null;
  // Both halves of a caliber show, even at 0, so the other can be counted up.
  const twin = (c: string, form: 'box' | 'round') => {
    const it = [...byId.values()].find((x) => x.category === 'ammo' && x.caliber === c && x.form === form);
    return it ? { field: 'meth' as const, item: it.id, qty: 0, label: it.name } : undefined;
  };
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {[...cal.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
        .map(([c, v]) => (
          <div key={c} className="inline-flex items-center overflow-hidden rounded-full border border-gold-700/60 bg-raised/60 text-xs">
            <span className="flex items-center gap-1 bg-gold-400/15 px-2.5 py-1 font-bold text-gold-200">
              <Zap className="size-3" /> {c}
            </span>
            {(['box', 'round'] as const).map((f) => {
              const t = v[f] ?? twin(c, f);
              if (!t) return null;
              return (
                <span key={f} className="flex items-center gap-0.5 border-l border-gold-700/40 px-1">
                  <button className="px-1 text-smoke hover:text-gold-200 disabled:opacity-30" disabled={!t.qty} onClick={() => bump(t, -1)} aria-label={`One less ${t.label}`}>
                    −
                  </button>
                  <button className="font-mono text-gold-100 hover:underline" onClick={() => t.qty && onOpen(t)} title={t.qty ? 'Move, stash or give' : undefined}>
                    {t.qty.toLocaleString()} {f === 'box' ? (t.qty === 1 ? 'box' : 'boxes') : 'rds'}
                  </button>
                  <button className="px-1 text-smoke hover:text-gold-200" onClick={() => bump(t, 1)} aria-label={`One more ${t.label}`}>
                    +
                  </button>
                </span>
              );
            })}
          </div>
        ))}
    </div>
  );
}

/** Pick a drug. */
function DrugPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      {STRAINS.map((s) => (
        <option key={s.id} value={`bud:${s.id}:bricks`}>
          {s.name} bricks
        </option>
      ))}
      {PRODUCTS.map((p) => (
        <option key={p.id} value={`root:${p.id}`}>
          {p.name}s
        </option>
      ))}
      <option value="root:coca">Coca leaves</option>
    </select>
  );
}

function thingFrom(key: string, qty: number, name: (id: string) => string): Thing {
  const [kind, a, b] = key.split(':');
  if (kind === 'item') return { field: 'meth', item: a, qty, label: name(a!) };
  if (kind === 'bud') {
    const st = STRAINS.find((s) => s.id === a)!;
    return { strain: st.id, field: (b as 'bricks') ?? 'bricks', qty, label: `${st.name} bricks` };
  }
  return { field: a as RootField, qty, label: ROOT_FIELDS[a as RootField] };
}

// ---------- dialogs ----------

function AddDialog({ locker, storageId, onClose }: { locker: LockerApi; storageId: string; onClose: () => void }) {
  const { types, name } = useItemTypes();
  const ops = useOps('stash');
  const toast = useToast();
  const [tab, setTab] = useState<'item' | 'drug'>('item');
  const [itemId, setItemId] = useState<string | null>(null);
  const [drug, setDrug] = useState(`bud:${STRAINS[0].id}:bricks`);
  // Not in the catalog yet? Name it and it's added for everyone.
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<string>('gear');
  const key = tab === 'item' ? (isNew ? (newName.trim() ? 'new' : '') : itemId ? `item:${itemId}` : '') : drug;
  const [qty, setQty] = useState('1');
  return (
    <Modal title="Add to your locker" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!key) return;
          let k = key;
          let label = '';
          if (k === 'new') {
            const id = await ops.addItemType(newName, newKind);
            k = `item:${id}`;
            label = newName.trim();
          }
          const t = thingFrom(k, toCount(qty), (id) => label || name(id));
          if (!t.qty) return;
          await toast.run(ops.applyDeltas([{ loc: locker.path(storageId), strain: t.strain, field: t.field, item: t.item, delta: t.qty }]).then(() => ({ text: `Added ${t.qty} × ${t.label}.` })));
          onClose();
        }}
      >
        <p className="text-sm text-ash">For things you got yourself in the city. Taking gang property? Use “Take from a stash” so it’s signed out.</p>
        <div className="flex gap-1">
          {(['item', 'drug'] as const).map((x) => (
            <button key={x} type="button" onClick={() => setTab(x)} className={`chip px-3 py-1.5 text-xs ${tab === x ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {x === 'item' ? 'Guns, ammo & items' : 'Drugs'}
            </button>
          ))}
        </div>
        {tab === 'item' && isNew ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={40} autoFocus placeholder="e.g. Gold Lighter" />
              </Field>
              <Field label="Kind">
                <select className="input" value={newKind} onChange={(e) => setNewKind(e.target.value)}>
                  {ITEM_KINDS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.one}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="text-xs text-smoke">It’s added to the item list so others can pick it too.</p>
            <button type="button" className="text-xs text-gold-300 hover:underline" onClick={() => setIsNew(false)}>
              ← Back to the list
            </button>
          </div>
        ) : tab === 'item' ? (
          <div>
            <ItemPicker types={types} value={itemId} onChange={setItemId} />
            <button type="button" className="mt-1.5 text-xs text-gold-300 hover:underline" onClick={() => setIsNew(true)}>
              Not in the list? Add something new
            </button>
          </div>
        ) : (
          <DrugPicker value={drug} onChange={setDrug} />
        )}
        <Field label={itemId && tab === 'item' && !isNew ? `How many · ${name(itemId)}` : 'How many'}>
          <input className="input font-mono" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!key}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TakeDialog({ locker, onClose }: { locker: LockerApi; onClose: () => void }) {
  const { storage, stock, locLabel } = useNarcotics();
  const { name } = useItemTypes();
  const toast = useToast();
  const [from, setFrom] = useState(storage[0]?.id ?? '');
  // Drugs are signed out in NoelOps; here it's guns, gear and ammo.
  const things = thingsIn(stock.get(from), name).filter((t) => !!t.item);
  const [pick, setPick] = useState(0);
  const [qty, setQty] = useState('1');
  const [to, setTo] = useState(locker.storages[0]?.id ?? 'onme');
  const [error, setError] = useState('');
  const t = things[pick];
  return (
    <Modal title="Take from a stash" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (!t) return setError('Nothing to take there.');
          const q = Math.min(toCount(qty), t.qty);
          if (!q) return setError('How many?');
          try {
            const got = await locker.signOut(from, locLabel(from), to, { ...t, qty: q });
            if (!got) return setError('It’s not there any more.');
            toast.done({ text: `Signed out ${got} × ${t.label} from ${locLabel(from)}.` });
            onClose();
          } catch {
            setError('You can only take from stashes your rank or role lets you work.');
          }
        }}
      >
        <p className="text-sm text-ash">Gang property you take is logged as signed out until you return it. Leadership can see sign-outs, nothing else in your locker.</p>
        <Field label="From">
          <select
            className="input"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPick(0);
            }}
          >
            {storage.map((l) => (
              <option key={l.id} value={l.id}>
                {locLabel(l.id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What">
          {things.length ? (
            <select className="input" value={pick} onChange={(e) => setPick(Number(e.target.value))}>
              {things.map((x, i) => (
                <option key={i} value={i}>
                  {x.label} ({x.qty} there)
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-smoke">Nothing to take from here.</p>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="How many">
            <input className="input font-mono" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Into">
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {locker.storages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!t}>
            Sign out
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ThingDialog({ locker, storageId, thing, onClose }: { locker: LockerApi; storageId: string; thing: Thing; onClose: () => void }) {
  const { roster, me, canSee } = useHub();
  const { storage, locLabel } = useNarcotics();
  const toast = useToast();
  const { byId } = useItemTypes();
  const item = thing.item ? byId.get(thing.item) : undefined;
  const nameable = !!item && item.category !== 'ammo';
  const myVariant = !!item?.baseId && item.owner === me.id;
  const [mode, setMode] = useState<'move' | 'stash' | 'give' | 'name'>('move');
  const [custom, setCustom] = useState(myVariant ? item!.name : '');
  const [qty, setQty] = useState(String(thing.qty));
  const [to, setTo] = useState(locker.storages.find((s) => s.id !== storageId)?.id ?? '');
  const [stashTo, setStashTo] = useState(storage[0]?.id ?? '');
  const [who, setWho] = useState(roster.find((r) => r.id !== me.id)?.id ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  // Drugs go back into a stash in NoelOps; items can go in from here.
  const stashOk = (canSee('stash') || canSee('narcotics')) && !!thing.item;
  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = Math.min(toCount(qty), thing.qty);
    if (!q) return setError('How many?');
    const t = { ...thing, qty: q };
    try {
      if (mode === 'name') {
        const n = custom.trim();
        if (!n) return setError('Type a name.');
        if (myVariant && q === thing.qty) {
          await locker.renameVariant(item!.id, n);
          toast.done({ text: `Renamed to ${n}.` });
        } else {
          await locker.nameIt(storageId, t, item!, n);
          toast.done({ text: `${q} × ${item!.name} now named “${n}”.` });
        }
        return onClose();
      }
      if (mode === 'move') {
        if (!to) return setError('Make another storage first.');
        await locker.move([t], locker.path(storageId), locker.path(to));
        toast.done({ text: `Moved ${q} × ${thing.label} to ${locker.storages.find((s) => s.id === to)?.name}.` });
      } else if (mode === 'stash') {
        await locker.move([t], locker.path(storageId), stashTo);
        toast.done({ text: `Put ${q} × ${thing.label} in ${locLabel(stashTo)}.` });
      } else {
        const r = roster.find((x) => x.id === who);
        if (!r) return setError('Pick who it’s for.');
        await locker.offerMany(storageId, [t], NO_CASH, { id: r.id, name: r.name }, note);
        toast.done({ text: `Offered ${q} × ${thing.label} to ${r.name}. It’s held until they accept.` });
      }
      onClose();
    } catch {
      setError("That didn't go through. You may not have access to that stash.");
    }
  }
  return (
    <Modal title={thing.label} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['move', 'To another storage', ArrowLeftRight],
              ...(stashOk ? ([['stash', 'Into a gang stash', Warehouse]] as const) : []),
              ['give', 'Give / trade', Gift],
              ...(nameable ? ([['name', myVariant ? 'Rename' : 'Custom name', Tag]] as const) : []),
            ] as const
          ).map(([id, label, Icon]) => (
            <button key={id} type="button" onClick={() => setMode(id)} className={`chip px-3 py-1.5 text-xs ${mode === id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              <Icon className="size-3.5" /> {label}
            </button>
          ))}
        </div>
        <Field label={`How many · you have ${thing.qty}`}>
          <input className="input font-mono" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        {mode === 'move' && (
          <Field label="To">
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
              {locker.storages
                .filter((s) => s.id !== storageId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </Field>
        )}
        {mode === 'stash' && (
          <Field label="Which stash" hint="Returning something you signed out? Use Return under Signed out instead, so it’s closed off.">
            <select className="input" value={stashTo} onChange={(e) => setStashTo(e.target.value)}>
              {storage.map((l) => (
                <option key={l.id} value={l.id}>
                  {locLabel(l.id)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {mode === 'name' && (
          <Field
            label="Custom name"
            hint={`Event variants, engraved pieces, a gun with history. It stays a ${byId.get(item?.baseId ?? item?.id ?? '')?.name ?? 'item'} underneath, and can be moved, traded and put on display.`}
          >
            <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={40} placeholder="e.g. Pumpkin Bat, Vito’s Golden .50" autoFocus />
          </Field>
        )}
        {mode === 'give' && (
          <>
            <Field label="To" hint="It leaves your locker now and goes to theirs when they accept.">
              <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
                {roster
                  .filter((r) => r.id !== me.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Note">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Optional, e.g. for the job tonight" />
            </Field>
          </>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">{mode === 'give' ? 'Offer' : mode === 'name' ? 'Save name' : 'Move'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Moves everything a loadout or kit needs into On Me, from your other storages. */
function PackDialog({ locker, onClose }: { locker: LockerApi; onClose: () => void }) {
  const { me } = useHub();
  const { types, name } = useItemTypes();
  const toast = useToast();
  const gear = useMyKits(me.id);
  const gearKits = [...(gear.kits ?? [])].sort((a, b) => Number(b.id === gear.equipped) - Number(a.id === gear.equipped));
  const [pick, setPick] = useState<string>('');
  const chosen = pick || (gearKits[0] ? `g:${gearKits[0].id}` : (locker.kits[0]?.id ?? ''));
  const [editing, setEditing] = useState<Kit | null>(null);
  const onme = locker.storages.find((s) => s.id === 'onme') ?? locker.storages[0]!;
  const kit = locker.kits.find((k) => k.id === chosen);
  const gearKit = gearKits.find((k) => `g:${k.id}` === chosen);
  const needs = gearKit ? [...kitNeeds(gearKit).entries()].map(([item, qty]) => ({ item, qty })) : (kit?.items ?? []);
  const have = (item: string) => countOf(locker.stock.get(onme.id), { field: 'meth', item });
  const elsewhere = (item: string) => locker.storages.filter((s) => s.id !== onme.id).reduce((t, s) => t + countOf(locker.stock.get(s.id), { field: 'meth', item }), 0);
  const rows = needs.map((n) => ({ ...n, have: have(n.item), more: Math.max(0, n.qty - have(n.item)), spare: elsewhere(n.item) }));
  async function pack() {
    let moved = 0;
    for (const r of rows) {
      let left = r.more;
      for (const s of locker.storages.filter((x) => x.id !== onme.id)) {
        if (left <= 0) break;
        const c = countOf(locker.stock.get(s.id), { field: 'meth', item: r.item });
        if (!c) continue;
        const n = Math.min(c, left);
        const got = await locker.move([{ field: 'meth', item: r.item, qty: n, label: name(r.item) }], locker.path(s.id), locker.path(onme.id));
        const g = got.length ? -got[0]!.delta : 0;
        left -= g;
        moved += g;
      }
    }
    toast.done({ text: moved ? `Packed ${moved} ${moved === 1 ? 'thing' : 'things'} into ${onme.name}.` : `${onme.name} already has everything it can get.` });
    onClose();
  }
  if (editing)
    return <KitEditor locker={locker} kit={editing} types={types} name={name} onClose={() => setEditing(null)} />;
  return (
    <Modal title="Pack for a run" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {gearKits.map((k) => (
            <button key={k.id} onClick={() => setPick(`g:${k.id}`)} className={`chip px-3 py-1.5 text-xs ${chosen === `g:${k.id}` ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {k.id === gear.equipped && <Star className="mr-1 inline size-3 fill-current" />}
              {k.name}
            </button>
          ))}
          {locker.kits.map((k) => (
            <button key={k.id} onClick={() => setPick(k.id)} className={`chip px-3 py-1.5 text-xs ${chosen === k.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {k.name}
            </button>
          ))}
          <button className="chip bg-raised px-3 py-1.5 text-xs text-gold-300" onClick={() => setEditing({ id: `k${Date.now().toString(36)}`, name: '', items: [] })}>
            <Plus className="mr-1 inline size-3" />
            Packing list
          </button>
          {kit && (
            <button className="chip bg-raised px-3 py-1.5 text-xs text-ash" onClick={() => setEditing(kit)}>
              <Pencil className="mr-1 inline size-3" />
              Edit list
            </button>
          )}
        </div>
        {rows.length ? (
          <ul className="divide-y divide-line-soft border border-line-soft">
            {rows.map((r) => (
              <li key={r.item} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-gold-100">{name(r.item)}</span>
                <span className="font-mono text-xs text-smoke">
                  {r.have}/{r.qty} on you
                </span>
                {r.more === 0 ? (
                  <Check className="size-4 text-ok" />
                ) : r.spare ? (
                  <span className="text-xs text-gold-300">+{Math.min(r.more, r.spare)} from storage</span>
                ) : (
                  <span className="text-xs text-red-300">missing {r.more}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-smoke">{pick === 'loadout' ? 'Your loadout is empty. Set it up in Gear & Loadouts.' : 'This kit is empty.'}</p>
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!rows.some((r) => r.more && r.spare)} onClick={pack}>
            <PackageCheck className="size-4" /> Pack into {onme.name}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function KitEditor({ locker, kit, types, name, onClose }: { locker: LockerApi; kit: Kit; types: ItemType[]; name: (id: string) => string; onClose: () => void }) {
  const [k, setK] = useState<Kit>(kit);
  const [adding, setAdding] = useState<string | null>(null);
  const exists = locker.kits.some((x) => x.id === kit.id);
  return (
    <Modal title={exists ? `Edit ${kit.name}` : 'New kit'} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!k.name.trim()) return;
          const clean = { ...k, name: k.name.trim().slice(0, 30), items: k.items.filter((i) => i.qty > 0).slice(0, 30) };
          await locker.saveKits(exists ? locker.kits.map((x) => (x.id === k.id ? clean : x)) : [...locker.kits, clean]);
          onClose();
        }}
      >
        <Field label="Kit name">
          <input className="input" value={k.name} onChange={(e) => setK({ ...k, name: e.target.value })} maxLength={30} placeholder="e.g. Blacksite kit" autoFocus />
        </Field>
        <ul className="space-y-1">
          {k.items.map((i, n) => (
            <li key={i.item} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate text-gold-100">{name(i.item)}</span>
              <input className="input w-20 py-1 font-mono" inputMode="numeric" value={i.qty} onChange={(e) => setK({ ...k, items: k.items.map((x, j) => (j === n ? { ...x, qty: Math.max(0, +e.target.value.replace(/\D/g, '') || 0) } : x)) })} />
              <button type="button" onClick={() => setK({ ...k, items: k.items.filter((_, j) => j !== n) })} aria-label="Remove">
                <X className="size-4 text-smoke" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <ItemPicker types={types} value={adding} onChange={setAdding} />
          </div>
          <button type="button" className="btn-ghost" disabled={!adding} onClick={() => adding && (setK({ ...k, items: [...k.items.filter((x) => x.item !== adding), { item: adding, qty: 1 }] }), setAdding(null))}>
            <Plus className="size-4" /> Add
          </button>
        </div>
        <div className="flex justify-between gap-2">
          {exists ? (
            <button type="button" className="btn-danger" onClick={() => locker.saveKits(locker.kits.filter((x) => x.id !== kit.id)).then(onClose)}>
              <Trash2 className="size-4" /> Delete kit
            </button>
          ) : (
            <span />
          )}
          <button className="btn-gold">Save kit</button>
        </div>
      </form>
    </Modal>
  );
}

/** Put cash you got in the city into your locker, or take some out. Counts toward your BlackMarket balances. */
function CashDialog({ kind: start, onClose }: { kind: 'dirty' | 'clean'; onClose: () => void }) {
  const { me } = useHub();
  const m = useMoney();
  const [kind, setKind] = useState(start);
  const [dir, setDir] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const q = useMemo(() => query(collection(db, 'myCash'), where('memberId', '==', me.id)), [me.id]);
  const history = (useCollection<MyCash>(q) ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now())).slice(0, 8);
  const have = kind === 'dirty' ? m.mine.held : m.mine.clean;
  return (
    <Modal title="Cash in your locker" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = Math.round(+amount.replace(/\D/g, '') || 0);
          if (!n) return setError('How much?');
          if (dir === 'out' && n > have) return setError(`You only have ${money(have)} ${kind}.`);
          const v = dir === 'in' ? n : -n;
          await addMyCash(me.id, kind === 'dirty' ? v : 0, kind === 'clean' ? v : 0, note);
          onClose();
        }}
      >
        <div className="grid grid-cols-2 gap-2">
          {(['dirty', 'clean'] as const).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`border p-2 text-sm ${kind === k ? 'border-gold-400 bg-gold-400/10 text-gold-100' : 'border-line text-ash'}`}>
              {k === 'dirty' ? 'Dirty' : 'Clean'} · <span className="font-mono">{money(k === 'dirty' ? m.mine.held : m.mine.clean)}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['in', 'out'] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDir(d)} className={`chip px-3 py-1.5 text-xs ${dir === d ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {d === 'in' ? <Plus className="mr-1 inline size-3" /> : <Minus className="mr-1 inline size-3" />}
              {d === 'in' ? 'Add' : 'Take out'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <Field label="Amount">
            <input className="input font-mono" inputMode="numeric" placeholder="$" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </Field>
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder={dir === 'in' ? 'e.g. Store robbery' : 'e.g. Bought a car'} />
          </Field>
        </div>
        <p className="text-xs text-smoke">For money you got (or spent) yourself in the city. It counts toward your dirty and clean balances, so you can wash it or trade it.</p>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">{dir === 'in' ? 'Add' : 'Take out'}</button>
        </div>
      </form>
      {history.length > 0 && (
        <div className="mt-5 border-t border-line-soft pt-3">
          <p className="label mb-1">Recent</p>
          <ul className="space-y-1 text-xs">
            {history.map((h) => {
              const v = h.dirty || h.clean;
              return (
                <li key={h.id} className="flex gap-2">
                  <span className={`w-24 font-mono ${v < 0 ? 'text-red-300' : 'text-ok'}`}>
                    {v < 0 ? '−' : '+'}
                    {money(Math.abs(v))}
                  </span>
                  <span className="text-smoke">{h.dirty ? 'dirty' : 'clean'}</span>
                  <span className="flex-1 truncate text-ash">{h.note}</span>
                  <span className="text-smoke">{ago(h.at)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}

// ---------- page ----------

const SORTS = [
  ['kind', 'Kind'],
  ['name', 'Name'],
  ['count', 'Count'],
  ['value', 'Value'],
] as const;
type SortId = (typeof SORTS)[number][0];
const DRAG = 'application/x-chosenops-thing';

function Tile({ t, kind, meta, signed, onOpen, onDragStart }: { t: Thing; kind: string; meta?: ItemMeta; signed: boolean; onOpen: () => void; onDragStart: (e: DragEvent<HTMLButtonElement>) => void }) {
  const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? Box;
  const color = KIND_COLOR[kind] ?? KIND_COLOR.other!;
  const logo = !t.item ? `/noel/logos/${t.strain ?? (t.field === 'coca' ? 'cokeSmall' : t.field)}.png` : null;
  return (
    <button
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      title={`${t.label} × ${t.qty.toLocaleString()}`}
      className="locker-tile group relative flex aspect-square w-full flex-col items-center justify-center gap-1 overflow-hidden border bg-coal/80 p-1.5 transition hover:-translate-y-0.5"
      style={{ borderColor: `${color}88`, boxShadow: `inset 0 0 18px ${color}22` }}
    >
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ background: color }} />
      {meta?.pic ? (
        <img src={meta.pic} alt="" className="size-[58%] rounded-sm object-cover" />
      ) : logo ? (
        <img src={logo} alt="" className="size-[58%] object-contain" />
      ) : (
        <Icon className="size-[42%] transition group-hover:scale-110" style={{ color }} />
      )}
      <span className="w-full truncate text-center text-[10px] leading-tight text-gold-100 sm:text-[11px]">{t.label}</span>
      <span className="absolute right-1 bottom-1 rounded-sm bg-black/70 px-1 font-mono text-[10px] text-gold-200">×{t.qty.toLocaleString()}</span>
      {meta?.fav && <Star className="absolute top-1 left-1 size-3 fill-gold-300 text-gold-300" />}
      {signed && <span className="locker-stamp absolute top-1.5 right-0.5 rotate-12 border border-red-400/70 px-0.5 text-[7px] font-black tracking-wider text-red-300">GANG</span>}
    </button>
  );
}

/** Tap a tile: the item up close, with your own picture, note, value and favorite star. */
function Inspect({ locker, storageId, t, kind, onAction, onClose }: { locker: LockerApi; storageId: string; t: Thing; kind: string; onAction: () => void; onClose: () => void }) {
  const { byId } = useItemTypes();
  const ops = useOps('stash');
  const toast = useToast();
  const key = thingKey(t);
  const m = locker.meta[key] ?? {};
  const [note, setNote] = useState(m.note ?? '');
  const [value, setValue] = useState(m.value ? String(m.value) : '');
  const fileRef = useRef<HTMLInputElement>(null);
  const item = t.item ? byId.get(t.item) : undefined;
  const color = KIND_COLOR[kind] ?? KIND_COLOR.other!;
  const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? Box;
  const save = (patch: ItemMeta) => locker.setMeta(key, { ...m, ...patch });
  const bump = (d: number) => toast.run(ops.applyDeltas([{ loc: locker.path(storageId), strain: t.strain, field: t.field, item: t.item, delta: d }]).then(() => null));
  const count = countOf(locker.stock.get(storageId), t);
  return (
    <Modal title={t.label} onClose={onClose}>
      <div className="flex gap-4">
        <button
          onClick={() => fileRef.current?.click()}
          className="relative grid size-28 shrink-0 place-items-center overflow-hidden border-2 bg-coal"
          style={{ borderColor: color, boxShadow: `0 0 24px ${color}44` }}
          title="Set a picture"
        >
          {m.pic ? (
            <img src={m.pic} alt="" className="size-full object-cover" />
          ) : !t.item ? (
            <img src={`/noel/logos/${t.strain ?? (t.field === 'coca' ? 'cokeSmall' : t.field)}.png`} alt="" className="size-20 object-contain" />
          ) : (
            <Icon className="size-12" style={{ color }} />
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/70 py-0.5 text-[10px] text-smoke">
            <Camera className="mr-1 inline size-3" />
            picture
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) await save({ pic: await squareImage(f, 128, 0.8) });
          }}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="label" style={{ color }}>
            {item ? (ITEM_KINDS.find((k) => k.id === kind)?.one ?? 'Item') : 'Drugs'}
            {item?.custom && ' · added by a member'}
          </p>
          {item?.baseId && <p className="text-xs text-smoke">A {byId.get(item.baseId)?.name ?? 'custom'} underneath</p>}
          <div className="flex items-center gap-2">
            <button className="btn-ghost btn-sm px-2" onClick={() => bump(-1)} disabled={!count} aria-label="One less">
              <Minus className="size-3.5" />
            </button>
            <span className="min-w-12 text-center font-mono text-2xl text-gold-100">{count.toLocaleString()}</span>
            <button className="btn-ghost btn-sm px-2" onClick={() => bump(1)} aria-label="One more">
              <Plus className="size-3.5" />
            </button>
          </div>
          <button onClick={() => save({ fav: !m.fav })} className={`chip px-2.5 py-1 text-xs ${m.fav ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
            <Star className={`mr-1 inline size-3 ${m.fav ? 'fill-void' : ''}`} />
            {m.fav ? 'Favorite' : 'Mark favorite'}
          </button>
          {m.pic && (
            <button className="ml-2 text-xs text-smoke hover:text-red-300" onClick={() => save({ pic: null })}>
              Remove picture
            </button>
          )}
        </div>
      </div>
      <form
        className="mt-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await save({ note: note.trim().slice(0, 200), value: Math.max(0, Math.round(+value.replace(/\D/g, '') || 0)) });
          onClose();
        }}
      >
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Serial, where you got it…" />
          </Field>
          <Field label="Value each">
            <input className="input font-mono" inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} placeholder="$" />
          </Field>
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <button type="button" className="btn-ghost" onClick={onAction} disabled={!count}>
            <Send className="size-4" /> Move · give · stash · name
          </button>
          {t.item && <WishlistButton label="Want more" className="btn-ghost" items={[{ item: t.item, qty: 1 }]} />}
          <button className="btn-gold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function LockerGrid({ locker, onOpen }: { locker: LockerApi; onOpen: (storageId: string, t: Thing) => void }) {
  // The doors stay shut until you open them.
  const [opened, setOpened] = useState(false);
  const [gone, setGone] = useState(false);
  const { name: itemName, byId } = useItemTypes();
  const ops = useOps('stash');
  const toast = useToast();
  const [tab, setTab] = useState(locker.storages[0]?.id ?? 'onme');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string>('all');
  const [sort, setSort] = useState<SortId>('kind');
  const [adding, setAdding] = useState(false);
  const [inspect, setInspect] = useState<Thing | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStorage, setNewStorage] = useState('');
  const [over, setOver] = useState<string | null>(null);
  const storage = locker.storages.find((s) => s.id === tab) ?? locker.storages[0];
  const id = storage?.id ?? 'onme';
  const things = thingsIn(locker.stock.get(id), itemName);
  const kindOfThing = (t: Thing) => (t.item ? (kindOf(byId.get(t.item), byId) ?? 'other') : 'drug');
  const signed = new Set(locker.signouts.filter((s) => s.status === 'out' && s.storageId === id).map((s) => thingKey(s.thing)));
  const bump = (t: Thing, d: number) => toast.run(ops.applyDeltas([{ loc: locker.path(id), strain: t.strain, field: t.field, item: t.item, delta: d }]).then(() => null));
  const order = ['drug', ...ITEM_KINDS.map((k) => k.id)];
  const shown = things
    .filter((t) => kindOfThing(t) !== 'ammo')
    .filter((t) => kind === 'all' || (kind === 'fav' ? locker.meta[thingKey(t)]?.fav : kindOfThing(t) === kind))
    .filter((t) => !q.trim() || t.label.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => {
      const fa = Number(!!locker.meta[thingKey(b)]?.fav) - Number(!!locker.meta[thingKey(a)]?.fav);
      if (fa) return fa;
      if (sort === 'name') return a.label.localeCompare(b.label);
      if (sort === 'count') return b.qty - a.qty;
      if (sort === 'value') return (locker.meta[thingKey(b)]?.value ?? 0) * b.qty - (locker.meta[thingKey(a)]?.value ?? 0) * a.qty;
      return order.indexOf(kindOfThing(a)) - order.indexOf(kindOfThing(b)) || a.label.localeCompare(b.label);
    });
  const kinds = order.filter((k) => k !== 'ammo' && things.some((t) => kindOfThing(t) === k));
  const others = locker.storages.filter((s) => s.id !== id);

  async function drop(e: DragEvent, to: string) {
    e.preventDefault();
    setOver(null);
    const raw = e.dataTransfer.getData(DRAG);
    if (!raw || to === id) return;
    const t = JSON.parse(raw) as Thing;
    const target = locker.storages.find((s) => s.id === to);
    await toast.run(locker.move([t], locker.path(id), locker.path(to)).then((m) => (m.length ? { text: `Moved ${t.qty} × ${t.label} to ${target?.name}.` } : null)));
  }

  return (
    <section className={`hud locker-doors mb-6 ${opened ? 'open' : ''}`}>
      {!gone && (
        <button className="locker-shut" onClick={() => setOpened(true)} aria-label="Open your locker" disabled={opened}>
          <span className="locker-door l" onAnimationEnd={() => setGone(true)} />
          <span className="locker-door r" />
          {!opened && (
            <span className="locker-open-hint">
              <Lock className="size-5" />
              Tap to open
            </span>
          )}
        </button>
      )}
      <div className="flex flex-wrap items-end gap-1 border-b border-line px-3 pt-3">
        {locker.storages.map((s) => {
          const n = thingsIn(locker.stock.get(s.id), itemName).reduce((t, x) => t + x.qty, 0);
          return (
            <button
              key={s.id}
              onClick={() => (setTab(s.id), setRenaming(false))}
              onDragOver={(e) => (e.preventDefault(), setOver(s.id))}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => drop(e, s.id)}
              className={`-mb-px flex items-center gap-2 border border-b-0 px-3 py-2 font-hud text-sm font-bold transition ${s.id === id ? 'border-line bg-coal text-gold-100' : 'border-transparent text-smoke hover:text-gold-200'} ${over === s.id ? 'locker-drop' : ''}`}
            >
              {s.id === 'onme' ? <Backpack className="size-3.5" /> : <Box className="size-3.5" />}
              {s.name}
              <span className="font-mono text-[10px] text-smoke">{n.toLocaleString()}</span>
            </button>
          );
        })}
        <form
          className="mb-1 ml-auto flex gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newStorage.trim()) return;
            await locker.addStorage(newStorage);
            setNewStorage('');
          }}
        >
          <input className="input w-36 py-1 text-xs" placeholder="New storage…" value={newStorage} onChange={(e) => setNewStorage(e.target.value)} maxLength={30} />
          <button className="btn-ghost btn-sm px-2" aria-label="Add storage">
            <Plus className="size-3.5" />
          </button>
        </form>
      </div>

      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {renaming ? (
            <form
              className="flex gap-1"
              onSubmit={async (e) => {
                e.preventDefault();
                if (newName.trim()) await locker.renameStorage(id, newName);
                setRenaming(false);
              }}
            >
              <input className="input py-1 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus maxLength={30} />
              <button className="btn-gold btn-sm">Save</button>
            </form>
          ) : (
            <h2 className="font-display text-xl font-bold text-gold-100">{storage?.name}</h2>
          )}
          <button className="btn-ghost btn-sm px-2" onClick={() => (setNewName(storage?.name ?? ''), setRenaming(true))} title="Rename">
            <Pencil className="size-3.5" />
          </button>
          {others.length > 0 && (
            <button
              className="btn-ghost btn-sm px-2"
              title="Remove this storage"
              onClick={() => confirm(`Remove ${storage?.name}? ${things.length ? `Everything in it moves to ${others[0]!.name}.` : ''}`) && locker.removeStorage(id, others[0]!.id, itemName).then(() => setTab(others[0]!.id))}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
          <button className="btn-gold btn-sm ml-auto" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" /> Add
          </button>
        </div>

        <AmmoPills things={things} byId={byId} bump={bump} onOpen={(t) => onOpen(id, t)} />

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-40 flex-1">
            <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-smoke" />
            <input className="input py-1.5 pl-8 text-sm" placeholder="Search this storage" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <select className="input w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Sort">
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                Sort: {l}
              </option>
            ))}
          </select>
        </div>
        {kinds.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1">
            {['all', 'fav', ...kinds].map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`chip px-2.5 py-1 text-[11px] ${kind === k ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}
                style={kind !== k && KIND_COLOR[k] ? { boxShadow: `inset 0 -2px 0 ${KIND_COLOR[k]}` } : undefined}
              >
                {k === 'all' ? 'All' : k === 'fav' ? '★ Favorites' : k === 'drug' ? 'Drugs' : (ITEM_KINDS.find((x) => x.id === k)?.label ?? k)}
              </button>
            ))}
          </div>
        )}

        {shown.length ? (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8">
            {shown.map((t, i) => (
              <div key={thingKey(t)} className="locker-pop" style={{ animationDelay: `${Math.min(i, 24) * 25}ms` }}>
                <Tile
                  t={t}
                  kind={kindOfThing(t)}
                  meta={locker.meta[thingKey(t)]}
                  signed={signed.has(thingKey(t))}
                  onOpen={() => setInspect(t)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG, JSON.stringify(t));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-smoke">{things.length ? 'Nothing matches.' : 'Empty. Add something, or drag things here from another storage tab.'}</p>
        )}
        <p className="mt-3 hidden text-[11px] text-smoke sm:block">Drag a tile onto another storage tab to move it all. Tap a tile to see it up close.</p>
      </div>
      {adding && <AddDialog locker={locker} storageId={id} onClose={() => setAdding(false)} />}
      {inspect && (
        <Inspect
          locker={locker}
          storageId={id}
          t={inspect}
          kind={kindOfThing(inspect)}
          onClose={() => setInspect(null)}
          onAction={() => {
            const t = inspect;
            setInspect(null);
            onOpen(id, t);
          }}
        />
      )}
    </section>
  );
}

/** My Personal Wishlist: things I want, added from anywhere in the HQ. Tick them off as I get them. */
function ShoppingPanel({ name }: { name: (id: string) => string }) {
  const { me } = useHub();
  const list = useShopping(me.id);
  if (!list?.length) return null;
  return (
    <Panel title={`Personal Wishlist · ${list.length}`} className="mb-6" right={<ShoppingCart className="size-4 text-gold-500" />}>
      <ul className="divide-y divide-line-soft">
        {list.map((s) => (
          <li key={s.item} className="flex items-center gap-2 py-1.5 text-sm">
            <button className="text-smoke hover:text-ok" onClick={() => saveShopping(me.id, list.filter((x) => x.item !== s.item))} aria-label="Got it" title="Got it">
              <Check className="size-4" />
            </button>
            <span className="min-w-0 flex-1 truncate text-gold-100">{name(s.item)}</span>
            {s.from && <span className="text-[11px] text-smoke">for {s.from}</span>}
            <span className="font-mono text-xs text-gold-300">×{s.qty}</span>
          </li>
        ))}
      </ul>
      <button className="mt-2 text-xs text-smoke hover:text-gold-200" onClick={() => confirm('Clear your whole Personal Wishlist?') && saveShopping(me.id, [])}>
        Clear the list
      </button>
    </Panel>
  );
}

/** Send dirty money to the family's washers: it leaves your locker now, the clean comes back when it's done. */
export function WashDialog({ onClose }: { onClose: () => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const a = Math.round(Number(amount) || 0);
  const back = Math.round((a * (100 - m.washPct)) / 100);
  return (
    <Modal title="Wash dirty money" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (a <= 0) return setError('Enter how much to wash.');
          if (a > m.mine.held) return setError(`You only hold ${money(m.mine.held)} dirty.`);
          await mops.requestWash(a, m.washPct, note.trim());
          onClose();
        }}
      >
        <p className="text-sm text-ash">A family washer claims it and washes it in the city. It leaves your dirty money now; {100 - m.washPct}% comes back clean when it’s done. No fee on top.</p>
        <Field label={`Amount · you hold ${money(m.mine.held)}`}>
          <input className="input font-mono text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[25, 50, 100].map((p) => (
            <button type="button" key={p} className="btn-ghost btn-sm" onClick={() => setAmount(String(Math.floor((m.mine.held * p) / 100)))}>
              {p === 100 ? 'All' : `${p}%`}
            </button>
          ))}
        </div>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Optional" />
        </Field>
        {a > 0 && (
          <p className="text-center text-sm">
            <span className="font-mono text-red-300">{money(a)}</span> dirty → <span className="font-mono text-gold-100">{money(back)}</span> clean
          </p>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Send to the washers</button>
        </div>
      </form>
    </Modal>
  );
}

/** My wash requests that are still going, or finished lately. */
export function WashList() {
  const { me } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const mine = m.washReqs.filter((w) => w.memberId === me.id && (w.status === 'open' || w.status === 'claimed' || (w.doneAt?.toMillis() ?? 0) > Date.now() - 3 * 86400e3));
  if (!mine.length) return null;
  return (
    <Panel title="Washing" className="mb-6">
      <ul className="divide-y divide-line-soft">
        {mine.map((w) => (
          <li key={w.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-mono text-red-300">{money(w.dirty)}</span>→<span className="font-mono text-gold-100">{money(w.clean)}</span>
            <span className="text-xs text-smoke">· {ago(w.at)}</span>
            <span
              className={`chip ml-auto px-2 py-0.5 text-[11px] font-bold ${w.status === 'done' ? 'bg-ok/15 text-green-300' : w.status === 'claimed' ? 'bg-sky-500/20 text-sky-300' : w.status === 'cancelled' ? 'bg-raised text-smoke' : 'bg-gold-400/15 text-gold-200'}`}
            >
              {w.status === 'done' ? 'Clean · in your locker' : w.status === 'claimed' ? `${w.claimerName} is washing it${w.timerEnd && w.timerEnd.toMillis() > Date.now() ? ` · ~${Math.ceil((w.timerEnd.toMillis() - Date.now()) / 60000)}m left` : ''}` : w.status === 'cancelled' ? 'Cancelled' : 'Waiting for a washer'}
            </span>
            {w.status === 'open' && (
              <button className="text-xs text-smoke hover:text-red-300" onClick={() => mops.washStep(w, 'cancel')}>
                Cancel
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Body() {
  const locker = useLocker();
  const m = useMoney();
  const { canSee, memberById, me } = useHub();
  const toast = useToast();
  const nudgeQ = useMemo(() => query(collection(db, 'nudges'), where('to', '==', me.id)), [me.id]);
  const nudges = useCollection<Nudge>(nudgeQ) ?? [];
  const [taking, setTaking] = useState(false);
  const [trading, setTrading] = useState(false);
  const [packing, setPacking] = useState(false);
  const [cash, setCash] = useState<'dirty' | 'clean' | null>(null);
  const [washing, setWashing] = useState(false);
  const { name: itemName } = useItemTypes();
  const [open, setOpen] = useState<{ storageId: string; thing: Thing } | null>(null);
  const [acceptInto, setAcceptInto] = useState<Record<string, string>>({});
  if (!locker.ready) return null;
  const out = locker.signouts.filter((s) => s.status === 'out');
  // First-version (one item) trades still in flight; new ones show in the Trades panel.
  const v1 = (t: { thing?: unknown }) => !!t.thing;
  const incoming = locker.tradesIn.filter((t) => v1(t) && t.status === 'pending');
  const mine = locker.tradesOut.filter((t) => v1(t) && (t.status === 'pending' || t.status === 'declined'));
  const stashOk = canSee('stash') || canSee('narcotics');

  return (
    <>
      <PageHeader
        icon={Lock}
        kicker="Only you can see this"
        title="My Locker"
        sub="Your own things, in storages you name. On Me is what you’re carrying, and your loadout will pull from it."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setPacking(true)}>
              <Backpack className="size-4" /> Pack for a run
            </button>
            <button className="btn-ghost" onClick={() => setTrading(true)}>
              <Handshake className="size-4" /> New trade
            </button>
            {stashOk && (
              <button className="btn-gold" onClick={() => setTaking(true)}>
                <PackageOpen className="size-4" /> Take from a stash
              </button>
            )}
          </>
        }
      />

      <Safe name={`${me.name}'s safe`}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <button className="text-left" onClick={() => setCash('dirty')} title="Add or take out dirty cash">
          <Stat label="Dirty money" value={<span className="text-red-300">{money(m.mine.held)}</span>} sub={<span className="text-gold-300">+ add or take out</span>} />
        </button>
        <button className="text-left" onClick={() => setCash('clean')} title="Add or take out clean cash">
          <Stat label="Clean money" value={money(m.mine.clean)} sub={<span className="text-gold-300">+ add or take out</span>} />
        </button>
        <button className="text-left" onClick={() => setWashing(true)} title="Send dirty money to the family's washers">
          <Stat
            label="Washing"
            value={<span className="text-sky-300">{money(m.washReqs.filter((w) => w.memberId === m.mine.id && (w.status === 'open' || w.status === 'claimed')).reduce((t, w) => t + w.dirty, 0))}</span>}
            sub={<span className="text-gold-300">+ wash dirty money</span>}
          />
        </button>
        <Stat label="Owed to you" value={<span className={m.mine.owed ? 'text-gold-200' : ''}>{money(m.mine.owed)}</span>} sub="by the Treasurer" />
      </div>
      </Safe>

      <WashList />

      {(incoming.length > 0 || mine.length > 0) && (
        <Panel title="Older trades" className="mb-6">
          <ul className="space-y-2">
            {incoming.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 border border-gold-700/50 bg-gold-400/5 px-3 py-2">
                <Avatar member={memberById.get(t.from)} />
                <span className="min-w-[12rem] flex-1 basis-[calc(100%-4rem)] text-sm sm:basis-0">
                  <b className="text-gold-100">{t.fromName}</b> wants to give you <b className="text-gold-100">{t.thing.qty} × {t.thing.label}</b>
                  {t.note && <span className="text-smoke"> · “{t.note}”</span>}
                  <span className="block text-xs text-smoke">{ago(t.at)}</span>
                </span>
                <select className="input w-auto py-1" value={acceptInto[t.id] ?? locker.storages[0]!.id} onChange={(e) => setAcceptInto({ ...acceptInto, [t.id]: e.target.value })}>
                  {locker.storages.map((s) => (
                    <option key={s.id} value={s.id}>
                      Into {s.name}
                    </option>
                  ))}
                </select>
                <button className="btn-gold btn-sm" onClick={() => toast.run(locker.accept(t, acceptInto[t.id] ?? locker.storages[0]!.id).then(() => ({ text: `Got ${t.thing.qty} × ${t.thing.label} from ${t.fromName}.` })))}>
                  <Check className="size-3.5" /> Accept
                </button>
                <button className="btn-danger btn-sm" onClick={() => locker.decline(t)}>
                  <X className="size-3.5" /> Decline
                </button>
              </li>
            ))}
            {mine.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 border border-line-soft px-3 py-2">
                <Avatar member={memberById.get(t.to)} />
                <span className="min-w-[12rem] flex-1 basis-[calc(100%-4rem)] text-sm sm:basis-0">
                  {t.status === 'pending' ? 'Waiting on' : <b className="text-red-300">Declined by</b>} <b className="text-gold-100">{t.toName}</b>: {t.thing.qty} × {t.thing.label}
                  <span className="block text-xs text-smoke">{ago(t.at)}</span>
                </span>
                <button className="btn-ghost btn-sm" onClick={() => toast.run(locker.takeBack(t).then(() => ({ text: `${t.thing.label} is back in your locker.` })))}>
                  <Undo2 className="size-3.5" /> {t.status === 'pending' ? 'Cancel' : 'Take back'}
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {out.length > 0 && (
        <Panel title={`Signed out · ${out.length}`} className="mb-6" right={<ShieldAlert className="size-4 text-gold-500" />}>
          <ul className="divide-y divide-line-soft">
            {out.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                <span className="min-w-[12rem] flex-1 basis-[calc(100%-4rem)] text-sm sm:basis-0">
                  <b className="text-gold-100">
                    {s.thing.qty} × {s.thing.label}
                  </b>{' '}
                  <span className="text-smoke">
                    from {s.fromLabel} · in your {locker.storages.find((x) => x.id === s.storageId)?.name ?? 'locker'} · {ago(s.at)}
                  </span>
                </span>
                <button className="btn-gold btn-sm" onClick={() => toast.run(
                      locker
                        .returnSignout(s)
                        .then(() => clearNudges(nudges.filter((n) => n.signoutId === s.id).map((n) => n.id)))
                        .then(() => ({ text: `Returned to ${s.fromLabel}.` })),
                    )}>
                  <Undo2 className="size-3.5" /> Return
                </button>
                <button className="btn-ghost btn-sm" onClick={() => confirm('Mark it as lost?') && locker.closeSignout(s, 'lost')}>
                  Lost
                </button>
                <button className="btn-danger btn-sm" onClick={() => confirm('Mark it as seized by the cops?') && locker.closeSignout(s, 'seized')}>
                  Seized
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <TradesPanel locker={locker} itemName={itemName} />

      <ShoppingPanel name={itemName} />

      <LockerGrid locker={locker} onOpen={(storageId, thing) => setOpen({ storageId, thing })} />

      {!locker.storages.length && <Empty title="No storages">Add one above.</Empty>}
      {taking && <TakeDialog locker={locker} onClose={() => setTaking(false)} />}
      {trading && <NewTrade locker={locker} itemName={itemName} onClose={() => setTrading(false)} />}
      {packing && <PackDialog locker={locker} onClose={() => setPacking(false)} />}
      {cash && <CashDialog kind={cash} onClose={() => setCash(null)} />}
      {washing && <WashDialog onClose={() => setWashing(false)} />}
      {open && <ThingDialog locker={locker} storageId={open.storageId} thing={{ ...open.thing, qty: countOf(locker.stock.get(open.storageId), open.thing) || open.thing.qty }} onClose={() => setOpen(null)} />}
    </>
  );
}

export default function Locker() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}

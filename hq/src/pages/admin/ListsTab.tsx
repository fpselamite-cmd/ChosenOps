import { collection, orderBy, query, limit } from 'firebase/firestore';
import { ArrowDown, ArrowUp, Car, Check, Eye, EyeOff, Package, Plus, Siren, Tag, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CrimeIcon, CRIME_ICON } from '../../components/CrimeIcon';
import { ItemPicker } from '../../components/ItemPicker';
import { Panel, Tabs } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { feed, logPrice, saveLists, slugId, useLists, type CrimeType, type PriceChange, type Product, type VehicleRow } from '../../lib/adminData';
import { db } from '../../lib/firebase';
import { ago } from '../../lib/format';
import type { ItemType } from '../../lib/items';
import { money, SALE_ITEMS, useMoney, useMoneyOps } from '../../lib/money';
import { VEHICLE_CLASSES, vehicleSrc } from '../../lib/vehicles';
import ItemsTab from './ItemsTab';

type Sub = 'crimes' | 'vehicles' | 'products' | 'items';
const digits = (v: string) => v.replace(/[^0-9]/g, '');

export default function ListsTab() {
  const { isAdmin, can } = useHub();
  const [sub, setSub] = useState<Sub>('crimes');
  return (
    <div className="space-y-5">
      <Tabs
        value={sub}
        onChange={setSub}
        tabs={[
          { id: 'crimes', label: 'Petty crime types' },
          { id: 'vehicles', label: 'Cars' },
          ...(isAdmin || can('money') ? [{ id: 'products' as const, label: 'BlackMarket products' }] : []),
          { id: 'items', label: 'Item catalog' },
        ]}
      />
      {sub === 'crimes' && <Crimes />}
      {sub === 'vehicles' && <Vehicles />}
      {sub === 'products' && <Products />}
      {sub === 'items' && <ItemsTab />}
    </div>
  );
}

// ---------- petty crime types ----------

function Crimes() {
  const { me } = useHub();
  const lists = useLists();
  const [rows, setRows] = useState<CrimeType[] | null>(null);
  const list = rows ?? lists.crimes;
  const [msg, setMsg] = useState('');
  const set = (i: number, p: Partial<CrimeType>) => setRows(list.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const move = (i: number, d: number) => {
    const next = [...list];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
  };
  return (
    <Panel title="Petty crime types" right={<span className="text-xs text-smoke">In this order on the tally</span>}>
      <p className="mb-3 text-sm text-ash">Usual rep and cash prefill the tally when someone logs that crime. Past jobs keep the name they were logged with.</p>
      <ul className="space-y-2">
        {list.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 border border-line-soft p-2">
            <span className="flex flex-col">
              <button className="text-smoke hover:text-gold-200 disabled:opacity-30" disabled={!i} onClick={() => move(i, -1)} aria-label="Up">
                <ArrowUp className="size-3.5" />
              </button>
              <button className="text-smoke hover:text-gold-200 disabled:opacity-30" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Down">
                <ArrowDown className="size-3.5" />
              </button>
            </span>
            <span className="grid size-9 place-items-center border border-gold-600/50 text-gold-300">
              <CrimeIcon icon={c.icon} />
            </span>
            <input className="input w-40" value={c.name} maxLength={30} onChange={(e) => set(i, { name: e.target.value })} aria-label="Name" />
            <select className="input w-auto" value={c.icon} onChange={(e) => set(i, { icon: e.target.value })} aria-label="Icon">
              {Object.keys(CRIME_ICON).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs text-smoke">
              Rep
              <input className="input w-20 font-mono" inputMode="numeric" placeholder="—" value={c.rep ?? ''} onChange={(e) => set(i, { rep: digits(e.target.value) ? Number(digits(e.target.value)) : undefined })} />
            </label>
            <label className="flex items-center gap-1 text-xs text-smoke">
              Cash $
              <input className="input w-24 font-mono" inputMode="numeric" placeholder="—" value={c.cash ?? ''} onChange={(e) => set(i, { cash: digits(e.target.value) ? Number(digits(e.target.value)) : undefined })} />
            </label>
            <button className="ml-auto text-smoke hover:text-red-300" onClick={() => setRows(list.filter((_, k) => k !== i))} aria-label="Remove">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-ghost btn-sm" onClick={() => setRows([...list, { id: `c${Date.now().toString(36)}`, name: '', icon: 'star' }])}>
          <Plus className="size-3.5" /> Add a crime type
        </button>
        <button
          className="btn-gold btn-sm ml-auto"
          disabled={!rows}
          onClick={async () => {
            const clean = list
              .filter((c) => c.name.trim())
              .map((c) => ({ id: c.id, name: c.name.trim().slice(0, 30), icon: c.icon, ...(c.rep ? { rep: c.rep } : {}), ...(c.cash ? { cash: c.cash } : {}) }));
            await saveLists({ crimes: clean });
            void feed(me, 'list', `Updated the petty crime types (${clean.map((c) => c.name).join(', ')})`);
            setRows(null);
            setMsg('Saved.');
          }}
        >
          <Check className="size-3.5" /> Save
        </button>
      </div>
      {msg && <p className="mt-2 text-sm text-gold-300">{msg}</p>}
    </Panel>
  );
}

// ---------- cars ----------

function Vehicles() {
  const { me } = useHub();
  const lists = useLists();
  const [rows, setRows] = useState<VehicleRow[] | null>(null);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [cls, setCls] = useState<string>('sports');
  const list = rows ?? lists.vehicles;
  const shown = list.map((v, i) => ({ v, i })).filter(({ v }) => v.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Panel title={`Cars · ${list.filter((v) => !v.hidden).length} shown`}>
      <p className="mb-3 text-sm text-ash">
        The cars members can put in a kit. Pictures come from the repo at <code className="text-gold-200">hq/public/vehicles/&lt;name&gt;.png</code>.
      </p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="ml-auto flex flex-wrap gap-2">
          <input className="input w-44" placeholder="New car name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input w-auto" value={cls} onChange={(e) => setCls(e.target.value)}>
            {VEHICLE_CLASSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <button
            className="btn-ghost btn-sm"
            disabled={!name.trim() || list.some((v) => v.name.toLowerCase() === name.trim().toLowerCase())}
            onClick={() => (setRows([{ name: name.trim(), cls }, ...list]), setName(''))}
          >
            <Plus className="size-3.5" /> Add
          </button>
        </span>
      </div>
      <ul className="grid max-h-[28rem] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map(({ v, i }) => (
          <li key={v.name} className={`flex items-center gap-2 border border-line-soft px-2 py-1.5 text-sm ${v.hidden ? 'opacity-45' : ''}`}>
            <img src={vehicleSrc(v.name)} alt="" className="h-7 w-12 object-contain" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            <span className="min-w-0 flex-1 truncate text-gold-100">{v.name}</span>
            <select className="input w-auto px-1 py-0.5 text-xs" value={v.cls} onChange={(e) => setRows(list.map((x, k) => (k === i ? { ...x, cls: e.target.value } : x)))}>
              {VEHICLE_CLASSES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <button className="text-smoke hover:text-gold-200" onClick={() => setRows(list.map((x, k) => (k === i ? { ...x, hidden: !x.hidden } : x)))} title={v.hidden ? 'Show it' : 'Hide it'}>
              {v.hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button
          className="btn-gold btn-sm"
          disabled={!rows}
          onClick={async () => {
            await saveLists({ vehicles: list.map((v) => ({ name: v.name, cls: v.cls, ...(v.hidden ? { hidden: true } : {}) })) });
            void feed(me, 'list', 'Updated the car list');
            setRows(null);
          }}
        >
          <Car className="size-3.5" /> Save cars
        </button>
      </div>
    </Panel>
  );
}

// ---------- BlackMarket products & prices ----------

function Products() {
  const { me } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const lists = useLists();
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const typeName = (id: string) => types.find((t) => t.id === id)?.name ?? id;
  const histQ = useMemo(() => query(collection(db, 'priceLog'), orderBy('at', 'desc'), limit(60)), []);
  const history = useCollection<PriceChange>(histQ) ?? [];
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<{ item: string | null; name: string; unit: string } | null>(null);
  const [msg, setMsg] = useState('');
  const products = lists.products;
  const all = [...SALE_ITEMS.map((s) => ({ id: s.id, name: s.name, unit: s.unit, custom: false, retired: false })), ...products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, custom: true, retired: !!p.retired }))];
  const nameOf = (id: string) => all.find((x) => x.id === id)?.name ?? id;
  const changed = Object.entries(prices).filter(([k, v]) => (Number(v) || 0) !== (m.prices[k] ?? 0));

  async function savePrices() {
    const next = { ...m.prices };
    changed.forEach(([k, v]) => {
      if (Number(v) > 0) next[k] = Number(v);
      else delete next[k];
    });
    await mops.saveSettings({ prices: next });
    for (const [k, v] of changed) await logPrice(me, k, m.prices[k] ?? 0, Number(v) || 0).catch(() => {});
    void feed(me, 'price', `Changed ${changed.length} BlackMarket ${changed.length === 1 ? 'price' : 'prices'} (${changed.map(([k, v]) => `${nameOf(k)} ${money(Number(v) || 0)}`).join(', ')})`);
    setPrices({});
    setMsg('Prices saved. Stash worth uses them too.');
  }
  const saveProducts = (next: Product[], text: string) => saveLists({ products: next }).then(() => feed(me, 'list', text));

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Panel title="Products & going price" right={<Tag className="size-4 text-gold-500" />}>
        <p className="mb-3 text-sm text-ash">Price per brick, bin or unit. The Narco call fills these in, and stashes use them for their worth.</p>
        <ul className="divide-y divide-line-soft">
          {all.map((p) => (
            <li key={p.id} className={`flex flex-wrap items-center gap-2 py-1.5 text-sm ${p.retired ? 'opacity-45' : ''}`}>
              <span className="min-w-0 flex-1 truncate text-gold-100">
                {p.name} <span className="text-xs text-smoke">per {p.unit}</span>
                {p.custom && <span className="ml-1 chip bg-gold-400/10 px-1.5 text-[10px] text-gold-300">Catalog item</span>}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-smoke">$</span>
                <input className="input w-28 py-1 font-mono" inputMode="numeric" placeholder="—" value={prices[p.id] ?? (m.prices[p.id] ? String(m.prices[p.id]) : '')} onChange={(e) => setPrices({ ...prices, [p.id]: digits(e.target.value) })} />
              </span>
              {p.custom && (
                <button
                  className="text-smoke hover:text-gold-200"
                  title={p.retired ? 'Bring it back' : 'Retire it (past sales stay)'}
                  onClick={() => saveProducts(products.map((x) => (x.id === p.id ? { ...x, retired: !x.retired } : x)), `${p.retired ? 'Brought back' : 'Retired'} the ${p.name} product`)}
                >
                  {p.retired ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setAdding({ item: null, name: '', unit: 'unit' })}>
            <Plus className="size-3.5" /> Add a product
          </button>
          <button className="btn-gold btn-sm ml-auto" disabled={!changed.length} onClick={savePrices}>
            <Check className="size-3.5" /> Save {changed.length || ''} {changed.length === 1 ? 'price' : 'prices'}
          </button>
        </div>
        {msg && <p className="mt-2 text-sm text-gold-300">{msg}</p>}
        {adding && (
          <div className="mt-4 space-y-3 border border-gold-600/40 p-3">
            <p className="label flex items-center gap-2 text-gold-300">
              <Package className="size-3.5" /> New product
            </p>
            <p className="text-xs text-smoke">A catalog item sold on the Narco call. Selling it takes it out of the stash like any other item.</p>
            <ItemPicker types={types} value={adding.item} onChange={(id) => setAdding({ ...adding, item: id, name: adding.name || typeName(id) })} />
            <div className="flex flex-wrap gap-2">
              <input className="input flex-1" placeholder="Name on the call" maxLength={30} value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} />
              <input className="input w-28" placeholder="Unit" maxLength={12} value={adding.unit} onChange={(e) => setAdding({ ...adding, unit: e.target.value })} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setAdding(null)}>
                <X className="size-3.5" /> Cancel
              </button>
              <button
                className="btn-gold btn-sm"
                disabled={!adding.item || !adding.name.trim() || products.some((p) => p.itemId === adding.item)}
                onClick={() =>
                  saveProducts([...products, { id: `p_${slugId(adding.name)}`, name: adding.name.trim(), unit: adding.unit.trim() || 'unit', itemId: adding.item! }], `Added ${adding.name.trim()} to the BlackMarket`).then(() => setAdding(null))
                }
              >
                <Plus className="size-3.5" /> Add
              </button>
            </div>
          </div>
        )}
      </Panel>
      <Panel title="Price history" right={<Siren className="size-4 text-gold-500" />}>
        {history.length ? (
          <ul className="divide-y divide-line-soft text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-gold-100">{nameOf(h.product)}</span>
                <span className="font-mono text-xs text-smoke line-through">{h.was ? money(h.was) : '—'}</span>
                <span className={`font-mono ${h.price >= h.was ? 'text-ok' : 'text-red-300'}`}>{h.price ? money(h.price) : 'cleared'}</span>
                <span className="w-full text-[11px] text-smoke">
                  {h.byName} · {ago(h.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-smoke">No price changes yet. Changes made here are kept.</p>
        )}
      </Panel>
    </div>
  );
}

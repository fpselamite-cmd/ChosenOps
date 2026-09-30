import { collection, deleteDoc, doc, increment, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Empty, Field, Loading, PageHeader } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { useInventory } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { CURRENCY_META, formatMoney, formatNumber, timeAgo } from '../lib/format';
import type { InventoryItem } from '../lib/types';

export default function Inventory() {
  const { can, settings } = useHub();
  const { items, error } = useInventory();
  const [category, setCategory] = useState('All');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<InventoryItem | 'new' | null>(null);
  const editable = can('editInventory');

  if (error) return <Empty>{error}</Empty>;
  if (!items) return <Loading />;

  const q = search.trim().toLowerCase();
  const categories = ['All', ...new Set([...settings.inventoryCategories, ...items.map((i) => i.category)])];
  const shown = items.filter(
    (i) =>
      (category === 'All' || i.category === category) &&
      (!q || [i.name, i.location, i.notes].some((s) => s?.toLowerCase().includes(q))),
  );
  const value = (type: 'clean' | 'dirty') => items.filter((i) => i.costType === type).reduce((s, i) => s + i.quantity * (i.unitCost || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        subtitle="What the family is holding, and where."
        actions={
          editable && (
            <button className="btn-gold" onClick={() => setEditing('new')}>
              + Add item
            </button>
          )
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Summary label="Line items" value={formatNumber(items.length)} sub={`${formatNumber(items.reduce((s, i) => s + i.quantity, 0))} units total`} />
        <Summary label="Value (clean)" value={formatMoney(value('clean'))} color="text-clean" />
        <Summary label="Value (dirty)" value={formatMoney(value('dirty'))} color="text-dirty" />
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-3">
          <div className="flex flex-1 flex-wrap gap-1">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`rounded-md px-3 py-1 text-xs ${category === c ? 'bg-gold-400 font-semibold text-ink' : 'text-smoke hover:text-bone'}`}
              >
                {c}
              </button>
            ))}
          </div>
          <input className="input w-48" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {shown.length === 0 ? (
          <div className="p-5">
            <Empty>{items.length ? 'Nothing matches.' : 'The stash is empty.'}</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-smoke">
                <tr>
                  <th className="px-5 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 text-center font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium">Added by</th>
                  {editable && <th className="w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {shown.map((i) => (
                  <tr key={i.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-2">
                      <div className="font-medium text-bone">{i.name}</div>
                      {i.notes && <div className="max-w-xs truncate text-xs text-smoke">{i.notes}</div>}
                    </td>
                    <td className="px-3 py-2 text-smoke">{i.category}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-2">
                        {editable && <QtyButton item={i} delta={-1} />}
                        <span className={`min-w-8 text-center font-semibold ${i.quantity <= 0 ? 'text-red-400' : 'text-gold-200'}`}>{formatNumber(i.quantity)}</span>
                        {editable && <QtyButton item={i} delta={1} />}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {formatMoney(i.unitCost || 0)} <span className={`text-[10px] uppercase ${CURRENCY_META[i.costType].color}`}>{i.costType}</span>
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${CURRENCY_META[i.costType].color}`}>
                      {formatMoney(i.quantity * (i.unitCost || 0))}
                    </td>
                    <td className="px-3 py-2 text-smoke">{i.location || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <MemberName id={i.addedBy} />
                      <div className="text-[11px] text-smoke">{timeAgo(i.updatedAt)}</div>
                    </td>
                    {editable && (
                      <td className="whitespace-nowrap pr-4 text-right">
                        <button className="mr-3 text-xs text-gold-300 hover:underline" onClick={() => setEditing(i)}>
                          Edit
                        </button>
                        <button
                          className="text-smoke hover:text-red-400"
                          title="Remove"
                          onClick={() => confirm(`Remove ${i.name} from inventory?`) && deleteDoc(doc(db, 'inventory', i.id))}
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && <ItemForm item={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Summary({ label, value, sub, color = 'text-gold-200' }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="panel p-5">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-smoke">{label}</div>
      <div className={`mt-2 font-display text-2xl font-bold ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-smoke">{sub}</div>}
    </div>
  );
}

function QtyButton({ item, delta }: { item: InventoryItem; delta: number }) {
  return (
    <button
      className="grid h-6 w-6 place-items-center rounded border border-edge text-smoke hover:border-gold-500 hover:text-gold-200 disabled:opacity-30"
      disabled={delta < 0 && item.quantity <= 0}
      onClick={() => updateDoc(doc(db, 'inventory', item.id), { quantity: increment(delta), updatedAt: serverTimestamp() })}
      aria-label={delta > 0 ? 'Increase' : 'Decrease'}
    >
      {delta > 0 ? '+' : '−'}
    </button>
  );
}

function ItemForm({ item, onClose }: { item: InventoryItem | null; onClose: () => void }) {
  const { me } = useAuth();
  const { settings, can } = useHub();
  const [f, setF] = useState({
    name: item?.name ?? '',
    category: item?.category ?? settings.inventoryCategories[0] ?? 'Misc',
    quantity: String(item?.quantity ?? 1),
    unitCost: String(item?.unitCost ?? ''),
    costType: item?.costType ?? ('dirty' as 'clean' | 'dirty'),
    location: item?.location ?? '',
    notes: item?.notes ?? '',
  });
  const [deduct, setDeduct] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const qty = Math.max(0, Math.floor(Number(f.quantity) || 0));
  const unit = Math.max(0, Number(f.unitCost) || 0);
  const total = qty * unit;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const data = {
      name: f.name.trim(),
      category: f.category,
      quantity: qty,
      unitCost: unit,
      costType: f.costType,
      location: f.location.trim(),
      notes: f.notes.trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      const batch = writeBatch(db);
      if (item) batch.update(doc(db, 'inventory', item.id), data);
      else {
        const ref = doc(collection(db, 'inventory'));
        batch.set(ref, { ...data, addedBy: me!.id });
        if (deduct && total > 0)
          batch.set(doc(collection(db, 'transactions')), {
            type: f.costType,
            amount: -total,
            reason: `Bought ${qty}× ${data.name}`,
            category: 'Purchase',
            createdBy: me!.id,
            createdAt: serverTimestamp(),
            linkedItemId: ref.id,
          });
      }
      await batch.commit();
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={item ? `Edit ${item.name}` : 'Add to Inventory'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Item name" className="sm:col-span-2">
          <input className="input" value={f.name} onChange={set('name')} required maxLength={80} autoFocus placeholder="Pistol .50" />
        </Field>
        <Field label="Category">
          <select className="input" value={f.category} onChange={set('category')}>
            {[...new Set([...settings.inventoryCategories, f.category])].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Amount">
          <input className="input" type="number" min="0" step="1" value={f.quantity} onChange={set('quantity')} required />
        </Field>
        <Field label="Cost per unit ($)">
          <input className="input" type="number" min="0" step="any" value={f.unitCost} onChange={set('unitCost')} placeholder="0" />
        </Field>
        <div role="group" aria-label="Paid with">
          <span className="label">Paid with</span>
          <div className="grid grid-cols-2 gap-2">
            {(['clean', 'dirty'] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setF((p) => ({ ...p, costType: c }))}
                className={`rounded-lg border px-2 py-2 text-xs font-semibold ${f.costType === c ? `${CURRENCY_META[c].bg} ${CURRENCY_META[c].color}` : 'border-edge text-smoke'}`}
              >
                {CURRENCY_META[c].label}
              </button>
            ))}
          </div>
        </div>
        <Field label="Location / stash" className="sm:col-span-2">
          <input className="input" value={f.location} onChange={set('location')} maxLength={80} placeholder="Warehouse, Grove St safehouse…" />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <textarea className="input min-h-20" value={f.notes} onChange={set('notes')} maxLength={500} />
        </Field>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-edge bg-coal px-4 py-3 sm:col-span-2">
          <span className="text-sm text-smoke">
            Total value: <span className={`font-semibold ${CURRENCY_META[f.costType].color}`}>{formatMoney(total)}</span>
          </span>
          {!item && can('editBudget') && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deduct} onChange={(e) => setDeduct(e.target.checked)} className="accent-gold-400" />
              Deduct from {CURRENCY_META[f.costType].label}
            </label>
          )}
        </div>

        {error && <p className="text-sm text-red-400 sm:col-span-2">{error}</p>}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            {item ? 'Save' : 'Add item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

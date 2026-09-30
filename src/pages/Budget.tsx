import { addDoc, collection, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Empty, Field, Loading, PageHeader } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { StatTile } from '../components/StatTile';
import { useAuth } from '../hooks/useAuth';
import { useLedger } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { CURRENCY_META, formatAmount, formatDate, formatMoney } from '../lib/format';
import type { Currency } from '../lib/types';

export default function Budget() {
  const { can } = useHub();
  const { transactions, totals, error } = useLedger(can('viewBudget'));
  const [adding, setAdding] = useState<Currency | null>(null);
  const [filter, setFilter] = useState<Currency | 'all'>('all');
  const editable = can('editBudget');

  if (!can('viewBudget')) return <Empty>Your rank doesn't have access to the books.</Empty>;
  if (error) return <Empty>{error}</Empty>;
  if (!transactions) return <Loading />;

  const shown = transactions.filter((t) => filter === 'all' || t.type === filter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treasury"
        subtitle="Every dollar and every favour, on the books."
        actions={
          editable && (
            <button className="btn-gold" onClick={() => setAdding('dirty')}>
              + Log transaction
            </button>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="panel-title">Cash on Hand</h2>
            <span className="text-xs text-smoke">
              Combined: <span className="font-semibold text-gold-200">{formatMoney(totals.clean + totals.dirty)}</span>
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatTile type="clean" value={totals.clean} hint="Legit, bankable" />
            <StatTile type="dirty" value={totals.dirty} hint="Needs washing" />
          </div>
        </div>
        <div className="panel border-rep/30 p-4">
          <div className="mb-3 px-1">
            <h2 className="panel-title !text-rep">Reputation</h2>
          </div>
          <StatTile type="rep" value={totals.rep} hint="Earned, not spent" />
        </div>
      </div>

      <section className="panel">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-3">
          <h2 className="panel-title">Ledger</h2>
          <div className="flex gap-1">
            {(['all', 'clean', 'dirty', 'rep'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md px-3 py-1 text-xs ${filter === f ? 'bg-gold-400 font-semibold text-ink' : 'text-smoke hover:text-bone'}`}
              >
                {f === 'all' ? 'All' : CURRENCY_META[f].label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="p-5">
            <Empty>Nothing on the books.</Empty>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wider text-smoke">
                <tr>
                  <th className="px-5 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Reason</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Logged by</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  {editable && <th className="w-8" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {shown.map((t) => (
                  <tr key={t.id} className="hover:bg-white/[0.02]">
                    <td className="whitespace-nowrap px-5 py-2 text-smoke">{formatDate(t.createdAt)}</td>
                    <td className={`whitespace-nowrap px-3 py-2 ${CURRENCY_META[t.type].color}`}>{CURRENCY_META[t.type].label}</td>
                    <td className="px-3 py-2">{t.reason}</td>
                    <td className="px-3 py-2 text-smoke">{t.category || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <MemberName id={t.createdBy} />
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold ${t.amount < 0 ? 'text-red-400' : CURRENCY_META[t.type].color}`}>
                      {formatAmount(t.type, t.amount, true)}
                    </td>
                    {editable && (
                      <td className="pr-3 text-right">
                        <button
                          className="text-smoke hover:text-red-400"
                          title="Delete entry"
                          onClick={() => confirm(`Delete "${t.reason}"?`) && deleteDoc(doc(db, 'transactions', t.id))}
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

      {adding && <TransactionForm initialType={adding} onClose={() => setAdding(null)} />}
    </div>
  );
}

function TransactionForm({ initialType, onClose }: { initialType: Currency; onClose: () => void }) {
  const { me } = useAuth();
  const { settings } = useHub();
  const [type, setType] = useState<Currency>(initialType);
  const [direction, setDirection] = useState<'in' | 'out'>('in');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [category, setCategory] = useState(settings.transactionCategories[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Math.abs(Number(amount));
    if (!n) return setError('Enter an amount.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'transactions'), {
        type,
        amount: direction === 'in' ? n : -n,
        reason: reason.trim(),
        category,
        createdBy: me!.id,
        createdAt: serverTimestamp(),
      });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Log Transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['clean', 'dirty', 'rep'] as const).map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setType(c)}
              className={`rounded-lg border px-2 py-2 text-xs font-semibold ${type === c ? `${CURRENCY_META[c].bg} ${CURRENCY_META[c].color}` : 'border-edge text-smoke'}`}
            >
              {CURRENCY_META[c].label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {(['in', 'out'] as const).map((d) => (
            <button
              type="button"
              key={d}
              onClick={() => setDirection(d)}
              className={`rounded-lg border px-2 py-2 text-sm ${
                direction === d ? (d === 'in' ? 'border-emerald-600 bg-emerald-950/40 text-emerald-300' : 'border-red-800 bg-red-950/40 text-red-300') : 'border-edge text-smoke'
              }`}
            >
              {d === 'in' ? (type === 'rep' ? '▲ Gained' : '▲ Money in') : type === 'rep' ? '▼ Lost' : '▼ Money out'}
            </button>
          ))}
        </div>
        <Field label={type === 'rep' ? 'Rep points' : 'Amount ($)'}>
          <input className="input" type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <Field label="Reason">
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={120} placeholder="Fleeca job payout" />
        </Field>
        <Field label="Category">
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {settings.transactionCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            Log it
          </button>
        </div>
      </form>
    </Modal>
  );
}

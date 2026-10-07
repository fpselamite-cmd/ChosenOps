import { Check, Crown, Download, HandCoins, ListChecks, Minus, Package, Pin, Plus, Settings2, ShoppingBag, Siren, Sparkles, Trash2, Users, VenetianMask, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Empty, ErrorText, Field } from '../components/Field';
import { ItemPicker } from '../components/ItemPicker';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat, Tabs } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { ago, TZ } from '../lib/format';
import { itemTitle, type ItemType } from '../lib/items';
import { countOf, useLocker } from '../lib/locker';
import { saleItems, setExtraProducts, money, payoutSplit, saleItem, saleKind, unitWord, useMoney, useMoneyOps, type Sale, type SaleKind, type WashRequest, type Wish } from '../lib/money';
import { NOELOPS_URL } from '../lib/noelops';
import { toCount } from '../noel/data';
import { useOps } from '../noel/ops';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { Logo, ToastProvider, useToast } from '../noel/ui';
import { WishlistButton } from '../components/WishlistButton';
import { WashingMachine } from '../components/WashingMachine';
import { useLists } from '../lib/adminData';

type View = 'sell' | 'money' | 'wish' | 'washing';
const DAY = 86400e3;
const at = (x: { at?: { toMillis(): number } }) => x.at?.toMillis() ?? Date.now();
const fmtWhen = (ms: number) =>
  `${new Date(ms).toLocaleDateString('en-US', { timeZone: TZ, month: 'short', day: 'numeric' })} ${new Date(ms).toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' })}`;
const digits = (v: string) => v.replace(/\D/g, '');

/** Places a sale can come from: gang stashes, then your own locker storages. */
function useSources() {
  const { storage, stock, locLabel } = useNarcotics();
  const locker = useLocker();
  return useMemo(
    () => [
      ...storage.map((l) => ({ key: l.id, label: locLabel(l.id), mine: false, stock: stock.get(l.id) })),
      ...locker.storages.map((s) => ({ key: locker.path(s.id), label: `My ${s.name}`, mine: true, stock: locker.stock.get(s.id) })),
    ],
    [storage, stock, locLabel, locker.storages, locker.stock],
  );
}
type Source = ReturnType<typeof useSources>[number];

function KindTag({ kind }: { kind: SaleKind }) {
  return <span className={`bm-kind ${kind}`}>{kind === 'gang' ? 'Gang' : 'Personal'}</span>;
}

/** Ka-ching: bills fly when a sale goes through. */
function KaChing({ amount, onDone }: { amount: number; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div className="kaching" aria-live="polite">
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className="kaching-bill" style={{ '--i': i, '--x': `${(i * 37) % 100}%`, '--r': `${((i * 53) % 60) - 30}deg` } as React.CSSProperties}>
          $
        </span>
      ))}
      <span className="kaching-word">
        KA-CHING
        {amount > 0 && <small>{money(amount)}</small>}
      </span>
    </div>
  );
}

function chime() {
  try {
    if (document.documentElement.dataset.motion === 'off') return;
    const ctx = new AudioContext();
    [1318, 1760].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + i * 0.09 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.5);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.09);
      o.stop(ctx.currentTime + i * 0.09 + 0.55);
    });
    setTimeout(() => void ctx.close(), 900);
  } catch {
    /* no sound, no problem */
  }
}

// ---------- selling ----------

interface Line {
  key: string;
  product: string;
  from: string | null;
  qty: number;
  price: string;
  touched: boolean;
}

/** One Narco call: tap product tiles to add lines, each from a gang stash or your own locker. */
function SellPanel({ onSold }: { onSold: (total: number) => void }) {
  const { me, roster } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const toast = useToast();
  const sources = useSources();
  const [lines, setLines] = useState<Line[]>([]);
  const [team, setTeam] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const have = (src: Source | undefined, p: string) => {
    const it = saleItem(p);
    return src && it ? countOf(src.stock, { strain: it.strain, field: it.field, item: it.item }) : 0;
  };
  const gangHas = (p: string) => sources.filter((s) => !s.mine).reduce((t, s) => t + have(s, p), 0);
  const mineHas = (p: string) => sources.filter((s) => s.mine).reduce((t, s) => t + have(s, p), 0);
  const priceOf = (l: Line) => (l.touched ? toCount(l.price) : (m.prices[l.product] ?? 0) * l.qty);
  const set = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const add = (p: string) => {
    const best = sources.find((s) => !s.mine && have(s, p)) ?? sources.find((s) => have(s, p));
    setLines((ls) => [...ls, { key: `${p}${Date.now()}`, product: p, from: best?.key ?? null, qty: 1, price: '', touched: false }]);
  };
  const total = lines.reduce((t, l) => t + priceOf(l), 0);
  const stocked = saleItems().filter((it) => gangHas(it.id) + mineHas(it.id) > 0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!lines.length) return setError('Tap a product to add it to the call.');
    for (const l of lines) {
      const src = sources.find((s) => s.key === l.from);
      if (!src) return setError(`Pick where the ${saleItem(l.product)?.name} comes from.`);
      if (l.qty > have(src, l.product)) return setError(`Only ${have(src, l.product)} ${saleItem(l.product)?.name} in ${src.label}.`);
    }
    setBusy(true);
    const callId = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    let sold = 0;
    let failed = false;
    for (const l of lines) {
      const src = sources.find((s) => s.key === l.from)!;
      const price = priceOf(l) || null;
      const d = await mops
        .sell({ product: l.product, qty: l.qty, from: src.key, fromLabel: src.label, seller: { id: me.id, name: me.name }, cut: 0, price, narco: true, note, kind: src.mine ? 'personal' : 'gang', team, callId })
        .catch(() => null);
      if (!d) {
        setError(`Couldn’t sell the ${saleItem(l.product)?.name}; someone may have moved it.`);
        failed = true;
        break;
      }
      sold += price ?? 0;
      setLines((ls) => ls.filter((x) => x.key !== l.key));
    }
    setBusy(false);
    if (sold || !failed) {
      chime();
      onSold(sold);
      toast.done({ text: `Narco call logged${sold ? ` · ${money(sold)} dirty` : ''}.` });
      setTeam([]);
      setNote('');
    }
  }

  return (
    <form id="sale-form" onSubmit={submit} className="hud overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <p className="flex items-center gap-2 font-hud text-lg font-bold text-gold-100">
          <Siren className="size-5 text-red-400" /> Narco call
        </p>
        <p className="text-xs text-smoke">Tap what’s going out. Gang stash = gang money · your locker = your money.</p>
      </div>
      <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4 lg:grid-cols-6">
        {(stocked.length ? stocked : saleItems()).map((it) => {
          const g = gangHas(it.id);
          const mine = mineHas(it.id);
          const on = lines.filter((l) => l.product === it.id).reduce((t, l) => t + l.qty, 0);
          return (
            <button type="button" key={it.id} onClick={() => add(it.id)} disabled={!g && !mine} className={`bm-tile ${on ? 'on' : ''}`} title={`${it.name}: ${g} in gang stashes, ${mine} in your locker`}>
              <span className="bm-tile-logo">
                <ProductLogo it={it} />
              </span>
              <span className="truncate text-[11px] font-bold text-gold-100">{it.name}</span>
              <span className="font-mono text-[10px] text-smoke">
                <span className="text-gold-300">{g}</span> gang · <span className="text-sky-300">{mine}</span> mine
              </span>
              {on > 0 && <span className="bm-tile-badge">{on}</span>}
            </button>
          );
        })}
      </div>

      {lines.length > 0 && (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {lines.map((l) => {
            const it = saleItem(l.product)!;
            const src = sources.find((s) => s.key === l.from);
            return (
              <li key={l.key} className="flex flex-wrap items-center gap-2 px-4 py-2">
                <span className="w-32 truncate text-sm font-bold text-gold-100">{it.name}</span>
                <select className="input w-auto py-1 text-xs" value={l.from ?? ''} onChange={(e) => set(l.key, { from: e.target.value })}>
                  <option value="">From…</option>
                  <optgroup label="Gang stashes (gang money)">
                    {sources
                      .filter((s) => !s.mine)
                      .map((s) => (
                        <option key={s.key} value={s.key} disabled={!have(s, l.product)}>
                          {s.label} · {have(s, l.product)}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="My locker (my money)">
                    {sources
                      .filter((s) => s.mine)
                      .map((s) => (
                        <option key={s.key} value={s.key} disabled={!have(s, l.product)}>
                          {s.label} · {have(s, l.product)}
                        </option>
                      ))}
                  </optgroup>
                </select>
                {src && <KindTag kind={src.mine ? 'personal' : 'gang'} />}
                <span className="flex items-center gap-1">
                  <button type="button" className="btn-ghost btn-sm px-1.5" onClick={() => set(l.key, { qty: Math.max(1, l.qty - 1) })} aria-label="One less">
                    <Minus className="size-3" />
                  </button>
                  <input className="input w-14 py-1 text-center font-mono" inputMode="numeric" value={l.qty} onChange={(e) => set(l.key, { qty: Math.max(1, +digits(e.target.value) || 1) })} aria-label="How many" />
                  <button type="button" className="btn-ghost btn-sm px-1.5" onClick={() => set(l.key, { qty: l.qty + 1 })} aria-label="One more">
                    <Plus className="size-3" />
                  </button>
                  <span className="text-[11px] text-smoke">{unitWord(l.product, l.qty)}</span>
                </span>
                <input
                  className="input ml-auto w-28 py-1 font-mono text-sm"
                  inputMode="numeric"
                  placeholder="$ price"
                  value={l.touched ? l.price : priceOf(l) ? String(priceOf(l)) : ''}
                  onChange={(e) => set(l.key, { price: digits(e.target.value), touched: true })}
                  aria-label="Price"
                />
                <button type="button" className="p-1 text-smoke hover:text-red-300" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} aria-label="Remove line">
                  <X className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="space-y-3 border-t border-line-soft p-4">
        <Field label="Who came along" hint="They can be paid out of the sale afterwards">
          <div className="flex flex-wrap gap-1">
            {roster
              .filter((r) => r.id !== me.id)
              .map((r) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => setTeam(team.includes(r.id) ? team.filter((x) => x !== r.id) : [...team, r.id])}
                  className={`chip flex items-center gap-1.5 py-1 pr-2.5 pl-1 text-xs ${team.includes(r.id) ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}
                >
                  <Avatar member={r} size="xs" /> {r.name}
                </button>
              ))}
          </div>
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-48 flex-1">
            <span className="label">Note</span>
            <input className="input mt-1" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Optional" />
          </label>
          <span className="text-right">
            <span className="label block">Call total</span>
            <span className="font-mono text-2xl text-gold-100">{money(total)}</span>
          </span>
          <button className="btn-gold px-6 py-3" disabled={busy || !lines.length}>
            <HandCoins className="size-4" /> {busy ? 'Selling…' : 'Sell'}
          </button>
        </div>
        <ErrorText error={error} />
      </div>
    </form>
  );
}

/** The call's leader pays the people who came along, out of the sale or their own pocket. */
function PayTeam({ call, onClose }: { call: Sale[]; onClose: () => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const lead = call[0]!;
  const team = lead.team ?? [];
  const pays = m.pays.filter((p) => p.callId === lead.callId);
  const [source, setSource] = useState<'sale' | 'mine'>('sale');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const total = call.reduce((t, x) => t + (x.price ?? 0), 0);
  const want = team.reduce((t, id) => t + toCount(amounts[id] ?? ''), 0);
  const room = payoutSplit(call, pays, 0, 'sale').room;
  const paidTo = (id: string) => pays.filter((p) => p.to === id).reduce((t, p) => t + p.dirty, 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!want) return setError('Enter an amount for someone.');
    if (source === 'sale' && want > room) return setError(`Only ${money(room)} of this sale is left to pay out.`);
    if (source === 'mine' && want > m.mine.held) return setError(`You only hold ${money(m.mine.held)} dirty.`);
    let done = [...pays];
    for (const id of team) {
      const a = toCount(amounts[id] ?? '');
      if (!a) continue;
      const { fromBank } = payoutSplit(call, done, a, source);
      const t = { callId: lead.callId!, saleId: lead.id, from: lead.sellerId, to: id, dirty: a, source, fromBank };
      await mops.payTeam(t);
      done = [...done, { ...t, id: '' }];
    }
    onClose();
  }
  return (
    <Modal title="Pay the team" onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <p className="text-sm text-ash">
          This call made <b className="font-mono text-gold-100">{money(total)}</b>. Dirty money goes straight into each person’s locker.
        </p>
        <div className="flex overflow-hidden rounded-full ring-1 ring-line">
          {(
            [
              ['sale', `Out of the sale · ${money(room)} left`],
              ['mine', `Out of my pocket · ${money(m.mine.held)}`],
            ] as const
          ).map(([v, l]) => (
            <button type="button" key={v} onClick={() => setSource(v)} className={`flex-1 px-3 py-1.5 text-xs font-bold ${source === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {l}
            </button>
          ))}
        </div>
        <ul className="space-y-2">
          {team.map((id) => (
            <li key={id} className="flex items-center gap-3">
              <MemberName id={id} className="flex-1" />
              {paidTo(id) > 0 && <span className="text-[11px] text-ok">paid {money(paidTo(id))}</span>}
              <input className="input w-32 font-mono" inputMode="numeric" placeholder="$0" value={amounts[id] ?? ''} onChange={(e) => setAmounts({ ...amounts, [id]: digits(e.target.value) })} />
            </li>
          ))}
        </ul>
        {source === 'sale' && team.length > 0 && room > 0 && (
          <button type="button" className="text-xs text-gold-300 hover:underline" onClick={() => setAmounts(Object.fromEntries(team.map((id) => [id, String(Math.floor(room / (team.length + 1)))])))}>
            Split evenly with me ({money(Math.floor(room / (team.length + 1)))} each)
          </button>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={!want}>
            <HandCoins className="size-4" /> Pay {money(want)}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SellView() {
  const { me, memberById } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const toast = useToast();
  const [kaching, setKaching] = useState<number | null>(null);
  const doneKaching = useCallback(() => setKaching(null), []);
  const [type, setType] = useState<'all' | SaleKind>('all');
  const [range, setRange] = useState<'today' | 'week' | 'month' | 'all'>('week');
  const [paying, setPaying] = useState<Sale[] | null>(null);
  const since = range === 'today' ? Date.now() - DAY : range === 'week' ? Date.now() - 7 * DAY : range === 'month' ? Date.now() - 30 * DAY : 0;
  const inRange = m.sales.filter((x) => at(x) >= since);
  const list = inRange.filter((x) => type === 'all' || saleKind(x) === type);
  const gang = inRange.filter((x) => saleKind(x) === 'gang');
  const personal = inRange.filter((x) => saleKind(x) === 'personal');
  const sum = (xs: Sale[]) => xs.reduce((t, x) => t + (x.price ?? 0), 0);
  const units = (xs: Sale[]) => xs.reduce((t, x) => t + x.qty, 0);
  const showPrice = (x: Sale) => saleKind(x) === 'gang' || x.sellerId === me.id || m.all;
  // Today's top seller (by units, so personal amounts stay private).
  const today = m.sales.filter((x) => at(x) >= Date.now() - DAY);
  const topToday = [...today.reduce((mp, x) => mp.set(x.sellerId, (mp.get(x.sellerId) ?? 0) + x.qty), new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0];
  // Group lines by call.
  const calls = new Map<string, Sale[]>();
  list.forEach((x) => {
    const k = x.callId ?? x.id;
    calls.set(k, [...(calls.get(k) ?? []), x]);
  });
  const allLines = (k: string) => m.sales.filter((x) => (x.callId ?? x.id) === k);
  const lastPrice = (p: string) => m.sales.find((x) => x.product === p && x.price && saleKind(x) === 'gang');

  return (
    <div className="space-y-6">
      <SellPanel onSold={(t) => setKaching(t)} />
      {kaching !== null && <KaChing amount={kaching} onDone={doneKaching} />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Gang sales" value={money(sum(gang))} sub={`${units(gang)} out · ${gang.length} lines`} />
        <Stat label="Personal sales" value={m.all ? money(sum(personal)) : `${units(personal)} out`} sub={m.all ? `${units(personal)} out` : 'Amounts are private'} />
        <Stat label="Calls" value={calls.size} sub={range === 'all' ? 'All time' : `Last ${range === 'today' ? '24h' : range}`} />
        <Stat label="Top seller today" value={topToday ? <MemberName id={topToday} /> : '—'} sub={topToday ? 'Most product moved' : 'No sales yet today'} />
      </div>

      <Panel
        title="Narco log"
        right={
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="flex overflow-hidden rounded-full ring-1 ring-line">
              {(
                [
                  ['all', 'All'],
                  ['gang', 'Gang'],
                  ['personal', 'Personal'],
                ] as const
              ).map(([v, l]) => (
                <button key={v} onClick={() => setType(v)} className={`px-2.5 py-1 text-[11px] font-bold ${type === v ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                  {l}
                </button>
              ))}
            </span>
            <select className="input w-auto py-1 text-xs" value={range} onChange={(e) => setRange(e.target.value as typeof range)}>
              <option value="today">Today</option>
              <option value="week">This week</option>
              <option value="month">30 days</option>
              <option value="all">All time</option>
            </select>
            <button className="btn-ghost btn-sm" onClick={() => exportCsv(list, m.all, me.id)}>
              <Download className="size-3.5" /> CSV
            </button>
          </span>
        }
        pad={false}
      >
        {calls.size ? (
          <ul className="divide-y divide-line-soft">
            {[...calls].map(([k, xs]) => {
              const lead = xs[0]!;
              const whole = allLines(k);
              const team = lead.team ?? [];
              const paid = m.pays.filter((p) => p.callId === lead.callId).reduce((t, p) => t + p.dirty, 0);
              return (
                <li key={k} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <span className="relative">
                    <Avatar member={memberById.get(lead.sellerId)} />
                    {lead.sellerId === topToday && <Crown className="absolute -top-2 -right-1 size-4 rotate-12 text-gold-300 drop-shadow" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm">
                      <MemberName id={lead.sellerId} />
                      {team.length > 0 && (
                        <span className="flex items-center gap-1 text-xs text-smoke">
                          <Users className="size-3" /> with {team.map((id, i) => (
                            <span key={id}>
                              {i > 0 && ', '}
                              <MemberName id={id} className="text-xs" />
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="text-xs text-smoke">· {fmtWhen(at(lead))}</span>
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {xs.map((x) => (
                        <span key={x.id} className="inline-flex items-center gap-1.5 rounded border border-line-soft bg-coal/60 px-2 py-0.5 text-xs">
                          <KindTag kind={saleKind(x)} />
                          <b className="text-gold-100">
                            {x.qty} × {saleItem(x.product)?.name ?? x.product}
                          </b>
                          <span className="text-smoke">{x.fromLabel}</span>
                          {showPrice(x) ? <span className="font-mono text-red-300">{x.price ? money(x.price) : '—'}</span> : <span className="text-smoke italic">private</span>}
                          {m.all && (
                            <button
                              className="text-smoke hover:text-red-300"
                              title="Remove this sale and return the product"
                              onClick={() => confirm('Remove this sale? The product goes back where it came from.') && toast.run(mops.removeSale(x).then(() => ({ text: 'Sale removed, product returned.' })))}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </span>
                    {lead.note && <span className="mt-1 block text-xs text-ash italic">“{lead.note}”</span>}
                    {paid > 0 && <span className="mt-1 block text-[11px] text-ok">Team paid {money(paid)}</span>}
                  </span>
                  {lead.sellerId === me.id && team.length > 0 && lead.callId && (
                    <button className="btn-ghost btn-sm" onClick={() => setPaying(whole)}>
                      <HandCoins className="size-3.5" /> Pay the team
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-6">
            <Empty icon={<VenetianMask className="size-7" />} title={m.sales.length ? 'Nothing matches' : 'Nothing sold yet'}>
              {m.sales.length ? 'Try another filter.' : 'Got a Narco call? Tap what’s going out above.'}
            </Empty>
          </div>
        )}
      </Panel>

      <Panel title="Going rate">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {saleItems().map((it) => {
            const last = lastPrice(it.id);
            return (
              <div key={it.id} className="flex items-center gap-2 text-sm">
                <span className="size-7 shrink-0">
                  <ProductLogo it={it} />
                </span>
                <span className="flex-1 truncate text-ash">{it.name}</span>
                <span className="font-mono text-gold-200">{m.prices[it.id] ? money(m.prices[it.id]!) : '—'}</span>
                <span className="w-24 text-right text-[11px] text-smoke">{last?.price ? `last ${money(Math.round(last.price / last.qty))}` : ''}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11px] text-smoke">Set price per {`${'brick / bin'}`}; “last” is the most recent gang sale.</p>
      </Panel>

      {paying && <PayTeam call={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

// ---------- money ----------

function LedgerModal({ type, toId, onClose }: { type: 'payout' | 'expense'; toId?: string; onClose: () => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const { roster } = useHub();
  const [who, setWho] = useState(toId ?? roster[0]?.id ?? '');
  const owed = m.people.find((p) => p.id === who)?.owed ?? 0;
  const [amount, setAmount] = useState(type === 'payout' && toId ? String(owed) : '');
  const [note, setNote] = useState('');
  return (
    <Modal title={type === 'payout' ? 'Record a payout' : 'Record an expense'} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const a = toCount(amount);
          if (!a) return;
          await mops.addLedger({ type, amount: a, toId: type === 'payout' ? who : null, toName: type === 'payout' ? roster.find((r) => r.id === who)?.name : undefined, note: note.trim().slice(0, 60) });
          onClose();
        }}
      >
        {type === 'payout' && (
          <Field label="Paid to">
            <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
              {roster.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · owed {money(m.people.find((p) => p.id === r.id)?.owed ?? 0)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Amount">
          <input className="input font-mono" inputMode="numeric" value={amount} onChange={(e) => setAmount(digits(e.target.value))} autoFocus />
        </Field>
        <Field label="Note">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Optional" />
        </Field>
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

function MoneyView() {
  const m = useMoney();
  const mops = useMoneyOps();
  const [ledger, setLedger] = useState<{ type: 'payout' | 'expense'; toId?: string } | null>(null);
  const month = Date.now() - 30 * DAY;
  const gang30 = m.sales.filter((x) => saleKind(x) === 'gang' && at(x) >= month).reduce((t, x) => t + (x.price ?? 0), 0);
  const owedTotal = m.people.reduce((t, p) => t + p.owed, 0);
  const holders = m.people.filter((p) => p.held || p.clean).sort((a, b) => b.held - a.held);
  const myPays = m.pays.filter((p) => p.to === m.mine.id || p.from === m.mine.id).sort((a, b) => at(b) - at(a));
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="My dirty money" value={<span className="text-red-300">{money(m.mine.held)}</span>} sub="In your locker" />
        <Stat label="My clean money" value={money(m.mine.clean)} sub="Wash dirty from My Locker" />
        {m.all ? (
          <>
            <Stat label="Gang bank" value={money(m.bank)} sub="Gang sales, minus team pay, payouts & expenses" />
            <Stat label="Gang sales · 30 days" value={money(gang30)} sub={owedTotal ? `${money(owedTotal)} owed to members` : 'Nothing owed'} />
          </>
        ) : (
          <>
            <Stat label="Owed to me" value={money(m.mine.owed)} sub="By the Treasurer" />
            <Stat label="Paid to me" value={money(m.mine.paid)} sub="Payouts recorded" />
          </>
        )}
      </div>

      {myPays.length > 0 && (
        <Panel title="Team pay">
          <ul className="divide-y divide-line-soft text-sm">
            {myPays.slice(0, 12).map((p) => (
              <li key={p.id} className="flex items-center gap-2 py-2">
                {p.from === m.mine.id ? (
                  <>
                    You paid <MemberName id={p.to} />
                  </>
                ) : (
                  <>
                    <MemberName id={p.from} /> paid you
                  </>
                )}
                <span className="text-xs text-smoke">· {p.source === 'sale' ? 'out of the sale' : 'out of pocket'} · {ago(p.at)}</span>
                <span className="ml-auto font-mono text-red-300">{money(p.dirty)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {m.all && (
        <>
          <Panel
            title="Treasury"
            right={
              <span className="flex gap-1.5">
                <button className="btn-ghost btn-sm" onClick={() => setLedger({ type: 'payout' })}>
                  Record payout
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setLedger({ type: 'expense' })}>
                  Record expense
                </button>
              </span>
            }
          >
            {m.ledger.length ? (
              <ul className="divide-y divide-line-soft text-sm">
                {m.ledger.slice(0, 15).map((l) => (
                  <li key={l.id} className="flex items-center gap-2 py-2">
                    <span className="flex-1">
                      {l.type === 'payout' ? (
                        <>
                          Paid <b className="text-gold-100">{l.toName}</b>
                        </>
                      ) : (
                        <b className="text-gold-100">Expense</b>
                      )}
                      {l.note && <span className="text-smoke"> · {l.note}</span>}
                      <span className="block text-[11px] text-smoke">
                        {l.byName} · {ago(l.at)}
                      </span>
                    </span>
                    <span className="font-mono text-gold-200">−{money(l.amount)}</span>
                    <button className="p-1 text-smoke hover:text-red-300" onClick={() => confirm('Remove this entry?') && mops.removeLedger(l.id)} aria-label="Remove">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">Nothing recorded yet.</p>
            )}
          </Panel>

          <Panel title="Who holds what" pad={false}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="label text-left">
                  <tr className="border-b border-line-soft">
                    <th className="px-4 py-2">Member</th>
                    <th className="px-2 py-2 text-right">Moved</th>
                    <th className="px-2 py-2 text-right">Dirty held</th>
                    <th className="px-2 py-2 text-right">Clean</th>
                    <th className="px-2 py-2 text-right">Owed</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {holders.map((p) => (
                    <tr key={p.id} className="border-b border-line-soft/60">
                      <td className="px-4 py-2">
                        <MemberName id={p.id} />
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-ash">{p.qty}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-300">{money(p.held)}</td>
                      <td className="px-2 py-2 text-right font-mono text-gold-100">{money(p.clean)}</td>
                      <td className="px-2 py-2 text-right font-mono text-gold-300">{p.owed ? money(p.owed) : '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {p.owed > 0 && (
                          <button className="btn-ghost btn-sm" onClick={() => setLedger({ type: 'payout', toId: p.id })}>
                            Pay
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!holders.length && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-smoke">
                        Nobody holds anything yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>

          {m.washes.length > 0 && (
            <Panel title="Earlier washes">
              <ul className="divide-y divide-line-soft text-sm">
                {m.washes.slice(0, 10).map((w) => (
                  <li key={w.id} className="flex items-center gap-2 py-2">
                    <MemberName id={w.memberId} />
                    <span className="text-xs text-smoke">· {ago(w.at)}</span>
                    <span className="ml-auto font-mono text-red-300">{money(w.dirty)}</span>→<span className="font-mono text-gold-100">{money(w.clean)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
      {ledger && <LedgerModal type={ledger.type} toId={ledger.toId} onClose={() => setLedger(null)} />}
    </div>
  );
}

// ---------- wish list ----------

function WishView() {
  const { me, can, isLead } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const toast = useToast();
  const locker = useLocker();
  const ops = useOps('stash');
  const types = useCollection<ItemType>('itemTypes') ?? [];
  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const lead = can('money') || isLead;
  const fields = m.settings.wishFields ?? [];
  const [posting, setPosting] = useState(false);
  const [title, setTitle] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [qty, setQty] = useState('1');
  const [offer, setOffer] = useState('');
  const [notes, setNotes] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const rank = (w: Wish) => (w.priority === 'pinned' ? 0 : w.priority === 'urgent' ? 1 : 2);
  const active = m.wishes.filter((w) => w.status === 'open' || w.status === 'claimed').sort((a, b) => rank(a) - rank(b) || Number(a.status === 'claimed') - Number(b.status === 'claimed') || at(b) - at(a));
  const done = m.wishes.filter((w) => w.status === 'done' || w.status === 'cancelled').sort((a, b) => (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0));

  async function post(e: FormEvent) {
    e.preventDefault();
    const name = itemId ? itemTitle(byId.get(itemId), byId) : title.trim();
    if (!name) return;
    await mops.postWish({ title: name.slice(0, 60), qty: Math.max(1, Math.min(999, toCount(qty) || 1)), notes: notes.trim().slice(0, 200), fields: extra, itemId, offer: toCount(offer) || 0 });
    setTitle('');
    setItemId(null);
    setQty('1');
    setOffer('');
    setNotes('');
    setExtra({});
    setPosting(false);
  }
  async function receive(w: Wish) {
    if (!w.itemId) return;
    const onme = locker.storages.find((s) => s.id === 'onme') ?? locker.storages[0];
    if (!onme) return;
    await toast.run(
      ops
        .applyDeltas([{ loc: locker.path(onme.id), field: 'meth', item: w.itemId, delta: w.qty }])
        .then(() => mops.markReceived(w))
        .then(() => ({ text: `Added ${w.qty} × ${w.title} to ${onme.name}.` })),
    );
  }

  const card = (w: Wish) => {
    const claimed = w.status === 'claimed';
    const mine = w.byId === me.id;
    return (
      <li key={w.id} className={`hud p-4 ${w.priority === 'urgent' ? 'ring-1 ring-red-400/50' : w.priority === 'pinned' ? 'ring-1 ring-gold-400/50' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2">
              {w.priority === 'pinned' && <Pin className="size-3.5 text-gold-300" />}
              {w.priority === 'urgent' && <span className="chip bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-300">URGENT</span>}
              <b className="font-hud text-lg text-gold-100">
                {w.qty > 1 ? `${w.qty} × ` : ''}
                {w.title}
              </b>
              {w.itemId && <span className="chip bg-raised px-2 py-0.5 text-[10px] text-ash">catalog item</span>}
            </p>
            <p className="text-xs text-smoke">
              asked by <MemberName id={w.byId} className="text-xs" /> · {ago(w.at)}
              {w.offer ? (
                <>
                  {' '}
                  · offering <b className="font-mono text-gold-200">{money(w.offer)}</b>
                </>
              ) : null}
            </p>
            {w.notes && <p className="mt-1 text-sm text-ash">{w.notes}</p>}
            {fields.some((f) => w.fields?.[f.id]) && (
              <p className="mt-1 text-xs text-smoke">
                {fields
                  .filter((f) => w.fields?.[f.id])
                  .map((f) => `${f.label}: ${w.fields![f.id]}`)
                  .join(' · ')}
              </p>
            )}
          </div>
          <span className={`chip px-2 py-0.5 text-[11px] font-bold ${claimed ? 'bg-sky-500/20 text-sky-300' : 'bg-gold-400/15 text-gold-200'}`}>{claimed ? `${w.claimerName} is on it` : 'Open'}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!claimed && (
            <button className="btn-gold btn-sm" onClick={() => mops.wishAction(w, 'claim')}>
              <Check className="size-3.5" /> I’ll get it
            </button>
          )}
          {claimed && w.claimerId === me.id && (
            <>
              <button className="btn-gold btn-sm" onClick={() => mops.wishAction(w, 'done')}>
                <Check className="size-3.5" /> Delivered
              </button>
              <button className="btn-ghost btn-sm" onClick={() => mops.wishAction(w, 'unclaim')}>
                Let it go
              </button>
            </>
          )}
          {w.itemId && w.byId !== me.id && <WishlistButton label="Me too" items={[{ item: w.itemId, qty: 1, from: 'BlackMarket' }]} />}
          {lead && (
            <>
              <button className="btn-ghost btn-sm" onClick={() => mops.setWishPriority(w, w.priority === 'pinned' ? null : 'pinned')}>
                <Pin className="size-3.5" /> {w.priority === 'pinned' ? 'Unpin' : 'Pin'}
              </button>
              <button className="btn-ghost btn-sm" onClick={() => mops.setWishPriority(w, w.priority === 'urgent' ? null : 'urgent')}>
                <Siren className="size-3.5" /> {w.priority === 'urgent' ? 'Not urgent' : 'Urgent'}
              </button>
            </>
          )}
          {(mine || lead) && (
            <button className="btn-ghost btn-sm ml-auto text-red-300" onClick={() => confirm(`Cancel “${w.title}”?`) && mops.wishAction(w, 'cancel')}>
              <X className="size-3.5" /> Cancel
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ash">Need something sourced? Post it; someone claims it and delivers it in the city.</p>
        <button className="btn-gold" onClick={() => setPosting(true)}>
          <Plus className="size-4" /> Ask for something
        </button>
      </div>
      {active.length ? (
        <ul className="grid gap-3 lg:grid-cols-2">{active.map(card)}</ul>
      ) : (
        <Empty icon={<ListChecks className="size-7" />} title="Nothing on the list">
          Post what you need and someone can claim it.
        </Empty>
      )}
      {done.length > 0 && (
        <Panel title="Done & cancelled">
          <ul className="divide-y divide-line-soft text-sm">
            {done.slice(0, 20).map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className={w.status === 'done' ? 'text-gold-100' : 'text-smoke line-through'}>
                  {w.qty > 1 ? `${w.qty} × ` : ''}
                  {w.title}
                </span>
                <span className="text-xs text-smoke">
                  for <MemberName id={w.byId} className="text-xs" />
                  {w.status === 'done' && w.claimerName ? ` · delivered by ${w.claimerName}` : ''}
                </span>
                {w.status === 'done' && w.itemId && w.byId === me.id && !w.received && (
                  <button className="btn-gold btn-sm ml-auto" onClick={() => receive(w)}>
                    <ShoppingBag className="size-3.5" /> Add to my locker
                  </button>
                )}
                {w.received && <span className="ml-auto text-[11px] text-ok">In your locker</span>}
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {posting && (
        <Modal title="Ask for something" onClose={() => setPosting(false)}>
          <form className="space-y-4" onSubmit={post}>
            <Field label="What">
              {itemId ? (
                <div className="flex items-center gap-2">
                  <span className="flex-1 text-gold-100">{itemTitle(byId.get(itemId), byId)}</span>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setItemId(null)}>
                    Type it instead
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. 2 armor plates" autoFocus />
                  <button type="button" className="btn-ghost shrink-0" onClick={() => setPicking(true)}>
                    From the catalog
                  </button>
                </div>
              )}
            </Field>
            {picking && <ItemPicker types={types} value={itemId} onChange={(id) => (setItemId(id), setPicking(false))} />}
            <div className="grid grid-cols-2 gap-3">
              <Field label="How many">
                <input className="input font-mono" inputMode="numeric" value={qty} onChange={(e) => setQty(digits(e.target.value))} />
              </Field>
              <Field label="I’ll pay" hint="Optional">
                <input className="input font-mono" inputMode="numeric" value={offer} onChange={(e) => setOffer(digits(e.target.value))} placeholder="$" />
              </Field>
            </div>
            {fields.map((f) => (
              <Field key={f.id} label={f.label}>
                <input className="input" value={extra[f.id] ?? ''} maxLength={60} onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })} />
              </Field>
            ))}
            <Field label="Notes">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200} placeholder="Optional" />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setPosting(false)}>
                Cancel
              </button>
              <button className="btn-gold" disabled={!itemId && !title.trim()}>
                Post it
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- washing (washers) ----------

export function WashingView() {
  const { me } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const mineNow = m.washReqs.filter((w) => w.status === 'claimed' && w.claimerId === me.id);
  const open = m.washReqs.filter((w) => w.status === 'open' || (w.status === 'claimed' && w.claimerId !== me.id));
  const done = m.washReqs.filter((w) => w.status === 'done');
  const row = (w: WashRequest) => (
    <li key={w.id} className="flex flex-wrap items-center gap-3 py-3">
      <MemberName id={w.memberId} />
      <span className="text-xs text-smoke">· {ago(w.at)}</span>
      {w.note && <span className="text-xs text-ash italic">“{w.note}”</span>}
      <span className="ml-auto font-mono text-red-300">{money(w.dirty)}</span>
      <span className="text-smoke">→</span>
      <span className="font-mono text-gold-100">{money(w.clean)}</span>
      <span className="text-[11px] text-smoke">({100 - w.pct}% back)</span>
      {w.status === 'open' && m.washer && (
        <button className="btn-gold btn-sm" onClick={() => mops.washStep(w, 'claim')}>
          Claim
        </button>
      )}
      {w.status === 'claimed' &&
        (w.claimerId === me.id ? (
          <span className="flex gap-1.5">
            <button className="btn-gold btn-sm" onClick={() => mops.washStep(w, 'done')}>
              <Check className="size-3.5" /> Washed
            </button>
            <button className="btn-ghost btn-sm" onClick={() => mops.washStep(w, 'unclaim')}>
              Let it go
            </button>
          </span>
        ) : (
          <span className="chip bg-sky-500/20 px-2 py-0.5 text-[11px] text-sky-300">
            {w.claimerName} is washing it{w.timerEnd && w.timerEnd.toMillis() > Date.now() ? ` · ~${Math.ceil((w.timerEnd.toMillis() - Date.now()) / 60000)}m left` : ''}
          </span>
        ))}
    </li>
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting" value={money(open.reduce((t, w) => t + w.dirty, 0))} sub={`${open.length} ${open.length === 1 ? 'request' : 'requests'}`} />
        <Stat label="Washed · 7 days" value={money(done.filter((w) => (w.doneAt?.toMillis() ?? 0) > Date.now() - 7 * DAY).reduce((t, w) => t + w.dirty, 0))} sub="Dirty in" />
        <Stat label="Rate" value={`${100 - m.washPct}% back`} sub="Set in BlackMarket settings" />
      </div>
      {mineNow.length > 0 && (
        <Panel title={`Your machines · ${mineNow.length}`}>
          <div className="flex flex-wrap justify-center gap-5 sm:justify-start">
            {mineNow.map((w) => (
              <WashingMachine key={w.id} w={w} onTimer={(mins) => void mops.washTimer(w, mins)} onDone={() => void mops.washStep(w, 'done')} onLetGo={() => void mops.washStep(w, 'unclaim')} />
            ))}
          </div>
        </Panel>
      )}
      <Panel title="Wash queue">
        {open.length ? <ul className="divide-y divide-line-soft">{open.map(row)}</ul> : <p className="text-sm text-smoke">Nothing to wash right now.</p>}
      </Panel>
      {done.length > 0 && (
        <Panel title="Done">
          <ul className="divide-y divide-line-soft">{done.slice(0, 20).map(row)}</ul>
        </Panel>
      )}
    </div>
  );
}

// ---------- settings ----------

function Settings({ onClose }: { onClose: () => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(saleItems().map((s) => [s.id, m.prices[s.id] ? String(m.prices[s.id]) : ''])));
  const [wash, setWash] = useState(String(m.washPct));
  const [fields, setFields] = useState((m.settings.wishFields ?? []).map((f) => f.label).join(', '));
  return (
    <Modal title="BlackMarket settings" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await mops.saveSettings({
            prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => toCount(v) > 0).map(([k, v]) => [k, toCount(v)])),
            washPct: Math.min(100, toCount(wash)),
            wishFields: fields
              .split(',')
              .map((f) => f.trim().slice(0, 24))
              .filter(Boolean)
              .slice(0, 8)
              .map((label, i) => ({ id: `f${i}`, label })),
          });
          onClose();
        }}
      >
        <Field label="Lost in the wash %" hint="50 means half comes back clean. Family washers take no fee on top.">
          <input className="input w-28 font-mono" inputMode="numeric" value={wash} onChange={(e) => setWash(digits(e.target.value))} />
        </Field>
        <div>
          <p className="label mb-1.5">Usual price (per brick / bin)</p>
          <div className="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {saleItems().map((s) => (
              <label key={s.id} className="block text-[11px] text-smoke">
                {s.name}
                <input className="input mt-0.5 py-1 font-mono" inputMode="numeric" placeholder="$" value={prices[s.id]} onChange={(e) => setPrices({ ...prices, [s.id]: digits(e.target.value) })} />
              </label>
            ))}
          </div>
        </div>
        <Field label="Extra wish list boxes" hint="Comma separated, up to 8, e.g. Buyer, Meet spot">
          <input className="input" value={fields} onChange={(e) => setFields(e.target.value)} />
        </Field>
        <p className="text-xs text-smoke">Narco sales pay no cuts: the call’s leader pays the team out of the sale.</p>
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

function exportCsv(sales: Sale[], all: boolean, me: string) {
  const rows = [['When (ET)', 'Seller', 'Type', 'Product', 'Qty', 'From', 'Dirty money', 'Team', 'Note']].concat(
    sales.map((x) => [
      fmtWhen(at(x)),
      x.sellerName,
      saleKind(x),
      saleItem(x.product)?.name ?? x.product,
      String(x.qty),
      x.fromLabel,
      x.price && (saleKind(x) === 'gang' || all || x.sellerId === me) ? String(x.price) : '',
      String(x.team?.length ?? 0),
      x.note ?? '',
    ]),
  );
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'narco-log.csv';
  a.click();
}

/** Live link to NoelOps: drug counts and sales go both ways. */
function NoelStatus() {
  const { noelDown } = useNarcotics();
  return noelDown ? (
    <p className="mb-4 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">Can’t reach NoelOps right now, so drug counts aren’t showing. Sales will work again once it’s back.</p>
  ) : (
    <p className="mb-4 flex items-center gap-2 text-xs text-smoke">
      <span className="size-2 rounded-full bg-ok text-ok shadow-[0_0_6px_currentColor]" /> Live with{' '}
      <a href={NOELOPS_URL} target="_blank" rel="noopener" className="text-gold-300 hover:text-gold-100">
        NoelOps
      </a>
      : stock counts sync both ways. Selling only happens here.
    </p>
  );
}

/** A drug's NoelOps logo, or a gold box for a catalog product. */
function ProductLogo({ it }: { it: { id: string; item?: string } }) {
  if (it.item)
    return (
      <span className="grid h-full w-full place-items-center rounded-xl border border-gold-600/50 bg-coal text-gold-300">
        <Package className="size-6" />
      </span>
    );
  return <Logo id={it.id === 'coca' ? 'cokeSmall' : it.id} />;
}

function Body() {
  const [params, setParams] = useSearchParams();
  // Catalog products an admin added (Admin → Lists) join the drugs on the call.
  setExtraProducts(useLists().products);
  const m = useMoney();
  const { ready } = useNarcotics();
  const [settings, setSettings] = useState(false);
  const asked = params.get('tab');
  const view = (asked === 'money' || asked === 'wish' || asked === 'washing' ? asked : 'sell') as View;
  const openWishes = m.wishes.filter((w) => w.status === 'open' || w.status === 'claimed').length;
  if (!m.ready || !ready)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gold-400">
        <Sparkles className="size-8 animate-pulse" />
      </div>
    );
  return (
    <>
      <PageHeader
        icon={VenetianMask}
        kicker="Business"
        title="BlackMarket"
        sub="Product sells for dirty money at the Narco. Gang stash sales are the gang’s money; sales from your own locker are yours."
        actions={
          m.all && (
            <button className="btn-ghost" onClick={() => setSettings(true)}>
              <Settings2 className="size-4" /> Settings
            </button>
          )
        }
      />
      <NoelStatus />
      <div className="mb-5">
        <Tabs
          value={view}
          onChange={(v) => setParams(v === 'sell' ? {} : { tab: v })}
          tabs={[
            { id: 'sell', label: 'Sell' },
            { id: 'money', label: 'Money' },
            { id: 'wish', label: `Wish list${openWishes ? ` · ${openWishes}` : ''}` },

          ]}
        />
      </div>
      {view === 'sell' && <SellView />}
      {view === 'money' && <MoneyView />}
      {view === 'wish' && <WishView />}
      {/* Washing moved to the Money page. */}
      {view === 'washing' && <Navigate to="/money?tab=washing" replace />}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </>
  );
}

/** The BlackMarket, in the HQ's gold. Narco logs are public to the family; personal amounts stay private. */
export default function BlackMarket() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}

import '@fortawesome/fontawesome-free/css/all.min.css';
import '../noel/noel.css';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { countOf, useLocker } from '../lib/locker';
import { SALE_ITEMS, money, saleItem, unitWord, useMoney, useMoneyOps, type Sale, type Wish } from '../lib/money';
import { toCount } from '../noel/data';
import { NarcoticsProvider, useNarcotics } from '../noel/store';
import { NoelAvatar, relTime } from '../noel/avatar';
import { VenetianMask } from 'lucide-react';
import { PageHeader } from '../components/Page';
import { NOELOPS_URL } from '../lib/noelops';
import { Empty, Logo, NoelModal, ToastProvider, useChartTips, useToast } from '../noel/ui';

type View = 'sell' | 'wish' | 'wash';
const PRICE_COLORS = ['#f87171', '#fbbf24', '#38bdf8'];
const DAY = 86400e3;
const at = (x: { at?: { toMillis(): number } }) => x.at?.toMillis() ?? Date.now();
const fmtWhen = (ms: number) =>
  `${new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' })} ${new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}`;

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

function SellForm({ narco, setNarco }: { narco: boolean; setNarco: (v: boolean) => void }) {
  const { me, roster } = useHub();
  const m = useMoney();
  const mops = useMoneyOps();
  const toast = useToast();
  const sources = useSources();
  const [product, setProduct] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [seller, setSeller] = useState(me.id);
  const [price, setPrice] = useState('');
  const [priceTouched, setPriceTouched] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const item = product ? saleItem(product) : null;
  const have = (key: string | null, p: string | null) => {
    const src = sources.find((s) => s.key === key);
    const it = p ? saleItem(p) : null;
    return src && it ? countOf(src.stock, { strain: it.strain, field: it.field }) : 0;
  };
  const totalOf = (p: string) => sources.reduce((t, s) => t + have(s.key, p), 0);
  const best = (p: string, keep: string | null) => (keep && have(keep, p) ? keep : (sources.find((s) => have(s.key, p))?.key ?? null));
  const defaultPrice = product && m.prices[product] ? m.prices[product]! * qty : null;
  const shownPrice = priceTouched ? price : defaultPrice ? String(defaultPrice) : '';
  const sellerName = roster.find((r) => r.id === seller)?.name ?? me.name;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (!product || !from) return setError('Pick what’s being sold and where from.');
    if (qty < 1) return setError('Enter at least 1.');
    if (qty > have(from, product)) return setError(`Only ${have(from, product)} there.`);
    const src = sources.find((s) => s.key === from)!;
    const p = shownPrice.trim() === '' ? null : toCount(shownPrice);
    await toast.run(
      mops.sell({ product, qty, from, fromLabel: src.label, seller: { id: seller, name: sellerName }, cut: m.cutFor(seller), price: p, narco, note }).then((d) => {
        if (!d) setError('Not enough there any more. Someone else may have moved it.');
        return d;
      }),
    );
    setQty(1);
    setPrice('');
    setPriceTouched(false);
    setNote('');
    setNarco(false);
  }

  return (
    <form id="sale-form" className={`dx-glass dx-qs ${narco ? 'bm-ring' : ''}`} onSubmit={submit}>
      <div className="dx-sec">
        <h2>
          <i className="fa-solid fa-sack-dollar bm-dirty mr-1" />
          Sell at the BlackMarket{' '}
          {narco && (
            <span className="bm-tag">
              <i className="fa-solid fa-phone-volume" />
              Narco call
            </span>
          )}
        </h2>
        <span className="dx-muted hidden text-xs sm:inline">Takes it out of the stash (or your locker) and adds it to the ledger.</span>
      </div>
      <div className="qs-step">
        <span>1</span>What&apos;s being sold
      </div>
      <div className="qs-strains">
        {SALE_ITEMS.map((st) => {
          const total = totalOf(st.id);
          return (
            <button
              key={st.id}
              type="button"
              className={`qs-strain ${product === st.id ? 'on' : ''} ${total ? '' : 'empty'} ${st.strain ? '' : 'product'}`}
              style={{ ['--tint' as string]: st.tint }}
              onClick={() => {
                if (!total) return;
                setProduct(st.id);
                setFrom(best(st.id, from));
                setError('');
              }}
              aria-disabled={!total}
              title={`${st.name}: ${total} ${unitWord(st.id, total)} on hand`}
            >
              <span className="lg">
                <Logo id={st.id} />
              </span>
              <b className={st.nameColor}>{st.name}</b>
              <small>
                <b>{total}</b> on hand
              </small>
            </button>
          );
        })}
      </div>
      <div className="qs-cols">
        <div>
          <div className="qs-step">
            <span>2</span>From
          </div>
          <div className="qs-from">
            {product ? (
              sources.map((s) => {
                const c = have(s.key, product);
                return (
                  <button key={s.key} type="button" className={from === s.key ? 'on' : ''} disabled={!c} onClick={() => setFrom(s.key)}>
                    {s.mine && <i className="fa-solid fa-lock mr-1 opacity-60" />}
                    {s.label}
                    <b>{c}</b>
                  </button>
                );
              })
            ) : (
              <p className="dx-muted text-xs">Pick what&apos;s being sold first.</p>
            )}
          </div>
        </div>
        <div>
          <div className="qs-step">
            <span>3</span>How many <em>{product && from ? `(${have(from, product)} at ${sources.find((s) => s.key === from)?.label})` : ''}</em>
          </div>
          <div className="qs-count">
            <button type="button" onClick={() => setQty(Math.max(1, qty - 1))} aria-label="One less">
              −
            </button>
            <input type="number" min={1} value={qty} inputMode="numeric" aria-label="How many" onChange={(e) => setQty(toCount(e.target.value))} />
            <button type="button" onClick={() => setQty(qty + 1)} aria-label="One more">
              +
            </button>
          </div>
          <div className="qs-quick">
            {[1, 2, 5, 10].map((n) => (
              <button key={n} type="button" onClick={() => setQty(n)}>
                {n}
              </button>
            ))}
            <button type="button" onClick={() => setQty(have(from, product))}>
              All
            </button>
          </div>
        </div>
      </div>
      <div className="qs-step">
        <span>4</span>Details
      </div>
      <div className="qs-details">
        <label>
          Sold by {m.all && <span>(gets the seller&apos;s cut)</span>}
          <select className="dx-input w-full" value={seller} onChange={(e) => setSeller(e.target.value)} disabled={!m.all}>
            {(m.all ? roster : roster.filter((r) => r.id === me.id)).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dirty money <span>(total{defaultPrice ? ', fills in from the default' : ''})</span>
          <input
            type="number"
            min={0}
            placeholder="$"
            className="dx-input w-full font-mono"
            value={shownPrice}
            onChange={(e) => {
              setPriceTouched(true);
              setPrice(e.target.value);
            }}
          />
        </label>
        <label>
          Note <span>(optional)</span>
          <input type="text" maxLength={60} placeholder="Buyer, drop spot…" className="dx-input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-red-400">{error}</p>}
      <button type="submit" className="qs-submit" disabled={!product || qty < 1}>
        {product && item ? (
          <>
            <i className="fa-solid fa-sack-dollar mr-2" />
            Sell {qty} {item.strain ? `${item.name} ${unitWord(item.id, qty)}` : qty === 1 ? item.name : `${item.name}s`}
            {shownPrice ? ` for ${money(toCount(shownPrice))} dirty` : ''}
          </>
        ) : (
          'Pick what’s being sold to start'
        )}
      </button>
    </form>
  );
}

function hbars(rows: { id: string; label: string; qty: number; cash: number; logo?: boolean }[], showCash: boolean) {
  if (!rows.length) return <p className="dx-muted text-xs">Nothing in this period.</p>;
  const max = Math.max(1, ...rows.map((r) => r.qty));
  return rows.map((r) => (
    <div key={r.id} className="row" data-tip={`<b>${r.label}</b><br>${r.qty} out${showCash && r.cash ? `<br>${money(r.cash)}` : ''}`}>
      <div className="nm">
        {r.logo ? (
          <span className="lg">
            <Logo id={r.id} />
          </span>
        ) : (
          <NoelAvatar name={r.label} />
        )}
        <span>{r.label}</span>
      </div>
      <div className="bar">
        <i style={{ width: `calc(${((r.qty / max) * 100).toFixed(2)}% * 0.8)` }} />
        <em>
          {r.qty}
          {showCash && r.cash ? ` · ${money(r.cash)}` : ''}
        </em>
      </div>
    </div>
  ));
}

function PriceHistory({ sales }: { sales: Sale[] }) {
  const [slots, setSlots] = useState<(string | null)[] | null>(null);
  const [table, setTable] = useState(false);
  // Mondays (ET) of the last 12 weeks
  const weeks = useMemo(() => {
    const out: string[] = [];
    const now = Date.now();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now - i * 7 * DAY);
      const et = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      et.setDate(et.getDate() - ((et.getDay() + 6) % 7));
      out.push(et.toISOString().slice(0, 10));
    }
    return out;
  }, []);
  const byProduct = useMemo(() => {
    const map: Record<string, ({ units: number; total: number; min: number; max: number; n: number } | null)[]> = {};
    for (const x of sales) {
      if (!x.price || !x.qty) continue;
      const et = new Date(new Date(at(x)).toLocaleString('en-US', { timeZone: 'America/New_York' }));
      et.setDate(et.getDate() - ((et.getDay() + 6) % 7));
      const i = weeks.indexOf(et.toISOString().slice(0, 10));
      if (i < 0) continue;
      const row = (map[x.product] ??= weeks.map(() => null));
      const c = (row[i] ??= { units: 0, total: 0, min: Infinity, max: 0, n: 0 });
      const each = x.price / x.qty;
      c.units += x.qty;
      c.total += x.price;
      c.n += 1;
      c.min = Math.min(c.min, each);
      c.max = Math.max(c.max, each);
    }
    return map;
  }, [sales, weeks]);
  const items = SALE_ITEMS.filter((s) => byProduct[s.id]);
  const picked =
    slots ??
    [0, 1, 2].map(
      (i) =>
        items
          .map((s) => [s.id, byProduct[s.id]!.reduce((t, c) => t + (c?.units ?? 0), 0)] as const)
          .sort((a, b) => b[1] - a[1])
          .map((x) => x[0])[i] ?? null,
    );
  const series = picked.map((id, slot) => (id && byProduct[id] ? { id, slot, name: saleItem(id)!.name, cells: byProduct[id]! } : null)).filter(Boolean) as {
    id: string;
    slot: number;
    name: string;
    cells: ({ units: number; total: number; min: number; max: number; n: number } | null)[];
  }[];
  const toggle = (id: string) => {
    const s = [...picked];
    const i = s.indexOf(id);
    if (i >= 0) s[i] = null;
    else if (s.indexOf(null) >= 0) s[s.indexOf(null)] = id;
    setSlots(s);
  };
  const W = 900,
    H = 240,
    L = 64,
    R = 110,
    T = 14,
    B = 30;
  const vals = series.flatMap((s) => s.cells.filter(Boolean).map((c) => c!.total / c!.units));
  const raw = Math.max(1, ...vals) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const maxV = ([1, 2, 2.5, 5, 10].map((x) => x * mag).find((s) => s >= raw) ?? raw) * 4;
  const x = (i: number) => L + (W - L - R) * (i / (weeks.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / maxV);
  const fmtW = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return (
    <div className={`dx-glass dx-panel mb-4 ${table ? 'show-table' : ''}`}>
      <div className="dx-sec">
        <h2>
          Price history <span className="dx-muted text-xs font-semibold">· average per brick / bin, last 12 weeks</span>
        </h2>
        <button type="button" className={`dx-tbl-btn ${table ? 'on' : ''}`} onClick={() => setTable(!table)}>
          {table ? 'Chart' : 'Table'}
        </button>
      </div>
      <div className="price-chips">
        {items.map((s) => {
          const slot = picked.indexOf(s.id);
          return (
            <button key={s.id} type="button" className={`price-chip ${slot >= 0 ? 'on' : ''}`} style={slot >= 0 ? { ['--pc' as string]: PRICE_COLORS[slot] } : undefined} onClick={() => toggle(s.id)}>
              {slot >= 0 && <i />}
              {s.name}
            </button>
          );
        })}
      </div>
      {!series.length ? (
        <p className="dx-muted py-6 text-center text-xs">{items.length ? 'Pick a product above to see its price.' : 'No priced sales in the last 12 weeks yet.'}</p>
      ) : table ? (
        <table className="dx-sales-table">
          <thead>
            <tr>
              <th>Week of</th>
              {series.map((s) => (
                <th key={s.id} className="r">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => (
              <tr key={w}>
                <td>{fmtW(w)}</td>
                {series.map((s) => (
                  <td key={s.id} className="r">
                    {s.cells[i] ? money(s.cells[i]!.total / s.cells[i]!.units) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="price-svg" role="img" aria-label="Average price per unit by week">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={L} x2={W - R} y1={y(maxV * f)} y2={y(maxV * f)} className="pg" />
              <text x={L - 8} y={y(maxV * f) + 4} textAnchor="end" className="pa">
                {money(maxV * f)}
              </text>
            </g>
          ))}
          {weeks.map((w, i) =>
            i % 2 === (weeks.length - 1) % 2 ? (
              <text key={w} x={x(i)} y={H - 8} textAnchor="middle" className="pa">
                {fmtW(w)}
              </text>
            ) : null,
          )}
          {series.map((s) => {
            let d = '';
            let pen = false;
            s.cells.forEach((c, i) => {
              if (c) {
                d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.total / c.units).toFixed(1)}`;
                pen = true;
              } else pen = false;
            });
            const last = s.cells.map((c, j) => (c ? j : -1)).filter((j) => j >= 0).pop()!;
            return (
              <g key={s.id}>
                <path d={d} fill="none" stroke={PRICE_COLORS[s.slot]} strokeWidth="2" strokeLinejoin="round" />
                {s.cells.map((c, i) => (c ? <circle key={i} cx={x(i)} cy={y(c.total / c.units)} r="4" fill={PRICE_COLORS[s.slot]} stroke="#0c140f" strokeWidth="2" /> : null))}
                <text x={x(last) + 8} y={y(s.cells[last]!.total / s.cells[last]!.units) + 4} className="pl">
                  {s.name}
                </text>
              </g>
            );
          })}
          <g className="phits">
            {weeks.map((w, i) => (
              <rect
                key={w}
                x={x(i) - (W - L - R) / (weeks.length - 1) / 2}
                y={T}
                width={(W - L - R) / (weeks.length - 1)}
                height={H - T - B}
                className="ph"
                data-tip={`<b>Week of ${fmtW(w)}</b><br>${series
                  .map((s) => `<i style="background:${PRICE_COLORS[s.slot]}"></i>${s.name} <b>${s.cells[i] ? money(s.cells[i]!.total / s.cells[i]!.units) : '—'}</b>`)
                  .join('<br>')}`}
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

function LedgerModal({ type, toId, onClose }: { type: 'payout' | 'expense'; toId?: string; onClose: () => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const { roster } = useHub();
  const [who, setWho] = useState(toId ?? roster[0]?.id ?? '');
  const owed = m.people.find((p) => p.id === who)?.owed ?? 0;
  const [amount, setAmount] = useState(type === 'payout' && toId ? String(owed) : '');
  const [note, setNote] = useState('');
  return (
    <NoelModal
      onClose={onClose}
      onSubmit={async () => {
        const a = toCount(amount);
        if (!a) return;
        await mops.addLedger({ type, amount: a, toId: type === 'payout' ? who : null, toName: type === 'payout' ? roster.find((r) => r.id === who)?.name : undefined, note: note.trim().slice(0, 60) });
        onClose();
      }}
    >
      <h2 className="text-center text-xl font-black text-white">{type === 'payout' ? 'Record payout' : 'Record expense'}</h2>
      {type === 'payout' && (
        <label className="block text-xs font-semibold text-slate-300">
          Paid to
          <select className="dx-input mt-1 w-full" value={who} onChange={(e) => setWho(e.target.value)}>
            {roster.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · owed {money(m.people.find((p) => p.id === r.id)?.owed ?? 0)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs font-semibold text-slate-300">
        Amount
        <input type="number" min={1} className="dx-input mt-1 w-full font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      </label>
      <label className="block text-xs font-semibold text-slate-300">
        Note
        <input className="dx-input mt-1 w-full" value={note} onChange={(e) => setNote(e.target.value)} maxLength={60} placeholder="Optional" />
      </label>
      <button type="submit" className="qs-submit">
        Save
      </button>
      <button type="button" onClick={onClose} className="w-full text-xs text-slate-400 hover:text-white">
        Cancel
      </button>
    </NoelModal>
  );
}

function Budget({ since, periodLabel }: { since: number; periodLabel: string }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const [ledger, setLedger] = useState<{ type: 'payout' | 'expense'; toId?: string } | null>(null);
  const range = m.sales.filter((x) => at(x) >= since);
  const rangeIncome = range.reduce((t, x) => t + (x.price ?? 0), 0);
  const rangePaid = m.ledger.filter((l) => l.type === 'payout' && at(l) >= since).reduce((t, l) => t + l.amount, 0);
  const rangeExp = m.ledger.filter((l) => l.type === 'expense' && at(l) >= since).reduce((t, l) => t + l.amount, 0);
  const owedTotal = m.people.reduce((t, p) => t + p.owed, 0);
  const ranked = m.people.filter((p) => p.sold || p.owed || p.paid).sort((a, b) => b.earned - a.earned);
  return (
    <div className="dx-glass dx-budget mb-4">
      <div className="dx-sec">
        <h2>
          <i className="fa-solid fa-sack-dollar mr-1 text-amber-400" />
          Budget
        </h2>
        <div className="flex gap-2">
          <button type="button" className="dx-act" style={{ flex: 'none', padding: '6px 12px' }} onClick={() => setLedger({ type: 'payout' })}>
            <i className="fa-solid fa-hand-holding-dollar mr-1" />
            Record Payout
          </button>
          <button type="button" className="dx-act" style={{ flex: 'none', padding: '6px 12px' }} onClick={() => setLedger({ type: 'expense' })}>
            <i className="fa-solid fa-receipt mr-1" />
            Record Expense
          </button>
        </div>
      </div>
      <div className="dx-budget-tiles">
        <div>
          <div className="l">Gang bank</div>
          <div className={`v bank ${m.bank < 0 ? 'neg' : ''}`}>
            {m.bank < 0 ? '−' : ''}
            {money(Math.abs(m.bank))}
          </div>
          <div className="s">sales in, minus payouts &amp; expenses</div>
        </div>
        <div>
          <div className="l">Sales · {periodLabel}</div>
          <div className="v">{money(rangeIncome)}</div>
          <div className="s">{range.reduce((t, x) => t + x.qty, 0)} out</div>
        </div>
        <div>
          <div className="l">Paid out · {periodLabel}</div>
          <div className="v">{money(rangePaid)}</div>
          <div className="s">expenses {money(rangeExp)}</div>
        </div>
        <div>
          <div className="l">Owed to crew</div>
          <div className={`v ${owedTotal ? 'text-amber-300' : ''}`}>{money(owedTotal)}</div>
          <div className="s">bank after paying: {money(m.bank - owedTotal)}</div>
        </div>
      </div>
      <div className="dx-budget-grid">
        <div>
          <h3>Payouts by person</h3>
          <div className="overflow-x-auto">
            <table className="dx-sales-table">
              {ranked.length ? (
                <>
                  <thead>
                    <tr>
                      <th>Seller</th>
                      <th className="r">Out</th>
                      <th className="r">Sold</th>
                      <th className="r">Earned</th>
                      <th className="r">Paid</th>
                      <th className="r">Owed now</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {ranked.map((p, i) => (
                      <tr key={p.id}>
                        <td>
                          <span className="rank">{i + 1}</span>
                          <NoelAvatar name={p.name} /> <b>{p.name}</b>
                        </td>
                        <td className="r">{p.qty}</td>
                        <td className="r">{money(p.sold)}</td>
                        <td className="r">
                          <b>{money(p.earned)}</b>
                        </td>
                        <td className="r">{money(p.paid)}</td>
                        <td className={`r ${p.owed ? 'owed' : ''}`}>{money(p.owed)}</td>
                        <td className="r">
                          {p.owed > 0 && (
                            <button type="button" className="pay" onClick={() => setLedger({ type: 'payout', toId: p.id })}>
                              Pay
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <tbody>
                  <tr>
                    <td className="m">No sales with prices yet.</td>
                  </tr>
                </tbody>
              )}
            </table>
          </div>
          <p className="dx-muted mt-2 text-[11px]">Earned = each sale&apos;s price × the seller&apos;s cut at the time. &quot;Owed now&quot; counts all time.</p>
        </div>
        <div>
          <h3>Payouts &amp; expenses</h3>
          {m.ledger.length ? (
            <ul className="dx-ledger">
              {m.ledger.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <i className={`fa-solid ${l.type === 'payout' ? 'fa-hand-holding-dollar text-amber-400' : 'fa-receipt text-slate-400'}`} />
                  <div className="min-w-0">
                    <div>
                      {l.type === 'payout' ? <>Paid <b>{l.toName}</b></> : <b>Expense</b>}
                      {l.note ? <span className="dx-muted"> · {l.note}</span> : null}
                    </div>
                    <div className="dx-muted text-[11px]">
                      {l.byName} · {relTime(at(l), Date.now())}
                    </div>
                  </div>
                  <span className="amt">−{money(l.amount)}</span>
                  <button type="button" className="text-xs text-slate-500 hover:text-red-300" onClick={() => confirm('Remove this entry?') && mops.removeLedger(l.id)} title="Remove">
                    <i className="fa-solid fa-xmark" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dx-muted text-xs">Nothing recorded yet.</p>
          )}
        </div>
      </div>
      {ledger && <LedgerModal type={ledger.type} toId={ledger.toId} onClose={() => setLedger(null)} />}
    </div>
  );
}

function SellView({ narco, setNarco }: { narco: boolean; setNarco: (v: boolean) => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const toast = useToast();
  const [period, setPeriod] = useState('30');
  const [product, setProduct] = useState('');
  const [who, setWho] = useState('');
  const [from, setFrom] = useState('');
  const [shown, setShown] = useState(50);
  const since = period === 'all' ? 0 : Date.now() - Number(period) * DAY;
  const list = m.sales.filter((x) => at(x) >= since && (!product || x.product === product) && (!who || x.sellerId === who) && (!from || x.fromLabel === from));
  const sinceTile = (msBack: number) => {
    const l = m.sales.filter((x) => at(x) >= Date.now() - msBack);
    return { qty: l.reduce((t, x) => t + x.qty, 0), cash: l.reduce((t, x) => t + (x.price ?? 0), 0), n: l.length };
  };
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const sinceMidnight = (today.getHours() * 60 + today.getMinutes()) * 60000;
  const group = (key: (x: Sale) => string, label: (x: Sale) => string, logo: boolean) => {
    const map = new Map<string, { id: string; label: string; qty: number; cash: number; logo: boolean }>();
    list.forEach((x) => {
      const k = key(x);
      const r = map.get(k) ?? { id: k, label: label(x), qty: 0, cash: 0, logo };
      r.qty += x.qty;
      r.cash += x.price ?? 0;
      map.set(k, r);
    });
    return [...map.values()].sort((a, b) => b.qty - a.qty);
  };

  return (
    <>
      <SellForm narco={narco} setNarco={setNarco} />
      <div className="dx-stats">
        {(
          [
            ['Today', sinceTile(sinceMidnight)],
            ['Last 7 days', sinceTile(7 * DAY)],
            ['Last 30 days', sinceTile(30 * DAY)],
            ['All time', sinceTile(Date.now())],
          ] as const
        ).map(([label, x]) => (
          <div key={label} className="dx-glass dx-stat" style={{ minHeight: 96 }}>
            <div className="lbl">
              {label}
              {!m.all && ' · you'}
            </div>
            <div className="num dx-mono">
              {x.qty.toLocaleString()}
              <span className="text-sm text-slate-500"> out</span>
            </div>
            <div className="delta dx-muted">{x.cash ? money(x.cash) : `${x.n} ${x.n === 1 ? 'entry' : 'entries'}`}</div>
          </div>
        ))}
      </div>
      {m.all && <Budget since={since} periodLabel={period === 'all' ? 'all time' : `last ${period} days`} />}
      <div className="dx-sales-filters dx-glass">
        <label>
          Period
          <select className="dx-input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label>
          Product
          <select className="dx-input" value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">All products</option>
            {SALE_ITEMS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {m.all && (
          <label>
            Person
            <select className="dx-input" value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="">Everyone</option>
              {m.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          From
          <select className="dx-input" value={from} onChange={(e) => setFrom(e.target.value)}>
            <option value="">All places</option>
            {[...new Set(m.sales.map((x) => x.fromLabel))].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <span className="dx-muted ml-auto text-xs">
          {list.length} {list.length === 1 ? 'entry' : 'entries'} · <b className="text-slate-200">{list.reduce((t, x) => t + x.qty, 0)} out</b>
          {list.some((x) => x.price) && (
            <>
              {' '}
              · <b className="text-slate-200">{money(list.reduce((t, x) => t + (x.price ?? 0), 0))}</b>
            </>
          )}
        </span>
      </div>
      <PriceHistory sales={m.sales} />
      <div className="dx-charts mb-4">
        <div className="dx-glass dx-panel">
          <div className="dx-sec">
            <h2>By Product</h2>
            <span className="dx-muted text-xs">went out</span>
          </div>
          <div className="dx-hbars">{hbars(group((x) => x.product, (x) => saleItem(x.product)?.name ?? x.product, true), true)}</div>
        </div>
        <div className="dx-glass dx-panel">
          <div className="dx-sec">
            <h2>By Person</h2>
            <span className="dx-muted text-xs">went out</span>
          </div>
          <div className="dx-hbars">{hbars(group((x) => x.sellerId, (x) => x.sellerName, false), true)}</div>
        </div>
      </div>
      <div className="dx-glass dx-sales">
        <div className="dx-sec">
          <h2>Ledger{!m.all && ' · your sales'}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="dx-sales-table">
            {list.length ? (
              <>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>Product</th>
                    <th className="r">Qty</th>
                    <th>From</th>
                    <th className="r">Dirty money</th>
                    <th>Note</th>
                    {m.all && <th />}
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, shown).map((x) => (
                    <tr key={x.id}>
                      <td className="m">{fmtWhen(at(x))}</td>
                      <td>
                        <b>{x.sellerName}</b>
                      </td>
                      <td>
                        <b>{saleItem(x.product)?.name}</b>
                      </td>
                      <td className="n r">−{x.qty}</td>
                      <td className="m">{x.fromLabel}</td>
                      <td className="r">{x.price ? money(x.price) : <span className="dx-muted">—</span>}</td>
                      <td className="m">
                        {x.narco && (
                          <span className="bm-tag" title="From a Narco call">
                            <i className="fa-solid fa-phone-volume" />
                            Narco
                          </span>
                        )}{' '}
                        {x.note}
                      </td>
                      {m.all && (
                        <td className="r">
                          <button
                            type="button"
                            className="text-slate-500 hover:text-red-300"
                            title="Remove entry and return the product"
                            onClick={() => confirm(`Remove this sale and put ${x.qty} back in ${x.fromLabel}?`) && toast.run(mops.removeSale(x))}
                          >
                            <i className="fa-solid fa-rotate-left" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <tbody>
                <tr>
                  <td className="m" style={{ padding: '14px 8px' }}>
                    {m.sales.length ? 'Nothing matches these filters.' : <Empty title="Nothing sold yet" text="Got a Narco call? Sell it above and it comes out of the stash." />}
                  </td>
                </tr>
              </tbody>
            )}
          </table>
        </div>
        {list.length > shown && (
          <div className="mt-3 text-center">
            <button type="button" className="dx-act" style={{ flex: 'none', padding: '6px 14px' }} onClick={() => setShown(shown + 50)}>
              Show more ({list.length - shown} left)
            </button>
          </div>
        )}
      </div>
    </>
  );
}

function WishView() {
  const m = useMoney();
  const mops = useMoneyOps();
  const { me, can } = useHub();
  const fields = m.settings.wishFields ?? [];
  const [title, setTitle] = useState('');
  const [qty, setQty] = useState('1');
  const [notes, setNotes] = useState('');
  const [extra, setExtra] = useState<Record<string, string>>({});
  const active = m.wishes.filter((w) => w.status === 'open' || w.status === 'claimed').sort((a, b) => Number(a.status === 'claimed') - Number(b.status === 'claimed') || at(b) - at(a));
  const done = m.wishes.filter((w) => w.status === 'done' || w.status === 'cancelled').sort((a, b) => (b.doneAt?.toMillis() ?? 0) - (a.doneAt?.toMillis() ?? 0));
  const boss = can('money');
  const card = (w: Wish) => {
    const claimed = w.status === 'claimed';
    return (
      <div key={w.id} className={`dx-glass wish ${w.status}`}>
        <div className="top">
          <div className="min-w-0">
            <h3>
              {w.title}
              {w.qty > 1 && <span className="qty"> ×{w.qty}</span>}
            </h3>
            <div className="by">
              Asked by <b>{w.byName}</b> · {relTime(at(w), Date.now())}
            </div>
          </div>
          <span className={`wish-pill ${w.status}`}>{claimed ? `${w.claimerName} is on it` : 'Open'}</span>
        </div>
        {fields.some((f) => w.fields?.[f.id]) && (
          <div className="fields">
            {fields
              .filter((f) => w.fields?.[f.id])
              .map((f) => (
                <span key={f.id}>
                  <b>{f.label}:</b> {w.fields![f.id]}
                </span>
              ))}
          </div>
        )}
        {w.notes && <p className="notes">{w.notes}</p>}
        <div className="acts">
          {w.status === 'open' && (
            <button type="button" className="dx-btn dx-btn-g" onClick={() => mops.wishAction(w, 'claim')}>
              <i className="fa-solid fa-hand mr-1" />
              I&apos;ll get it
            </button>
          )}
          {claimed && (w.claimerId === me.id || boss) && (
            <button type="button" className="dx-btn dx-btn-g" onClick={() => mops.wishAction(w, 'done')}>
              <i className="fa-solid fa-check mr-1" />
              Got it
            </button>
          )}
          {claimed && w.claimerId === me.id && (
            <button type="button" className="dx-btn dx-btn-o" onClick={() => mops.wishAction(w, 'unclaim')}>
              Let it go
            </button>
          )}
          {(boss || w.byId === me.id) && (
            <button type="button" className="dx-btn dx-stop" title="Cancel this request" onClick={() => confirm(`Cancel "${w.title}"?`) && mops.wishAction(w, 'cancel')}>
              <i className="fa-solid fa-xmark" />
            </button>
          )}
        </div>
      </div>
    );
  };
  return (
    <>
      <form
        className="dx-glass dx-qs"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await mops.postWish({ title: title.trim().slice(0, 60), qty: Math.max(1, Math.min(999, toCount(qty) || 1)), notes: notes.trim().slice(0, 200), fields: extra });
          setTitle('');
          setQty('1');
          setNotes('');
          setExtra({});
        }}
      >
        <div className="dx-sec">
          <h2>
            <i className="fa-solid fa-list-check bm-dirty mr-1" />
            Wish list
          </h2>
          <span className="dx-muted hidden text-xs sm:inline">Something the family needs got? Post it, someone claims it, then marks it got.</span>
        </div>
        <div className="wish-grid">
          <label className="wide">
            What&apos;s needed
            <input maxLength={60} required placeholder="e.g. Battery acid, a boat, 2 pistols" className="dx-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            How many
            <input type="number" min={1} max={999} className="dx-input dx-mono w-full" value={qty} onChange={(e) => setQty(e.target.value)} />
          </label>
          {fields.map((f) => (
            <label key={f.id}>
              {f.label}
              <input maxLength={60} className="dx-input w-full" value={extra[f.id] ?? ''} onChange={(e) => setExtra({ ...extra, [f.id]: e.target.value })} />
            </label>
          ))}
          <label className="wide">
            Notes <span>(optional)</span>
            <input maxLength={200} placeholder="Where, by when, who to give it to…" className="dx-input w-full" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
        <button type="submit" className="qs-submit">
          <i className="fa-solid fa-plus mr-2" />
          Add to the wish list
        </button>
      </form>
      <div className="wish-list">
        {active.length ? (
          active.map(card)
        ) : (
          <div style={{ gridColumn: '1/-1' }}>
            <Empty title="Nothing on the list" text="Need something sourced? Post it above and someone can claim it." />
          </div>
        )}
      </div>
      {done.length > 0 && (
        <div className="wish-done">
          <details>
            <summary>Done &amp; cancelled ({done.length})</summary>
            <ul>
              {done.slice(0, 30).map((w) => (
                <li key={w.id}>
                  <span className={`wish-pill ${w.status}`}>{w.status === 'done' ? 'Got it' : 'Cancelled'}</span> <b>{w.title}</b>
                  {w.qty > 1 ? ` ×${w.qty}` : ''} <span className="dx-muted">· {w.status === 'done' ? `by ${w.claimerName}` : ''}</span>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </>
  );
}

function WashView() {
  const m = useMoney();
  const mops = useMoneyOps();
  const toast = useToast();
  const { me } = useHub();
  const [who, setWho] = useState(me.id);
  const [amount, setAmount] = useState('');
  const [pct, setPct] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const person = m.people.find((p) => p.id === who) ?? m.mine;
  const p = pct ?? String(m.washPct);
  const dirty = toCount(amount);
  const clean = Math.round((dirty * (100 - Math.max(0, Math.min(100, Number(p) || 0)))) / 100);
  const visible = m.all ? m.people : [m.mine];
  const tot = visible.reduce((t, x) => ({ held: t.held + x.held, lost: t.lost + x.lost }), { held: 0, lost: 0 });
  return (
    <>
      <div className="dx-stats">
        <div className="dx-glass dx-stat">
          <div className="lbl">Your dirty money</div>
          <div className="num dx-mono bm-dirty">{money(m.mine.held)}</div>
          <div className="delta dx-muted">from your sales, not washed yet</div>
        </div>
        <div className="dx-glass dx-stat">
          <div className="lbl">You&apos;ve washed</div>
          <div className="num dx-mono">{money(m.mine.clean)}</div>
          <div className="delta dx-muted">clean, from {money(m.mine.washed)} dirty</div>
        </div>
        {m.all && (
          <>
            <div className="dx-glass dx-stat">
              <div className="lbl">Family dirty money</div>
              <div className="num dx-mono bm-dirty">{money(tot.held)}</div>
              <div className="delta dx-muted">held by {visible.filter((x) => x.held).length} people</div>
            </div>
            <div className="dx-glass dx-stat">
              <div className="lbl">Lost to washing</div>
              <div className="num dx-mono" style={{ color: '#fca5a5' }}>
                {money(tot.lost)}
              </div>
              <div className="delta dx-muted">launderers&apos; cuts, all time</div>
            </div>
          </>
        )}
      </div>
      <form
        className="dx-glass dx-qs"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!dirty) return toast.alert('Enter how much dirty money is being washed.', 'warning');
          if (dirty > person.held) return toast.alert(`${person.name} only has ${money(person.held)} dirty.`, 'warning');
          await toast.run(
            mops.wash({ memberId: person.id, memberName: person.name, dirty, pct: Math.round(Number(p) || 0), note: note.trim().slice(0, 60) }).then(() => ({ text: `Washed: ${money(clean)} clean.` })),
          );
          setAmount('');
          setNote('');
        }}
      >
        <div className="dx-sec">
          <h2>
            <i className="fa-solid fa-soap bm-dirty mr-1" />
            Wash dirty money
          </h2>
          <span className="dx-muted hidden text-xs sm:inline">Each seller holds the dirty money from their sales until they wash it.</span>
        </div>
        <div className="wish-grid">
          <label>
            Whose money
            <select className="dx-input w-full" value={who} onChange={(e) => setWho(e.target.value)} disabled={!m.all}>
              {(m.all ? m.people.filter((x) => x.held > 0 || x.id === me.id) : [m.mine]).map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {money(x.held)} dirty
                </option>
              ))}
            </select>
          </label>
          <label>
            Dirty money in
            <div className="flex gap-2">
              <input type="number" min={1} placeholder="$" className="dx-input dx-mono w-full" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <button type="button" className="dx-act" style={{ flex: 'none' }} onClick={() => setAmount(String(person.held))}>
                All
              </button>
            </div>
          </label>
          <label>
            Wash cut %
            <input type="number" min={0} max={100} className="dx-input dx-mono w-full" value={p} onChange={(e) => setPct(e.target.value)} />
          </label>
          <label>
            Note <span>(optional)</span>
            <input maxLength={60} placeholder="Launderer, where…" className="dx-input w-full" value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </div>
        <p className="mt-3 text-sm text-slate-300">
          {dirty ? (
            <>
              You get <b>{money(clean)}</b> clean · <span style={{ color: '#fca5a5' }}>{money(dirty - clean)}</span> to the launderer
            </>
          ) : (
            'Enter how much dirty money goes in.'
          )}
        </p>
        <button type="submit" className="qs-submit">
          <i className="fa-solid fa-soap mr-2" />
          Wash it
        </button>
      </form>
      <div className="mt-4">
        <div className="dx-glass dx-sales">
          <div className="dx-sec">
            <h2>Who holds what</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="dx-sales-table">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="r">Dirty held</th>
                  <th className="r">Washed</th>
                  <th className="r">Clean out</th>
                  <th className="r">Lost</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <b>{x.name}</b>
                    </td>
                    <td className="r bm-dirty">{money(x.held)}</td>
                    <td className="r">{money(x.washed)}</td>
                    <td className="r">{money(x.clean)}</td>
                    <td className="r" style={{ color: '#fca5a5' }}>
                      {money(x.lost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="dx-glass dx-sales mt-4">
          <div className="dx-sec">
            <h2>Wash log</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="dx-sales-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th className="r">Dirty</th>
                  <th className="r">Cut</th>
                  <th className="r">Clean</th>
                  <th>Note</th>
                  {m.all && <th />}
                </tr>
              </thead>
              <tbody>
                {m.washes.slice(0, 50).map((w) => (
                  <tr key={w.id}>
                    <td className="m">{fmtWhen(at(w))}</td>
                    <td>
                      <b>{w.memberName}</b>
                    </td>
                    <td className="r bm-dirty">{money(w.dirty)}</td>
                    <td className="r">{w.pct}%</td>
                    <td className="r">{money(w.clean)}</td>
                    <td className="m">{w.note}</td>
                    {m.all && (
                      <td className="r">
                        <button
                          type="button"
                          className="text-slate-500 hover:text-red-300"
                          title="Remove this wash (the money goes back to dirty)"
                          onClick={() => confirm(`Remove this wash of ${money(w.dirty)}?`) && mops.removeWash(w.id)}
                        >
                          <i className="fa-solid fa-rotate-left" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!m.washes.length && (
                  <tr>
                    <td colSpan={7} className="dx-muted">
                      Nothing washed yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Settings({ onClose }: { onClose: () => void }) {
  const m = useMoney();
  const mops = useMoneyOps();
  const { roster } = useHub();
  const [prices, setPrices] = useState<Record<string, string>>(() => Object.fromEntries(SALE_ITEMS.map((s) => [s.id, m.prices[s.id] ? String(m.prices[s.id]) : ''])));
  const [cut, setCut] = useState(String(m.defaultCut));
  const [wash, setWash] = useState(String(m.washPct));
  const [cuts, setCuts] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(m.settings.cuts ?? {}).map(([k, v]) => [k, String(v)])));
  const [fields, setFields] = useState((m.settings.wishFields ?? []).map((f) => f.label).join(', '));
  return (
    <NoelModal
      wide
      onClose={onClose}
      onSubmit={async () => {
        await mops.saveSettings({
          prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => toCount(v) > 0).map(([k, v]) => [k, toCount(v)])),
          defaultCut: Math.min(100, toCount(cut)),
          washPct: Math.min(100, toCount(wash)),
          cuts: Object.fromEntries(Object.entries(cuts).filter(([, v]) => v.trim() !== '').map(([k, v]) => [k, Math.min(100, toCount(v))])),
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
      <h2 className="text-center text-xl font-black text-white">BlackMarket settings</h2>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-slate-300">
          Default seller cut %
          <input type="number" min={0} max={100} className="dx-input mt-1 w-full font-mono" value={cut} onChange={(e) => setCut(e.target.value)} />
        </label>
        <label className="block text-xs font-semibold text-slate-300">
          Default wash cut %
          <input type="number" min={0} max={100} className="dx-input mt-1 w-full font-mono" value={wash} onChange={(e) => setWash(e.target.value)} />
        </label>
      </div>
      <p className="text-xs font-semibold text-slate-300">Default prices (per brick / bin)</p>
      <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {SALE_ITEMS.map((s) => (
          <label key={s.id} className="block text-[11px] text-slate-400">
            {s.name}
            <input type="number" min={0} placeholder="$" className="dx-input mt-0.5 w-full font-mono" value={prices[s.id]} onChange={(e) => setPrices({ ...prices, [s.id]: e.target.value })} />
          </label>
        ))}
      </div>
      <p className="text-xs font-semibold text-slate-300">Personal cuts (blank = default)</p>
      <div className="grid max-h-40 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
        {roster.map((r) => (
          <label key={r.id} className="block text-[11px] text-slate-400">
            {r.name}
            <input type="number" min={0} max={100} placeholder={`${m.defaultCut}%`} className="dx-input mt-0.5 w-full font-mono" value={cuts[r.id] ?? ''} onChange={(e) => setCuts({ ...cuts, [r.id]: e.target.value })} />
          </label>
        ))}
      </div>
      <label className="block text-xs font-semibold text-slate-300">
        Extra wish list boxes <span className="font-normal text-slate-500">(comma separated, up to 8, e.g. Buyer, Meet spot)</span>
        <input className="dx-input mt-1 w-full" value={fields} onChange={(e) => setFields(e.target.value)} />
      </label>
      <button type="submit" className="qs-submit">
        Save
      </button>
      <button type="button" onClick={onClose} className="w-full text-xs text-slate-400 hover:text-white">
        Cancel
      </button>
    </NoelModal>
  );
}

function exportCsv(sales: Sale[]) {
  const rows = [['When (ET)', 'Seller', 'Product', 'Qty', 'From', 'Dirty money', 'Narco', 'Note']].concat(
    sales.map((x) => [fmtWhen(at(x)), x.sellerName, saleItem(x.product)?.name ?? x.product, String(x.qty), x.fromLabel, x.price ? String(x.price) : '', x.narco ? 'yes' : '', x.note ?? '']),
  );
  const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `blackmarket-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function Body() {
  const [params, setParams] = useSearchParams();
  const view = (['sell', 'wish', 'wash'].includes(params.get('tab') ?? '') ? params.get('tab') : 'sell') as View;
  const setView = (v: View) => setParams(v === 'sell' ? {} : { tab: v });
  const m = useMoney();
  const { ready } = useNarcotics();
  const [narco, setNarco] = useState(false);
  const [settings, setSettings] = useState(false);
  const openWishes = m.wishes.filter((w) => w.status === 'open' || w.status === 'claimed').length;
  useChartTips();
  if (!m.ready || !ready)
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-gold-400">
        <i className="fa-solid fa-mask fa-beat text-3xl" />
      </div>
    );
  return (
    <div className="bm-page">
      <PageHeader
        icon={VenetianMask}
        kicker="Money"
        title="BlackMarket"
        sub="Product sells for dirty money at the Narco. Selling takes it out of the stash, and NoelOps sees the sale and the new counts straight away."
        actions={
            <div className="dx-plan-actions">
              <button
                type="button"
                className="bm-narco"
                title="Got a Narco call? Start a sale"
                onClick={() => {
                  setView('sell');
                  setNarco(true);
                  setTimeout(() => document.getElementById('sale-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                }}
              >
                <i className="fa-solid fa-phone-volume mr-1" />
                Narco call
              </button>
              <button type="button" className="dx-act" onClick={() => exportCsv(m.sales)}>
                <i className="fa-solid fa-file-csv mr-1" />
                Export CSV
              </button>
              {m.all && (
                <button type="button" className="dx-act" onClick={() => setSettings(true)} title="Prices, cuts and wash %">
                  <i className="fa-solid fa-gear mr-1" />
                  Settings
                </button>
              )}
            </div>
        }
      />
      <NoelStatus />
      <div className="dx-tabs bm-tabs mb-4">
        <button type="button" className={`dx-tab ${view === 'sell' ? 'on' : ''}`} onClick={() => setView('sell')}>
          <i className="fa-solid fa-sack-dollar" />
          Sell
        </button>
        <button type="button" className={`dx-tab ${view === 'wish' ? 'on' : ''}`} onClick={() => setView('wish')}>
          <i className="fa-solid fa-list-check" />
          Wish list {openWishes > 0 && <span className="count">{openWishes}</span>}
        </button>
        <button type="button" className={`dx-tab ${view === 'wash' ? 'on' : ''}`} onClick={() => setView('wash')}>
          <i className="fa-solid fa-soap" />
          Wash
        </button>
      </div>
      {view === 'sell' && <SellView narco={narco} setNarco={setNarco} />}
      {view === 'wish' && <WishView />}
      {view === 'wash' && <WashView />}
      {settings && <Settings onClose={() => setSettings(false)} />}
    </div>
  );
}

/** Live link to NoelOps: drug counts and sales go both ways. */
function NoelStatus() {
  const { noelDown } = useNarcotics();
  return noelDown ? (
    <p className="mb-4 border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
      Can’t reach NoelOps right now, so drug counts aren’t showing. Sales will work again once it’s back.
    </p>
  ) : (
    <p className="mb-4 flex items-center gap-2 text-xs text-smoke">
      <span className="size-2 rounded-full bg-ok shadow-[0_0_6px_currentColor] text-ok" /> Live with{' '}
      <a href={NOELOPS_URL} target="_blank" rel="noopener" className="text-gold-300 hover:text-gold-100">
        NoelOps
      </a>
      : stock counts and sales sync both ways.
    </p>
  );
}

/** The BlackMarket: NoelOps' layout in the HQ's gold. Money is gang-wide; the Treasurer sees it all. */
export default function BlackMarket() {
  return (
    <NarcoticsProvider>
      <ToastProvider gold>
        <Body />
      </ToastProvider>
    </NarcoticsProvider>
  );
}

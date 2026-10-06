import { useState } from 'react';
import { BRICK_SIZE, PRODUCTS, STRAINS, cokeCanMake, dayKey, fmtBricks, n, toCount } from './data';
import { planEstimate, timerState } from './grow';
import { useNarcotics } from './store';
import type { NarcTab } from './TimerBar';
import { CokePair, Holo, Logo } from './ui';

function niceMax(v: number) {
  if (v <= 4) return 4;
  const step = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => v <= s * 4) ?? Math.ceil(v / 4);
  return step * 4;
}

function StrainCards({ setTab }: { setTab: (t: NarcTab) => void }) {
  const { totals, recipe } = useNarcotics();
  return (
    <div className="dx-strains" style={{ marginBottom: 26 }}>
      {STRAINS.map((s) => {
        const inv = totals.strains[s.id];
        const potential = Math.floor(inv.trimmed / BRICK_SIZE);
        const pct = ((inv.trimmed % BRICK_SIZE) / BRICK_SIZE) * 100;
        return (
          <div key={s.id} className="dx-glass dx-sc dx-tint fx-holo" style={{ ['--tint' as string]: s.tint }}>
            <Holo />
            <div className="logo">
              <Logo id={s.id} />
            </div>
            <div className={`name ${s.nameColor}`}>{s.name}</div>
            <div className="dx-sc-nums">
              <div className="gold" title="Bricks on hand">
                <span className="l">On hand</span>
                <span className={`v ${inv.bricks ? '' : 'zero'}`}>{n(inv.bricks)}</span>
              </div>
              <div className="green" title="Bricks you can press from the trimmed bud">
                <span className="l">To press</span>
                <span className={`v ${potential ? '' : 'zero'}`}>{n(potential)}</span>
              </div>
            </div>
            <div className="row">
              <span className="dx-muted">Trimmed</span>
              <b className="dx-mono text-weed-200">{n(inv.trimmed)}</b>
            </div>
            <div className="dx-bar" title={`${n(BRICK_SIZE - (inv.trimmed % BRICK_SIZE))} to next brick`}>
              <i style={{ width: `${pct.toFixed(1)}%` }} />
            </div>
            <div className="row minor">
              <span>Untrimmed</span>
              <b className="dx-mono">{n(inv.untrimmed)}</b>
            </div>
          </div>
        );
      })}
      <div className="dx-glass dx-sc dx-tint fx-holo" style={{ ['--tint' as string]: '56,189,248' }}>
        <Holo />
        <div className="logo">
          <CokePair />
        </div>
        <div className="name text-sky-300">Coke Bricks</div>
        <div className="dx-sc-nums">
          <div className="gold" title="Small coke bricks">
            <span className="l">Small</span>
            <span className={`v ${totals.cokeSmall ? '' : 'zero'}`}>{n(totals.cokeSmall)}</span>
          </div>
          <div className="gold" title="Large coke bricks">
            <span className="l">Large</span>
            <span className={`v ${totals.cokeLarge ? '' : 'zero'}`}>{n(totals.cokeLarge)}</span>
          </div>
        </div>
        <div className="row">
          <span className="dx-muted">Coca leaves</span>
          <b className="dx-mono text-sky-200">{n(totals.coca)}</b>
        </div>
        <div className="row minor">
          <span>Leaves make</span>
          <b className="dx-mono">
            {cokeCanMake(totals.coca, recipe, 'small')} S · {cokeCanMake(totals.coca, recipe, 'large')} L
          </b>
        </div>
        <button type="button" className="dx-chip-btn mx-link ck-link" onClick={() => setTab('coke')}>
          <i className="fa-solid fa-snowflake mr-1" />
          Coke guide
        </button>
      </div>
      <div className="dx-glass dx-sc dx-tint fx-holo" style={{ ['--tint' as string]: '34,211,238' }}>
        <Holo />
        <div className="logo">
          <Logo id="meth" />
        </div>
        <div className="name text-cyan-300">Meth Bins</div>
        <div className="dx-sc-nums">
          <div className="gold" style={{ gridColumn: '1/-1' }} title="Meth bins">
            <span className="l">Bins</span>
            <span className={`v ${totals.meth ? '' : 'zero'}`}>{n(totals.meth)}</span>
          </div>
        </div>
        <button type="button" className="dx-chip-btn mx-link" onClick={() => setTab('meth')}>
          <i className="fa-solid fa-flask mr-1" />
          Meth guide
        </button>
        <div className="row minor">
          <span>Finished product</span>
          <b />
        </div>
      </div>
    </div>
  );
}

function Stats() {
  const { totals, grows, now, strainYield, history } = useNarcotics();
  const soon = grows.filter((l) => {
    const st = timerState(l, now);
    return st.status !== 'idle' && st.readyAt - now <= 24 * 3600e3;
  });
  const soonBricks = soon.reduce((s, l) => s + planEstimate(l, strainYield).bricks, 0);
  const madeWeek = Array.from({ length: 7 }, (_, i) => history.get(dayKey(i))).reduce((s, h) => s + toCount(h?.bricksMade), 0);
  const tiles = [
    { key: 'bricks', label: 'Bricks on hand', value: n(totals.bricks), sub: 'Packaged & ready', color: '#8a9a8e' },
    { key: 'potential', label: 'Ready to press', value: n(totals.potential), sub: `bricks from ${n(totals.trimmed)} trimmed`, hot: true },
    { key: 'made', label: 'Pressed · this week', value: n(madeWeek), sub: 'Sales show here once the BlackMarket opens', color: '#8a9a8e' },
    {
      key: 'next',
      label: 'Coming in · next 24h',
      value: `~${fmtBricks(soonBricks)}`,
      sub: soon.length ? `est. bricks from ${soon.length} ${soon.length === 1 ? 'harvest' : 'harvests'}` : 'No harvests due',
      color: '#8a9a8e',
    },
  ];
  return (
    <div className="dx-stats">
      {tiles.map((t) => (
        <div key={t.key} className={`dx-glass dx-stat ${t.hot ? 'hot' : ''}`}>
          <div className="lbl" style={t.hot ? { color: 'hsl(var(--acc-h) 69% 58%)' } : undefined}>
            {t.label}
          </div>
          <div className="num dx-mono">{t.value}</div>
          <div className="delta" style={{ color: t.hot ? 'hsl(var(--acc-h) 69% 58%)' : t.color }}>
            {t.sub}
          </div>
        </div>
      ))}
    </div>
  );
}

function MadeAndOut() {
  const { history } = useNarcotics();
  const [group, setGroup] = useState<'all' | 'weed' | 'coke' | 'meth'>('all');
  const [table, setTable] = useState(false);
  const fields = { all: ['bricksMade', 'cokeMade', 'methMade'], weed: ['bricksMade'], coke: ['cokeMade'], meth: ['methMade'] }[group] as (
    | 'bricksMade'
    | 'cokeMade'
    | 'methMade'
  )[];
  const days = Array.from({ length: 14 }, (_, i) => 13 - i).map((back) => {
    const key = dayKey(back);
    const h = history.get(key);
    const date = new Date(`${key}T16:00:00Z`);
    return { key, made: fields.reduce((s, f) => s + toCount(h?.[f]), 0), out: 0, date, letter: 'SMTWTFS'[date.getUTCDay()], today: back === 0 };
  });
  const totalIn = days.reduce((s, d) => s + d.made, 0);
  const max = niceMax(Math.max(1, ...days.map((d) => Math.max(d.made, d.out))));
  const h = (v: number) => (v ? `${Math.max(2, (v / max) * 100).toFixed(1)}%` : '0');
  const fmtDay = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
  return (
    <div className={`dx-glass dx-panel ${table ? 'show-table' : ''}`}>
      <div className="dx-sec">
        <h2>
          Made &amp; Out <span className="dx-muted text-xs font-semibold">· last 14 days</span>
        </h2>
        <button type="button" className={`dx-tbl-btn ${table ? 'on' : ''}`} onClick={() => setTable(!table)}>
          {table ? 'Chart' : 'Table'}
        </button>
      </div>
      <div className="dx-seg" role="group" aria-label="Product">
        {(['all', 'weed', 'coke', 'meth'] as const).map((g) => (
          <button key={g} type="button" className={g === group ? 'on' : ''} onClick={() => setGroup(g)}>
            {g === 'all' ? 'All' : g[0]!.toUpperCase() + g.slice(1)}
          </button>
        ))}
      </div>
      <div className="dx-legend">
        <span>
          <i style={{ background: 'var(--viz-made)' }} />
          {group === 'meth' ? 'Added' : group === 'weed' ? 'Pressed' : 'Made'} <b>{totalIn}</b>
        </span>
        <span>
          <i style={{ background: 'var(--viz-out)' }} />
          Out <b>0</b>
        </span>
      </div>
      <div className="dx-io">
        <div className="grid">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <div key={f} style={{ bottom: `${f * 100}%` }}>
              <span>{Math.round(max * f)}</span>
            </div>
          ))}
        </div>
        {days.map((d) => (
          <div
            key={d.key}
            className={`day ${d.today ? 'today' : ''}`}
            data-tip={`<b>${fmtDay(d.date)}${d.today ? ' (today)' : ''}</b><br><i style="background:var(--viz-made)"></i>Made <b>${d.made}</b><br><i style="background:var(--viz-out)"></i>Out <b>${d.out}</b>`}
          >
            <i className="in" style={{ height: h(d.made) }} />
            <i className="out" style={{ height: h(d.out) }} />
            <span className="x">{d.letter}</span>
          </div>
        ))}
      </div>
      <table className="dx-viz-table">
        <thead>
          <tr>
            <th>Day</th>
            <th className="r">Made</th>
            <th className="r">Out</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.key}>
              <td>{fmtDay(d.date)}</td>
              <td className="r">{d.made}</td>
              <td className="r">{d.out}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WhatsInStock() {
  const { totals, recipe } = useNarcotics();
  const [table, setTable] = useState(false);
  const rows = [
    ...STRAINS.map((st) => {
      const inv = totals.strains[st.id];
      return { id: st.id, name: st.name, onHand: inv.bricks, potential: Math.floor(inv.trimmed / BRICK_SIZE), product: false };
    }),
    ...PRODUCTS.map((p) => ({
      id: p.id,
      name: p.name,
      product: true,
      onHand: p.id === 'meth' ? totals.meth : p.id === 'cokeSmall' ? totals.cokeSmall : totals.cokeLarge,
      potential: p.id === 'meth' ? 0 : cokeCanMake(totals.coca, recipe, p.id === 'cokeSmall' ? 'small' : 'large'),
    })),
  ].sort((a, b) => b.onHand + b.potential - (a.onHand + a.potential) || a.name.localeCompare(b.name));
  const max = Math.max(1, ...rows.map((r) => r.onHand + r.potential));
  const seg = (cls: string, v: number) => (v ? <i className={cls} style={{ width: `calc(${((v / max) * 100).toFixed(2)}% * 0.82)` }} /> : null);
  return (
    <div className={`dx-glass dx-panel ${table ? 'show-table' : ''}`}>
      <div className="dx-sec">
        <h2>What&apos;s in Stock</h2>
        <button type="button" className={`dx-tbl-btn ${table ? 'on' : ''}`} onClick={() => setTable(!table)}>
          {table ? 'Chart' : 'Table'}
        </button>
      </div>
      <div className="dx-legend">
        <span>
          <i style={{ background: 'var(--viz-onhand)' }} />
          On hand
        </span>
        <span>
          <i style={{ background: 'var(--viz-made)' }} />
          Can still make
        </span>
      </div>
      <div className="dx-sbs">
        {rows.map((r) => {
          const total = r.onHand + r.potential;
          return (
            <div
              key={r.id}
              className="row"
              data-tip={`<b>${r.name}</b><br><i style="background:var(--viz-onhand)"></i>On hand <b>${r.onHand}</b>${r.id === 'meth' ? '' : `<br><i style="background:var(--viz-made)"></i>${r.product ? 'Leaves can make' : 'Ready to press'} <b>${r.potential}</b>`}`}
            >
              <div className="nm">
                <span className="lg">
                  <Logo id={r.id} />
                </span>
                <span>{r.name}</span>
              </div>
              <div className="bar">
                {seg('oh', r.onHand)}
                {seg('pt', r.potential)}
                <em className={total ? '' : 'zero'}>{total ? `${r.onHand} + ${r.potential}` : '0'}</em>
              </div>
            </div>
          );
        })}
      </div>
      <table className="dx-viz-table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="r">On hand</th>
            <th className="r">Can make</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="r">{r.onHand}</td>
              <td className="r">{r.potential}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Overview({ setTab }: { setTab: (t: NarcTab) => void }) {
  return (
    <div className="dx-layout solo">
      <div className="dx-main min-w-0">
        <div className="dx-sec">
          <h2>Stock</h2>
          <button type="button" onClick={() => setTab('weed')}>
            Open stock →
          </button>
        </div>
        <StrainCards setTab={setTab} />
        <div className="dx-sec">
          <h2>Totals &amp; Trends</h2>
        </div>
        <Stats />
        <div className="dx-charts">
          <MadeAndOut />
          <WhatsInStock />
        </div>
      </div>
    </div>
  );
}

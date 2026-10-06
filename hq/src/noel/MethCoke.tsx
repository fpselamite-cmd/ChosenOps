import { useState } from 'react';
import { useHub } from '../hooks/useHub';
import {
  COKE_HOURS,
  COKE_INGREDIENTS,
  COKE_KG,
  COKE_PURE,
  LUCAS_PAYS,
  METH_COOK_MAX_H,
  METH_SIZES,
  SUPPLIES,
  SUPPLY_LABEL,
  cokeCanMake,
  formatTime,
  methMaterials,
  minsLabel,
  n,
  rootOf,
  toCount,
  type SupplyKey,
} from './data';
import { cookMins, cookState, cookTimeLabel, runLabel, runMins, runState } from './grow';
import type { Ops } from './ops';
import { StockByLocation } from './Stock';
import { useNarcotics } from './store';
import { Beaker, CokePair, Empty, Logo, useToast } from './ui';

const money = (v: number) => `$${n(v)}`;

function useSupply() {
  const { supplies, supplyLow } = useNarcotics();
  const count = (k: SupplyKey) => toCount(supplies[k]);
  const low = (k: SupplyKey) => {
    const v = supplyLow[k];
    return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : toCount(v);
  };
  const isLow = (k: SupplyKey) => low(k) !== null && count(k) <= low(k)!;
  return { count, low, isLow };
}

/** "Supplies on hand cover it." or "Supplies short: 4 sodium, 2 water." */
function ShortText({ need }: { need: Partial<Record<SupplyKey, number>> }) {
  const { count } = useSupply();
  const short = (Object.entries(need) as [SupplyKey, number][]).filter(([k, v]) => v > count(k));
  if (!short.length) return <span className="sup-ok">Supplies on hand cover it.</span>;
  return (
    <span className="sup-short">
      Supplies short:{' '}
      {short.map(([k, v], i) => (
        <span key={k}>
          {i > 0 && ', '}
          <b>{n(v - count(k))}</b> {SUPPLY_LABEL[k].toLowerCase()}
        </span>
      ))}
      .
    </span>
  );
}

function Supplies({ group, ops }: { group: 'meth' | 'coke'; ops: Ops }) {
  const { count, low, isLow } = useSupply();
  const { can } = useHub();
  const toast = useToast();
  const items = SUPPLIES[group];
  const lows = items.filter((i) => isLow(i.key));
  const admin = can('manageOps');
  return (
    <div>
      {lows.length > 0 && (
        <div className="sup-warn">
          <i className="fa-solid fa-triangle-exclamation mr-1" />
          Running low: <b>{lows.map((i) => i.label).join(', ')}</b>
        </div>
      )}
      <div className="sup-grid">
        {items.map((i) => {
          const c = count(i.key);
          const l = low(i.key);
          const adj = (d: number) => toast.run(ops.adjustSupply(i.key, d, c, i.label));
          return (
            <div key={i.key} className={`sup ${isLow(i.key) ? 'low' : ''}`}>
              <span className="lbl">
                <i className={`fa-solid fa-${i.icon}`} />
                {i.label}
              </span>
              <span className="n dx-mono">{n(c)}</span>
              <div className="btns">
                <button type="button" onClick={() => adj(-10)} disabled={!c}>
                  −10
                </button>
                <button type="button" onClick={() => adj(-1)} disabled={!c}>
                  −
                </button>
                <button type="button" onClick={() => adj(1)}>
                  +
                </button>
                <button type="button" onClick={() => adj(10)}>
                  +10
                </button>
              </div>
              {admin ? (
                <label className="lowat">
                  Low at{' '}
                  <input
                    key={String(l)}
                    type="number"
                    min={0}
                    defaultValue={l ?? ''}
                    placeholder="off"
                    className="dx-input dx-mono"
                    onBlur={(e) => {
                      const v = e.target.value.trim() === '' ? null : toCount(e.target.value);
                      if (v !== l) ops.setSupplyLow(i.key, v);
                    }}
                  />
                </label>
              ) : (
                l !== null && <span className="lowat">low at {l}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function Cell({ num, label, icon }: { num: string | number; label: string; icon: string }) {
  return (
    <div>
      <span className="n">{num}</span>
      <span className="l">
        <i className={`fa-solid fa-${icon}`} />
        {label}
      </span>
    </div>
  );
}

function Stepper({ value, setValue, max }: { value: number; setValue: (v: number) => void; max: number }) {
  return (
    <>
      <button type="button" className="dx-step px-3" onClick={() => setValue(Math.max(1, value - 1))} aria-label="Less">
        <i className="fa-solid fa-minus" />
      </button>
      <input type="number" min={1} max={max} value={value} className="dx-input dx-mono" aria-label="How many" onChange={(e) => setValue(Math.max(0, Math.min(max, toCount(e.target.value))))} />
      <button type="button" className="dx-step px-3" onClick={() => setValue(Math.min(max, value + 1))} aria-label="More">
        <i className="fa-solid fa-plus" />
      </button>
    </>
  );
}

function Where({ field }: { field: 'meth' | 'coke' }) {
  const { storage, stock, locLabel } = useNarcotics();
  return (
    <div className="mx-where">
      {storage
        .filter((l) => !l.excludeTotals)
        .map((l) => {
          const s = stock.get(l.id);
          const v =
            field === 'meth'
              ? rootOf(s, 'meth')
                ? String(rootOf(s, 'meth'))
                : ''
              : [rootOf(s, 'cokeSmall') ? `${rootOf(s, 'cokeSmall')} S` : '', rootOf(s, 'cokeLarge') ? `${rootOf(s, 'cokeLarge')} L` : ''].filter(Boolean).join(' · ');
          return v ? (
            <span key={l.id}>
              {locLabel(l.id)} <b>{v}</b>
            </span>
          ) : null;
        })}
    </div>
  );
}

// ---------- Meth ----------

function BinIt({ ops }: { ops: Ops }) {
  const { storage, locLabel } = useNarcotics();
  const toast = useToast();
  const [count, setCount] = useState(1);
  const [to, setTo] = useState(storage[0]?.id ?? '');
  if (!storage.length) return null;
  return (
    <div className="mx-binit">
      <span>
        <i className="fa-solid fa-box mr-1 text-cyan-300" />
        Bins made:
      </span>
      <input type="number" min={1} max={50} value={count} onChange={(e) => setCount(Math.max(1, Math.min(50, toCount(e.target.value))))} className="dx-input dx-mono" aria-label="Bins made" />
      <span>into</span>
      <select className="dx-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Which stash">
        {storage.map((l) => (
          <option key={l.id} value={l.id}>
            {locLabel(l.id)}
          </option>
        ))}
      </select>
      <button type="button" className="dx-btn dx-btn-g" style={{ width: 'auto', padding: '7px 12px' }} onClick={() => toast.run(ops.addBins(to, count, locLabel(to)))}>
        <i className="fa-solid fa-plus mr-1" />
        Add to stash
      </button>
    </div>
  );
}

function lastCookTime() {
  try {
    const t = JSON.parse(localStorage.getItem('hq_cook_time') ?? 'null');
    if (t && Number.isFinite(t.h) && Number.isFinite(t.m)) return t as { h: number; m: number };
  } catch {
    /* optional */
  }
  return { h: METH_COOK_MAX_H, m: 0 };
}

function CookAdd({ ops }: { ops: Ops }) {
  const { supplies } = useNarcotics();
  const toast = useToast();
  const [size, setSize] = useState(5);
  const [count, setCount] = useState(1);
  const [h, setH] = useState(lastCookTime().h);
  const [m, setM] = useState(lastCookTime().m);
  return (
    <div className="mx-add">
      <select className="dx-input" value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Yield">
        <option value={5}>High yield (5)</option>
        <option value={3}>Medium yield (3)</option>
        <option value={1}>Low yield (1)</option>
      </select>
      <select className="dx-input" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="How many">
        {[1, 2, 3, 4].map((x) => (
          <option key={x} value={x}>
            ×{x}
          </option>
        ))}
      </select>
      <span className="mx-time" title="How long it takes (what the game shows)">
        <input type="number" min={0} max={168} value={h} onChange={(e) => setH(Math.min(168, toCount(e.target.value)))} className="dx-input dx-mono" aria-label="Hours" />h
        <input type="number" min={0} max={59} value={m} onChange={(e) => setM(Math.min(59, toCount(e.target.value)))} className="dx-input dx-mono" aria-label="Minutes" />m
      </span>
      <button
        type="button"
        className="dx-btn dx-btn-g"
        style={{ width: 'auto', padding: '8px 14px' }}
        onClick={() => {
          const mins = h * 60 + m;
          if (!mins) return toast.alert('Enter how long the cook takes.', 'warning');
          try {
            localStorage.setItem('hq_cook_time', JSON.stringify({ h, m }));
          } catch {
            /* optional */
          }
          toast.run(ops.addCooks(size, count, mins, supplies));
        }}
      >
        <i className="fa-solid fa-plus mr-1" />
        Put down
      </button>
    </div>
  );
}

function CookCards({ ops }: { ops: Ops }) {
  const { cooks, now } = useNarcotics();
  const toast = useToast();
  const [editing, setEditing] = useState<string | null>(null);
  const [eh, setEh] = useState(0);
  const [em, setEm] = useState(0);
  if (!cooks.length)
    return (
      <div className="mx-cook-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <Empty title="Nothing cooking" text="Put a yield down at the lab, then add it here so the crew can see when it's ready." />
        </div>
      </div>
    );
  return (
    <div className="mx-cook-grid">
      {cooks.map((c) => {
        const st = cookState(c, now);
        return (
          <div key={c.id} className={`dx-glass dx-tc mx-tc ${st.cls} ${editing === c.id ? 'editing' : ''}`}>
            <div className="top">
              <div className="min-w-0">
                <h2>{METH_SIZES[c.size]} yield</h2>
                <div className="alias">
                  {c.size} bag{c.size === 1 ? '' : 's'} · <b>{c.by}</b> · {minsLabel(cookMins(c))} cook
                </div>
              </div>
              <span className={`mx-pill ${st.cls}`}>{st.text}</span>
            </div>
            <div className="mid">
              <div className="bk-box">
                <Beaker level={st.pct} ready={st.ready} />
              </div>
              <div className="clock">
                {st.ready ? (
                  <>
                    <div className="t">Ready!</div>
                    <div className="s">Go collect the trays</div>
                  </>
                ) : (
                  <>
                    <div className="t">{formatTime(st.left)}</div>
                    <div className="s">{st.cls === 'maybe' ? 'might be ready now' : 'until ready'}</div>
                  </>
                )}
              </div>
            </div>
            {!st.ready && (
              <div className="track">
                <div className="fill" style={{ width: `${(st.pct * 100).toFixed(2)}%` }} />
                <span className="m18" title="Might be ready from here (75% of the time)" />
              </div>
            )}
            <div className="eta">
              <span>Down {cookTimeLabel(st.start)}</span>
              <span>Ready {cookTimeLabel(st.readyAt)}</span>
            </div>
            <div className="mx-edit">
              <span>Time left</span>
              <input type="number" min={0} max={168} className="dx-input dx-mono" value={eh} onChange={(e) => setEh(toCount(e.target.value))} aria-label="Hours left" />h
              <input type="number" min={0} max={59} className="dx-input dx-mono" value={em} onChange={(e) => setEm(toCount(e.target.value))} aria-label="Minutes left" />m
              <button
                type="button"
                className="dx-btn dx-btn-g"
                onClick={async () => {
                  await toast.run(ops.editCookTime(c, eh * 60 + em));
                  setEditing(null);
                }}
              >
                Save
              </button>
            </div>
            <div className="acts">
              <button type="button" className={`dx-btn ${st.ready ? 'dx-btn-g' : 'dx-btn-o'}`} onClick={() => toast.run(ops.collectCook(c))} title="Collected or gone: take it off the timers">
                <i className="fa-solid fa-check mr-1" />
                Collected
              </button>
              <button
                type="button"
                className="dx-btn dx-stop mx-edit-btn"
                title="Change the time left"
                onClick={() => {
                  setEditing(editing === c.id ? null : c.id);
                  setEh(Math.floor(st.left / 3600));
                  setEm(Math.floor((st.left % 3600) / 60));
                }}
              >
                <i className="fa-solid fa-pen mr-1" />
                Edit
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Meth({ ops }: { ops: Ops }) {
  const { totals } = useNarcotics();
  const [unit, setUnit] = useState<'bins' | 'bags'>('bins');
  const [count, setCount] = useState(1);
  const m = methMaterials(unit === 'bins' ? count * 10 : count);
  const y = m.yields;
  const parts = (
    [
      [y.high, 'high'],
      [y.medium, 'medium'],
      [y.low, 'low'],
    ] as const
  ).filter(([c]) => c);
  const makes = unit === 'bins' ? `${m.bags} bags` : m.bags >= 10 ? `${Math.floor(m.bins)} bin${Math.floor(m.bins) === 1 ? '' : 's'}${m.bags % 10 ? ` + ${m.bags % 10} bags` : ''}` : `${m.bags} bag${m.bags === 1 ? '' : 's'}`;
  return (
    <div className="space-y-5">
      <div className="mx-grid mx-top">
        <div className="dx-glass mx-card mx-stock">
          <h2>
            <i className="fa-solid fa-box" />
            In the stash
          </h2>
          <div className="logo">
            <Logo id="meth" />
          </div>
          <div className="big">{n(totals.meth)}</div>
          <div className="mx-sub">{totals.meth === 1 ? 'meth bin' : 'meth bins'}</div>
          <Where field="meth" />
          <BinIt ops={ops} />
        </div>
        <div className="dx-glass mx-card">
          <h2>
            <i className="fa-solid fa-calculator" />
            What to grab
          </h2>
          <p className="mx-sub">
            Everything is at the <b>Blue Container, 9359</b>. Pick how much you want to make.
          </p>
          <div className="mx-calc-in">
            <Stepper value={count} setValue={setCount} max={99} />
            <div className="dx-seg">
              <button type="button" className={unit === 'bins' ? 'on' : ''} onClick={() => setUnit('bins')}>
                Bins
              </button>
              <button type="button" className={unit === 'bags' ? 'on' : ''} onClick={() => setUnit('bags')}>
                Bags
              </button>
            </div>
          </div>
          <div className="mx-out">
            <Cell num={m.sodium} label="Sodium" icon="droplet" />
            <Cell num={m.ammonia} label="Ammonia" icon="flask" />
            <Cell num={m.hammers} label="Hammers" icon="hammer" />
            <Cell num={m.soda} label="Baking soda" icon="cube" />
            <Cell num={m.water} label="Water" icon="bottle-water" />
            <Cell num={m.plastic} label="Plastic bags" icon="bag-shopping" />
          </div>
          <p className="mx-plan">
            {m.bags ? (
              <>
                Put down{' '}
                {parts.map(([c, s], i) => (
                  <span key={s}>
                    {i > 0 && ' + '}
                    <b>{c}</b> {s} yield{c === 1 ? '' : 's'}
                  </span>
                ))}{' '}
                ({makes}). Hammers come back after each smash, so 5 is plenty.{' '}
                <ShortText need={{ sodium: m.sodium, ammonia: m.ammonia, soda: m.soda, water: m.water, bags: m.plastic, hammers: m.hammers }} />
              </>
            ) : (
              'Pick how many to make.'
            )}
          </p>
        </div>
      </div>

      <div className="dx-glass mx-card">
        <h2>
          <i className="fa-solid fa-boxes-stacked" />
          Lab supplies
        </h2>
        <p className="mx-sub">At the Blue Container, 9359. Putting a cook down takes its sodium and ammonia from here.</p>
        <Supplies group="meth" ops={ops} />
      </div>

      <div className="dx-glass mx-card">
        <h2>
          <i className="fa-solid fa-fire-burner" />
          Cooks down
        </h2>
        <p className="mx-sub">
          Put a yield down? Add it here with the time it takes (usually <b>18 to 24 hours</b>) so the crew knows when it&apos;s ready.
        </p>
        <CookAdd ops={ops} />
        <CookCards ops={ops} />
      </div>

      <div>
        <div className="dx-sec">
          <h2>Meth bins by location</h2>
        </div>
        <StockByLocation kind="meth" ops={ops} />
      </div>

      <div>
        <div className="dx-sec">
          <h2>How it&apos;s made</h2>
        </div>
        <div className="mx-steps">
          <div className="dx-glass mx-step">
            <div className="num">1</div>
            <h3>Put it down</h3>
            <p>
              Put down <b>Sodium + Ammonia</b> at the first station. Low yield is 1 of each, medium is 3, high is <b>5</b>. Always go high when you can. Wait <b>18 to 24 hours</b>.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">2</div>
            <h3>Collect the trays</h3>
            <p>
              Come back to the <b>same station</b> and collect <b>1 to 5 trays</b> of meth.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">3</div>
            <h3>Smash</h3>
            <p>
              Second station, <b>other side of the shelves</b>. Use 1 to 5 hammers. About <b>1 minute</b> later you get the hammer back and a tray of smashed meth.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">4</div>
            <h3>Mix at the Laboratory</h3>
            <p>
              The <b>large cooker at the front</b>. Each time, exactly:
            </p>
            <div className="mx-133">
              <span>
                <b>1</b>tray
              </span>
              <span>
                <b>3</b>water
              </span>
              <span>
                <b>3</b>baking soda
              </span>
            </div>
            <p>
              Gives <b>3 refined meth</b>. Not more, not less.
            </p>
            <p className="mx-joke">*cough cough* Jay</p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">5</div>
            <h3>Bag &amp; bin</h3>
            <p>
              Back-left corner station. <b>3 refined + 1 plastic bag = 1 bag</b> (1kg), up to 10 at a time. <b>10 bags = 1 bin</b>. Can&apos;t make a bin yet? Leave the bags in the{' '}
              <b>last weapon box at 9359</b>.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="dx-sec">
          <h2>Rules in the lab</h2>
        </div>
        <div className="mx-rules">
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-user-group" />
            <b>Never cook alone</b>
            <p>Bring at least one other person, inside or outside. Don&apos;t both cook at the same time.</p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-link" />
            <b>Wear your chain</b>
            <p>Your Chosen chain stays visible the whole time you&apos;re in the lab.</p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-gun" />
            <b>Carry a gun</b>
            <p>Doesn&apos;t have to be a long gun. Meth is not a safe space.</p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-scale-balanced" />
            <b>Pick your battles</b>
            <p>Someone solo walks in? Ask them to wait. A group with long guns? Leave and tell High Table.</p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-walkie-talkie" />
            <b>Radio callsign</b>
            <p>
              Set it to <b>Meth</b> in white on associate radio, or <b>Sodium</b> when collecting sodium.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="dx-sec">
          <h2>Places</h2>
        </div>
        <div className="mx-rules">
          <div className="dx-glass mx-card mx-place">
            <h2>
              <i className="fa-solid fa-flask-vial" />
              The Lab
            </h2>
            <div className="postal">10102</div>
            <p className="mx-sub" style={{ margin: '4px 0 0' }}>
              Near LS Trucking Logistics. Go in through the shell door.
            </p>
          </div>
          <div className="dx-glass mx-card mx-place">
            <h2>
              <i className="fa-solid fa-box-archive" />
              Blue Container
            </h2>
            <div className="postal">9359</div>
            <p className="mx-sub" style={{ margin: '4px 0 0' }}>
              Behind the buildings. Supplies and finished bins. Containers in order:
            </p>
            <ol className="mx-order">
              {['Sodium', 'Empty containers', 'Ammonia', 'Baking soda & plastic bags', 'Water', 'Hammers', 'Finished bags & bins'].map((x, i) => (
                <li key={x}>
                  <b>{i + 1}</b>
                  {x}
                </li>
              ))}
            </ol>
          </div>
          <div className="dx-glass mx-card mx-place">
            <h2>
              <i className="fa-solid fa-droplet" />
              Sodium
            </h2>
            <div className="postal">10101</div>
            <p className="mx-sub" style={{ margin: '4px 0 0' }}>
              Fill the plastic containers with sodium and get paid for it. Ask a Chosen member to show you the spot.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-rules">
        <div className="dx-glass mx-rule">
          <i className="fa-solid fa-warehouse" />
          <b>Where bins go</b>
          <p>
            Finished bins go to the <b>Blue Container at 9359</b> first. If Tempest&apos;s basement is low, move <b>3 or 4 bins at most</b> at a time. Keep as little as possible in the basement in case of
            raids.
          </p>
        </div>
        <div className="dx-glass mx-rule">
          <i className="fa-solid fa-calendar-check" />
          <b>The easy routine</b>
          <p>
            Put down <b>4 high yields every 4 days</b>. That&apos;s 20 bags, so <b>2 bins</b>. Twice a week, about an hour at the lab.
          </p>
        </div>
      </div>

      <p className="mx-credit">From the Meth Guide by Karma Karuso of The Chosen, accurate as of 9/27/2026.</p>
    </div>
  );
}

// ---------- Coke ----------

function RunAdd({ ops }: { ops: Ops }) {
  const toast = useToast();
  const [size, setSize] = useState<'small' | 'large'>('small');
  const [count, setCount] = useState(1);
  const [crew, setCrew] = useState('');
  const [touched, setTouched] = useState(false);
  const [h, setH] = useState(2);
  const [m, setM] = useState(0);
  const def = (s: 'small' | 'large', c: number) => {
    if (!touched) {
      setH(COKE_HOURS[s] * c);
      setM(0);
    }
  };
  return (
    <form
      className="mx-add"
      onSubmit={async (e) => {
        e.preventDefault();
        const mins = h * 60 + m;
        if (!mins) return toast.alert('Enter how long the run takes.', 'warning');
        await toast.run(ops.startRun(size, count, crew.trim().replace(/\s+/g, ' ').slice(0, 60), mins));
        setCrew('');
        setTouched(false);
      }}
    >
      <select
        className="dx-input"
        value={size}
        aria-label="Brick size"
        onChange={(e) => {
          const s = e.target.value as 'small' | 'large';
          setSize(s);
          def(s, count);
        }}
      >
        <option value="small">Small bricks</option>
        <option value="large">Large bricks</option>
      </select>
      <select
        className="dx-input"
        value={count}
        aria-label="How many"
        onChange={(e) => {
          setCount(Number(e.target.value));
          def(size, Number(e.target.value));
        }}
      >
        {[1, 2, 3, 4].map((x) => (
          <option key={x} value={x}>
            ×{x}
          </option>
        ))}
      </select>
      <input maxLength={60} placeholder="Who's on it" className="dx-input" aria-label="Who's on it" value={crew} onChange={(e) => setCrew(e.target.value)} />
      <span className="mx-time" title="How long the run takes">
        <input
          type="number"
          min={0}
          max={168}
          value={h}
          className="dx-input dx-mono"
          aria-label="Hours"
          onChange={(e) => {
            setTouched(true);
            setH(Math.min(168, toCount(e.target.value)));
          }}
        />
        h
        <input
          type="number"
          min={0}
          max={59}
          value={m}
          className="dx-input dx-mono"
          aria-label="Minutes"
          onChange={(e) => {
            setTouched(true);
            setM(Math.min(59, toCount(e.target.value)));
          }}
        />
        m
      </span>
      <button type="submit" className="dx-btn dx-btn-g" style={{ width: 'auto', padding: '8px 14px' }}>
        <i className="fa-solid fa-play mr-1" />
        Start run
      </button>
    </form>
  );
}

function RunCards({ ops }: { ops: Ops }) {
  const { runs, now, storage, locLabel } = useNarcotics();
  const toast = useToast();
  const [dest, setDest] = useState<Record<string, string>>({});
  if (!runs.length)
    return (
      <div className="mx-cook-grid">
        <div style={{ gridColumn: '1/-1' }}>
          <Empty title="No coke runs going" text="Heading out to make bricks? Start a run so the crew knows when they'll be done." />
        </div>
      </div>
    );
  return (
    <div className="mx-cook-grid">
      {runs.map((r) => {
        const st = runState(r, now);
        const to = dest[r.id] ?? storage[0]?.id ?? '';
        return (
          <div key={r.id} className={`dx-glass dx-tc mx-tc ck-tc ${st.cls}`}>
            <div className="top">
              <div className="min-w-0">
                <h2>{runLabel(r)}</h2>
                <div className="alias">
                  {r.crew} · {minsLabel(runMins(r))} run
                </div>
              </div>
              <span className={`mx-pill ${st.cls}`}>{st.text}</span>
            </div>
            <div className="mid">
              <div className="bk-box ck-box">
                <i className="fa-solid fa-snowflake" />
              </div>
              <div className="clock">
                {st.ready ? (
                  <>
                    <div className="t">Done!</div>
                    <div className="s">Press the bricks</div>
                  </>
                ) : (
                  <>
                    <div className="t">{formatTime(st.left)}</div>
                    <div className="s">until done</div>
                  </>
                )}
              </div>
            </div>
            {!st.ready && (
              <div className="track">
                <div className="fill" style={{ width: `${(st.pct * 100).toFixed(2)}%` }} />
              </div>
            )}
            <div className="eta">
              <span>Started {cookTimeLabel(st.start)}</span>
              <span>Done {cookTimeLabel(st.readyAt)}</span>
            </div>
            <div className="acts">
              {st.ready && storage.length > 0 && (
                <>
                  <select className="dx-input rn-to" aria-label="Which stash" value={to} onChange={(e) => setDest({ ...dest, [r.id]: e.target.value })}>
                    {storage.map((l) => (
                      <option key={l.id} value={l.id}>
                        {locLabel(l.id)}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="dx-btn dx-btn-g" onClick={() => toast.run(ops.finishRun(r, to, locLabel(to)))}>
                    <i className="fa-solid fa-box mr-1" />
                    Bricks in
                  </button>
                </>
              )}
              <button
                type="button"
                className="dx-btn dx-stop"
                title={st.ready ? 'Done without adding bricks' : 'Cancel this run'}
                onClick={() => confirm(`Remove the run (${runLabel(r)})?`) && toast.run(ops.cancelRun(r))}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Coke({ ops }: { ops: Ops }) {
  const { totals, recipe } = useNarcotics();
  const [size, setSize] = useState<'small' | 'large'>('small');
  const [count, setCount] = useState(1);
  const r = recipe[size];
  const need = Object.fromEntries(COKE_INGREDIENTS.map((i) => [i.key, toCount(r[i.key]) * count])) as Record<(typeof COKE_INGREDIENTS)[number]['key'], number>;
  const supplyCost = need.acid * LUCAS_PAYS.acid + need.oil * LUCAS_PAYS.oil + need.cement * LUCAS_PAYS.cement;
  const have = totals.coca;
  return (
    <div className="ck-page space-y-5">
      <div className="mx-grid mx-top">
        <div className="dx-glass mx-card mx-stock">
          <h2>
            <i className="fa-solid fa-box" />
            In the stash
          </h2>
          <div className="logo ck-logo">
            <CokePair />
          </div>
          <div className="ck-nums">
            <div>
              <span className="big">{n(totals.cokeSmall)}</span>
              <span className="mx-sub">small</span>
            </div>
            <div>
              <span className="big">{n(totals.cokeLarge)}</span>
              <span className="mx-sub">large</span>
            </div>
          </div>
          <div className="mx-sub">
            <b>{n(totals.coca)}</b> coca leaves · enough for {cokeCanMake(totals.coca, recipe, 'small')} small or {cokeCanMake(totals.coca, recipe, 'large')} large
          </div>
          <Where field="coke" />
        </div>
        <div className="dx-glass mx-card">
          <h2>
            <i className="fa-solid fa-calculator" />
            What to bring
          </h2>
          <p className="mx-sub">Pick how many bricks. A large brick takes double everything.</p>
          <div className="mx-calc-in">
            <Stepper value={count} setValue={setCount} max={50} />
            <div className="dx-seg">
              <button type="button" className={size === 'small' ? 'on' : ''} onClick={() => setSize('small')}>
                Small
              </button>
              <button type="button" className={size === 'large' ? 'on' : ''} onClick={() => setSize('large')}>
                Large
              </button>
            </div>
          </div>
          <div className="mx-out">
            {COKE_INGREDIENTS.map((i) => (
              <Cell key={i.key} num={n(need[i.key])} label={i.label} icon={i.icon} />
            ))}
            <Cell num={`${n(COKE_KG[size] * count)}kg`} label="Weight to carry" icon="weight-hanging" />
            <Cell num={`${COKE_HOURS[size] * count}h`} label="Rough time" icon="clock" />
          </div>
          <p className="mx-plan">
            {count ? (
              <>
                That&apos;s <b>{Math.ceil(need.coca / 200)}</b> batches of 200 leaves → <b>{n(COKE_PURE[size] * count)}</b> pure cocaine. Supplies are worth <b>{money(supplyCost)}</b> at Lucas&apos;s
                prices.{' '}
                {have >= need.coca ? (
                  <>
                    The stash has enough leaves (<b>{n(have)}</b>).
                  </>
                ) : (
                  <>
                    The stash has <b>{n(have)}</b> leaves, <b>{n(need.coca - have)}</b> short.
                  </>
                )}{' '}
                <ShortText need={{ oil: need.oil, cement: need.cement, acid: need.acid }} />
              </>
            ) : (
              'Pick how many bricks.'
            )}
          </p>
        </div>
      </div>

      <div className="dx-glass mx-card">
        <h2>
          <i className="fa-solid fa-boxes-stacked" />
          Warehouse supplies
        </h2>
        <p className="mx-sub">Oil, cement and battery acid on hand for the next bricks.</p>
        <Supplies group="coke" ops={ops} />
      </div>

      <div className="dx-glass mx-card">
        <h2>
          <i className="fa-solid fa-ship" />
          Coke runs
        </h2>
        <p className="mx-sub">
          Heading out to make bricks? Start a run so the crew knows when they&apos;ll be done. About <b>2 hours</b> a small brick, <b>4</b> a large.
        </p>
        <RunAdd ops={ops} />
        <RunCards ops={ops} />
      </div>

      <div>
        <div className="dx-sec">
          <h2>Coke by location</h2>
        </div>
        <StockByLocation kind="coke" ops={ops} />
      </div>

      <div>
        <div className="dx-sec">
          <h2>How it&apos;s made</h2>
          <span className="dx-muted text-xs">per batch of 200 leaves</span>
        </div>
        <div className="mx-steps">
          <div className="dx-glass mx-step">
            <div className="num">1</div>
            <h3>Cut it</h3>
            <p>
              Put <b>200 coca leaves + 4 cement</b> into the bin / box.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">2</div>
            <h3>Walk it off</h3>
            <p>
              Walk around until you get <b>50 cut cocaine</b>. Takes <b>5 to 10 minutes</b>.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">3</div>
            <h3>Make paste</h3>
            <p>
              <b>50 cut cocaine + 1 barrel of oil</b> into the blue barrels gives <b>5 coca paste</b>. About <b>10 minutes</b>.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">4</div>
            <h3>Cook it pure</h3>
            <div className="mx-133">
              <span>
                <b>2</b>paste
              </span>
              <span>
                <b>1</b>acid
              </span>
              <span>
                <b>1</b>pure
              </span>
            </div>
            <p>
              Per pot, <b>2 pots</b> at a time. About <b>5 minutes</b> a cook.
            </p>
          </div>
          <div className="dx-glass mx-step">
            <div className="num">5</div>
            <h3>Press the brick</h3>
            <p>
              Use the <b>coke table at the warehouse</b>. <b>25 pure = 1 small brick</b>, <b>50 pure = 1 large</b>.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="dx-sec">
          <h2>Rules &amp; info</h2>
        </div>
        <div className="mx-rules">
          <div className="dx-glass mx-rule ck-red">
            <i className="fa-solid fa-skull-crossbones" />
            <b>Coke Island is a RED ZONE</b>
            <p>Shoot on sight, no interaction. Go armed and go together.</p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-scale-balanced" />
            <b>The split</b>
            <p>
              <b>30%</b> to the family, <b>70%</b> split between the people who made the brick(s).
            </p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-leaf" />
            <b>Leaves once a week</b>
            <p>The coca leaves are harvested once per week.</p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-truck-ramp-box" />
            <b>Where supplies come from</b>
            <p>
              Cement from <b>Construction</b>, oil barrels from <b>Oil Rigging</b>, battery acid from <b>chopping cars</b> for the batteries.
            </p>
          </div>
          <div className="dx-glass mx-rule">
            <i className="fa-solid fa-hand-holding-dollar" />
            <b>Lucas pays for supplies</b>
            <p>
              <b>$2k</b> per battery, <b>$1k</b> per oil barrel, <b>$750</b> per cement.
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="dx-sec">
          <h2>Places</h2>
        </div>
        <div className="mx-rules">
          <div className="dx-glass mx-card mx-place">
            <h2>
              <i className="fa-solid fa-warehouse" />
              Coke Warehouse
            </h2>
            <div className="postal">10060</div>
            <p className="mx-sub" style={{ margin: '4px 0 0' }}>
              Has a boat garage: pretty much the closest dock to the island, so use it if you can.
            </p>
          </div>
          <div className="dx-glass mx-card mx-place">
            <h2>
              <i className="fa-solid fa-water" />
              Coke Island
            </h2>
            <div className="postal ck-red-text">East coast</div>
            <p className="mx-sub" style={{ margin: '4px 0 0' }}>
              Directly east of the Ron Alternates Wind Farm. Red zone.
            </p>
          </div>
          <div className="dx-glass mx-card mx-place">
            <h2>
              <i className="fa-solid fa-gas-pump" />
              Refuel
            </h2>
            <div className="postal" style={{ fontSize: 22 }}>
              Vespucci Canals
            </div>
            <p className="mx-sub" style={{ margin: '4px 0 0' }}>
              Refuel the boats at the Vespucci Canals dock.
            </p>
          </div>
        </div>
      </div>

      <div className="mx-rules">
        <div className="dx-glass mx-rule">
          <i className="fa-solid fa-ship" />
          <b>Save time next trip</b>
          <p>
            <b>Pre-load your boats</b> for the next trip before you head out.
          </p>
        </div>
        <div className="dx-glass mx-rule">
          <i className="fa-solid fa-calculator" />
          <b>Materials calculator</b>
          <p>The one above uses the gang&apos;s recipe from the Stash page settings. There&apos;s also one in Discord / Emails.</p>
        </div>
      </div>

      <p className="mx-credit">From The Chosen&apos;s Cocaine Creation Guide.</p>
    </div>
  );
}

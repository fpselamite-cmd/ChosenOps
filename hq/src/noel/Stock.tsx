import { useState, type ReactNode } from 'react';
import { useHub } from '../hooks/useHub';
import {
  BRICK_SIZE,
  BUD_FIELDS,
  MAIN_STASH,
  STRAINS,
  STRAIN_BY_ID,
  budCell,
  cokeBringText,
  cokeCanMake,
  cokeLeavesFor,
  cokeRecipeText,
  n,
  rootOf,
  toCount,
  type BudField,
  type OpsLocation,
  type RootField,
  type StrainId,
} from './data';
import { allocState } from './grow';
import type { Ops } from './ops';
import { useNarcotics } from './store';
import type { NarcTab } from './TimerBar';
import { CokePair, Empty, Logo, NoelModal, celebrate, centerOf, useToast } from './ui';

export type StockKind = 'weed' | 'coke' | 'meth';

/** A small chip in the crew's color, for places a crew runs. */
export function CrewTag({ crewId }: { crewId: string | null | undefined }) {
  const { crewById } = useHub();
  const c = crewId ? crewById.get(crewId) : undefined;
  if (!c) return null;
  return (
    <span className="ml-1 rounded px-1 py-px font-mono text-[9px] font-bold text-black" style={{ background: c.color }} title={`Run by ${c.name}`}>
      {c.tag}
    </span>
  );
}

/** A number box that saves when you leave it or press Enter. */
function NumInput({ value, onCommit, className = 'dx-input', label }: { value: number; onCommit: (v: number) => void; className?: string; label: string }) {
  return (
    <input
      key={value}
      type="number"
      min={0}
      className={className}
      aria-label={label}
      defaultValue={value}
      onBlur={(e) => toCount(e.target.value) !== value && onCommit(toCount(e.target.value))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

/** Stash houses and grows as two rows of tabs, like NoelOps' Stash page. */
export function LocationTabs({
  view,
  setView,
  kind,
  showGrows,
}: {
  view: string;
  setView: (v: string) => void;
  kind: StockKind;
  showGrows: boolean;
}) {
  const { locations, storage, visible, totalsFor, totals } = useNarcotics();
  const count = (id: string | 'all') => {
    const t = id === 'all' ? totals : totalsFor([id]);
    return kind === 'weed' ? t.bricks : kind === 'meth' ? t.meth : t.cokeSmall + t.cokeLarge;
  };
  const houses = storage.filter((l) => l.kind === 'stash' && visible(l));
  const grows = locations.filter((l) => l.kind === 'grow' && visible(l) && (showGrows || storage.includes(l)));
  const tab = (l: OpsLocation) => {
    const grow = l.kind === 'grow';
    const a = grow ? allocState(l) : null;
    return (
      <button key={l.id} type="button" className={`dx-tab ${grow ? 'inv-grow' : 'inv-house'} ${view === l.id ? 'on' : ''}`} onClick={() => setView(l.id)}>
        <i className={`fa-solid ${grow ? 'fa-cannabis' : l.id === MAIN_STASH ? 'fa-vault' : 'fa-warehouse'}`} />
        <span className={grow ? 'font-mono' : ''}>{grow ? l.postal : l.name}</span>
        {grow && l.name && <span className="sub">{l.name}</span>}
        <CrewTag crewId={l.crewId} />
        {l.excludeTotals && <i className="fa-solid fa-eye-slash text-slate-500" title="Left out of totals" />}
        {grow && l.storage && <i className="fa-solid fa-warehouse inv-onsite" title="Keeps stock on site" />}
        {(!grow || l.storage) && <span className="count">{n(count(l.id))}</span>}
        {grow && kind === 'weed' && a && (
          <span className={`alloc ${a.cls}`} title="Pots planned">
            {a.planned}/{a.total}
          </span>
        )}
      </button>
    );
  };
  return (
    <div className="inv-rows mb-5">
      <div className="inv-row houses">
        <div className="inv-row-lbl">
          <i className="fa-solid fa-warehouse" />
          Stash houses<span>where stock is kept</span>
        </div>
        <div className="dx-tabs">
          <button type="button" className={`dx-tab inv-house ${view === 'all' ? 'on' : ''}`} onClick={() => setView('all')}>
            <i className="fa-solid fa-layer-group" />
            All <span className="count">{n(count('all'))}</span>
          </button>
          {houses.map(tab)}
        </div>
      </div>
      {grows.length > 0 && (
        <div className="inv-row grows">
          <div className="inv-row-lbl">
            <i className="fa-solid fa-cannabis" />
            Grows<span>{kind === 'weed' ? 'pot plans, and stock if kept on site' : 'stock kept on site'}</span>
          </div>
          <div className="dx-tabs">{grows.map(tab)}</div>
        </div>
      )}
    </div>
  );
}

// ---------- Move stock ----------

export function MoveModal({
  from,
  item,
  ops,
  onClose,
}: {
  from: OpsLocation;
  item: StrainId | 'coke' | 'meth';
  ops: Ops;
  onClose: () => void;
}) {
  const { stock, storage, locLabel } = useNarcotics();
  const toast = useToast();
  const s = stock.get(from.id);
  const fields: { key: string; label: string; strain?: StrainId; field: BudField | RootField; have: number }[] =
    item === 'coke'
      ? [
          { key: 'cokeSmall', label: 'Small coke bricks', field: 'cokeSmall', have: rootOf(s, 'cokeSmall') },
          { key: 'cokeLarge', label: 'Large coke bricks', field: 'cokeLarge', have: rootOf(s, 'cokeLarge') },
          { key: 'coca', label: 'Coca leaves', field: 'coca', have: rootOf(s, 'coca') },
        ]
      : item === 'meth'
        ? [{ key: 'meth', label: 'Meth bins', field: 'meth', have: rootOf(s, 'meth') }]
        : BUD_FIELDS.map((f) => ({ key: f, label: f === 'bricks' ? 'Bricks' : `${f[0]!.toUpperCase()}${f.slice(1)} bud`, strain: item, field: f, have: budCell(s, item)[f] })).reverse();
  const [key, setKey] = useState(fields.find((f) => f.have)?.key ?? fields[0]!.key);
  const f = fields.find((x) => x.key === key)!;
  const [amount, setAmount] = useState(String(f.have || ''));
  const dests = storage.filter((l) => l.id !== from.id);
  const [to, setTo] = useState(dests[0]?.id ?? '');
  const [error, setError] = useState('');
  const title = item === 'coke' ? 'Coke' : item === 'meth' ? 'Meth bins' : STRAIN_BY_ID[item].name;
  return (
    <NoelModal
      wide
      onClose={onClose}
      onSubmit={async () => {
        const a = toCount(amount);
        if (!a || a > f.have) return setError(`Enter 1 to ${n(f.have)}.`);
        if (!to) return setError('Pick where it goes.');
        onClose();
        await toast.run(ops.move(from.id, to, [{ strain: f.strain, field: f.field, amount: a }], locLabel(from.id), locLabel(to)));
      }}
    >
      <h2 className="text-center text-xl font-black text-white">Move Stock</h2>
      <p className="text-center text-sm text-slate-300">
        {title} from <b>{locLabel(from.id)}</b>
      </p>
      {fields.length > 1 && (
        <label className="block text-xs font-semibold text-slate-300">
          What to move
          <select
            className="dx-input mt-1 w-full"
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setAmount(String(fields.find((x) => x.key === e.target.value)!.have || ''));
            }}
          >
            {fields.map((x) => (
              <option key={x.key} value={x.key}>
                {x.label} ({n(x.have)})
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block text-xs font-semibold text-slate-300">
        Amount <span className="font-normal text-slate-500">({n(f.have)} here)</span>
        <input type="number" min={1} className="dx-input mt-1 w-full font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label className="block text-xs font-semibold text-slate-300">
        Move to
        <select className="dx-input mt-1 w-full" value={to} onChange={(e) => setTo(e.target.value)}>
          {dests.map((l) => (
            <option key={l.id} value={l.id}>
              {locLabel(l.id)}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="text-center text-xs font-semibold text-red-400">{error}</p>}
      <button type="submit" className="dx-btn dx-btn-g" style={{ padding: '11px 14px', fontSize: 14 }}>
        <i className="fa-solid fa-right-left mr-1" /> Move
      </button>
      <button type="button" onClick={onClose} className="w-full text-xs text-slate-400 hover:text-white">
        Cancel
      </button>
    </NoelModal>
  );
}

// ---------- Cards ----------

function WhereList({ pick }: { pick: (id: string) => string }) {
  const { storage, visible } = useNarcotics();
  const rows = storage.filter((l) => !l.excludeTotals && visible(l)).map((l) => ({ l, v: pick(l.id) })).filter((x) => x.v);
  const { locLabel } = useNarcotics();
  return (
    <div>
      {rows.length ? (
        rows.map(({ l, v }) => (
          <div key={l.id} className="dx-where">
            <span className="dx-muted truncate">{locLabel(l.id)}</span>
            <b>{v}</b>
          </div>
        ))
      ) : (
        <div className="dx-where">
          <span className="dx-muted">No stock anywhere</span>
        </div>
      )}
    </div>
  );
}

export function StrainCard({ loc, strain, step, ops, onMove }: { loc: OpsLocation; strain: (typeof STRAINS)[number]; step: number; ops: Ops; onMove: () => void }) {
  const { stock, locLabel } = useNarcotics();
  const toast = useToast();
  const c = budCell(stock.get(loc.id), strain.id);
  const pressable = Math.floor(c.trimmed / BRICK_SIZE);
  const pct = ((c.trimmed % BRICK_SIZE) / BRICK_SIZE) * 100;
  const trimAmount = Math.min(step, c.untrimmed);
  const label = locLabel(loc.id);
  const adj = (field: BudField, d: number) => toast.run(ops.adjust(loc.id, strain.id, field, d, label));
  const set = (field: BudField) => (v: number) => toast.run(ops.setCount(loc.id, strain.id, field, v, c[field], label));
  const qrow = (lbl: string, field: BudField, extra = '') => (
    <div className={`qrow ${extra}`}>
      <span className="lbl">{lbl}</span>
      <button type="button" className="dx-step" onClick={() => adj(field, -step)} disabled={!c[field]} title={`−${n(step)}`}>
        −
      </button>
      <NumInput value={c[field]} onCommit={set(field)} label={`${strain.name} ${field}`} />
      <button type="button" className="dx-step" onClick={() => adj(field, step)} title={`+${n(step)}`}>
        +
      </button>
    </div>
  );
  return (
    <div className="dx-glass dx-inv dx-tint" style={{ ['--tint' as string]: strain.tint }}>
      <div className="head">
        <div className="logo">
          <Logo id={strain.id} />
        </div>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-base font-extrabold ${strain.nameColor}`}>{strain.name}</div>
        </div>
        <button type="button" className="dx-step px-3" onClick={onMove} disabled={!c.bricks && !c.trimmed && !c.untrimmed} title="Move to another location">
          <i className="fa-solid fa-right-left" />
        </button>
      </div>
      <div className="dx-inv-top">
        <div className="cell gold">
          <span className="lbl">On hand</span>
          <NumInput value={c.bricks} onCommit={set('bricks')} className={`big ${c.bricks ? '' : 'zero'}`} label="Bricks on hand" />
          <div className="btns">
            <button type="button" className="dx-step" onClick={() => adj('bricks', -1)} disabled={!c.bricks} title="−1 brick">
              −
            </button>
            <button type="button" className="dx-step" onClick={() => adj('bricks', 1)} title="+1 brick">
              +
            </button>
          </div>
        </div>
        <div className="cell green">
          <span className="lbl">To press</span>
          <span className={`big ${pressable ? '' : 'zero'}`} title="Bricks you can press from the trimmed bud">
            {n(pressable)}
          </span>
          <div className="btns">
            <button
              type="button"
              className="dx-act"
              disabled={!pressable}
              title="Press 1 brick"
              onClick={(e) => {
                celebrate('press', centerOf(e.currentTarget), strain.name);
                toast.run(ops.press(loc.id, strain.id, 1, label));
              }}
            >
              <i className="fa-solid fa-cube mr-1" />
              Press 1
            </button>
            <button
              type="button"
              className="dx-act solid"
              disabled={pressable < 2}
              title="Press all"
              onClick={(e) => {
                celebrate('press', centerOf(e.currentTarget), strain.name);
                toast.run(ops.press(loc.id, strain.id, pressable, label));
              }}
            >
              All{pressable > 1 ? ` (${pressable})` : ''}
            </button>
          </div>
        </div>
      </div>
      <div className="dx-inv-trim">
        {qrow('Trimmed', 'trimmed')}
        <div className="dx-bar" style={{ marginTop: 2 }}>
          <i style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
        <div className="meta">
          <span>{n(BRICK_SIZE - (c.trimmed % BRICK_SIZE))} to next brick</span>
          <span>{BRICK_SIZE} = 1 brick</span>
        </div>
      </div>
      <div className="dx-inv-minor space-y-1.5">
        {qrow('Untrimmed', 'untrimmed', 'sm')}
        <div className="flex justify-end">
          <button type="button" className="dx-act sm" onClick={() => toast.run(ops.trim(loc.id, strain.id, trimAmount, label))} disabled={!trimAmount} title="Move untrimmed to trimmed (1 to 1)">
            <i className="fa-solid fa-scissors mr-1" />
            Trim {n(trimAmount)} <i className="fa-solid fa-arrow-up ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CokeCard({ loc, step, ops, onMove, setTab }: { loc: OpsLocation; step: number; ops: Ops; onMove: () => void; setTab?: (t: NarcTab) => void }) {
  const { stock, recipe, locLabel } = useNarcotics();
  const toast = useToast();
  const s = stock.get(loc.id);
  const v = { coca: rootOf(s, 'coca'), cokeSmall: rootOf(s, 'cokeSmall'), cokeLarge: rootOf(s, 'cokeLarge') };
  const label = locLabel(loc.id);
  const canSmall = cokeCanMake(v.coca, recipe, 'small');
  const canLarge = cokeCanMake(v.coca, recipe, 'large');
  const adj = (f: RootField, d: number) => toast.run(ops.adjust(loc.id, null, f, d, label));
  const big = (f: 'cokeSmall' | 'cokeLarge', lbl: string) => (
    <div className="cell gold">
      <span className="lbl">{lbl}</span>
      <NumInput value={v[f]} onCommit={(x) => toast.run(ops.setCount(loc.id, null, f, x, v[f], label))} className={`big ${v[f] ? '' : 'zero'}`} label={`${lbl} coke bricks`} />
      <div className="btns">
        <button type="button" className="dx-step" onClick={() => adj(f, -1)} disabled={!v[f]}>
          −
        </button>
        <button type="button" className="dx-step" onClick={() => adj(f, 1)}>
          +
        </button>
      </div>
    </div>
  );
  return (
    <div className="dx-glass dx-inv dx-tint" style={{ ['--tint' as string]: '56,189,248' }}>
      <div className="head">
        <div className="logo">
          <CokePair />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold text-sky-300">Coke Bricks</div>
          <div className="dx-muted text-[11px]">Coca leaves → bricks</div>
        </div>
        {setTab && (
          <button type="button" className="dx-chip-btn mx-link ck-link" onClick={() => setTab('coke')}>
            <i className="fa-solid fa-snowflake mr-1" />
            Coke guide
          </button>
        )}
        <button type="button" className="dx-step px-3" onClick={onMove} disabled={!v.coca && !v.cokeSmall && !v.cokeLarge} title="Move to another location">
          <i className="fa-solid fa-right-left" />
        </button>
      </div>
      <div className="dx-inv-top">
        {big('cokeSmall', 'Small')}
        {big('cokeLarge', 'Large')}
      </div>
      <div className="flex gap-2">
        {(['small', 'large'] as const).map((size) => (
          <button
            key={size}
            type="button"
            className="dx-act"
            disabled={!(size === 'small' ? canSmall : canLarge)}
            title={`Uses ${cokeRecipeText(recipe, size)}`}
            onClick={(e) => {
              celebrate('press', centerOf(e.currentTarget), 'COKE');
              toast.run(ops.pressCoke(loc.id, size, recipe, label));
            }}
          >
            <i className={`fa-solid ${size === 'small' ? 'fa-cube' : 'fa-cubes'} mr-1`} />
            Press {size}
          </button>
        ))}
      </div>
      <div className="dx-inv-minor space-y-1.5">
        <div className="qrow sm">
          <span className="lbl">
            <i className="fa-solid fa-leaf mr-1" />
            Coca leaves
          </span>
          <button type="button" className="dx-step" onClick={() => adj('coca', -step)} disabled={!v.coca}>
            −
          </button>
          <NumInput value={v.coca} onCommit={(x) => toast.run(ops.setCount(loc.id, null, 'coca', x, v.coca, label))} label="Coca leaves" />
          <button type="button" className="dx-step" onClick={() => adj('coca', step)}>
            +
          </button>
        </div>
        <div className={`text-right text-[11px] ${canSmall ? 'dx-muted' : 'text-amber-300/80'}`}>
          {canSmall || canLarge ? `Enough leaves for ${canSmall} small or ${canLarge} large` : `Need ${n(cokeLeavesFor(recipe, 'small'))} leaves for a small brick`}
        </div>
        <div className="dx-muted text-[11px]">
          <i className="fa-solid fa-toolbox mr-1" />
          Also bring: <b className="text-slate-300">{cokeBringText(recipe, 'small')}</b> (small) · <b className="text-slate-300">{cokeBringText(recipe, 'large')}</b> (large)
        </div>
      </div>
    </div>
  );
}

export function MethCard({ loc, ops, onMove, setTab }: { loc: OpsLocation; ops: Ops; onMove: () => void; setTab?: (t: NarcTab) => void }) {
  const { stock, locLabel } = useNarcotics();
  const toast = useToast();
  const v = rootOf(stock.get(loc.id), 'meth');
  const label = locLabel(loc.id);
  return (
    <div className="dx-glass dx-inv dx-tint" style={{ ['--tint' as string]: '34,211,238' }}>
      <div className="head">
        <div className="logo">
          <Logo id="meth" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-base font-extrabold text-cyan-300">Meth Bins</div>
          <div className="dx-muted text-[11px]">Finished product</div>
        </div>
        {setTab && (
          <button type="button" className="dx-chip-btn mx-link" onClick={() => setTab('meth')}>
            <i className="fa-solid fa-flask mr-1" />
            Meth guide
          </button>
        )}
        <button type="button" className="dx-step px-3" onClick={onMove} disabled={!v} title="Move to another location">
          <i className="fa-solid fa-right-left" />
        </button>
      </div>
      <div className="dx-inv-top">
        <div className="cell gold" style={{ gridColumn: '1/-1' }}>
          <span className="lbl">Bins</span>
          <NumInput value={v} onCommit={(x) => toast.run(ops.setCount(loc.id, null, 'meth', x, v, label))} className={`big ${v ? '' : 'zero'}`} label="Meth bins" />
          <div className="btns">
            <button type="button" className="dx-step" onClick={() => toast.run(ops.adjust(loc.id, null, 'meth', -1, label))} disabled={!v}>
              −
            </button>
            <button type="button" className="dx-step" onClick={() => toast.run(ops.adjust(loc.id, null, 'meth', 1, label))}>
              +
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Read-only "where is it" cards for the All tab. */
function AllCards({ kind }: { kind: StockKind }) {
  const { totals, stock, recipe } = useNarcotics();
  if (kind === 'coke')
    return (
      <div className="dx-glass dx-inv dx-tint" style={{ ['--tint' as string]: '56,189,248' }}>
        <div className="head">
          <div className="logo">
            <CokePair />
          </div>
          <div className="text-base font-extrabold text-sky-300">Coke Bricks</div>
        </div>
        <div className="dx-inv-top">
          <div className="cell gold">
            <span className="lbl">Small</span>
            <span className={`big ${totals.cokeSmall ? '' : 'zero'}`}>{n(totals.cokeSmall)}</span>
          </div>
          <div className="cell gold">
            <span className="lbl">Large</span>
            <span className={`big ${totals.cokeLarge ? '' : 'zero'}`}>{n(totals.cokeLarge)}</span>
          </div>
        </div>
        <div className="totline minor">
          <span>Coca leaves</span>
          <b>{n(totals.coca)}</b>
        </div>
        <div className="totline minor">
          <span>Leaves make</span>
          <b>
            {cokeCanMake(totals.coca, recipe, 'small')} small · {cokeCanMake(totals.coca, recipe, 'large')} large
          </b>
        </div>
        <WhereList
          pick={(id) => {
            const s = stock.get(id);
            return [rootOf(s, 'cokeSmall') ? `${rootOf(s, 'cokeSmall')} small` : '', rootOf(s, 'cokeLarge') ? `${rootOf(s, 'cokeLarge')} large` : '', rootOf(s, 'coca') ? `${n(rootOf(s, 'coca'))} leaves` : '']
              .filter(Boolean)
              .join(' · ');
          }}
        />
      </div>
    );
  if (kind === 'meth')
    return (
      <div className="dx-glass dx-inv dx-tint" style={{ ['--tint' as string]: '34,211,238' }}>
        <div className="head">
          <div className="logo">
            <Logo id="meth" />
          </div>
          <div className="text-base font-extrabold text-cyan-300">Meth Bins</div>
        </div>
        <div className="dx-inv-top">
          <div className="cell gold" style={{ gridColumn: '1/-1' }}>
            <span className="lbl">Bins</span>
            <span className={`big ${totals.meth ? '' : 'zero'}`}>{n(totals.meth)}</span>
          </div>
        </div>
        <WhereList pick={(id) => (rootOf(stock.get(id), 'meth') ? `${rootOf(stock.get(id), 'meth')} bins` : '')} />
      </div>
    );
  return (
    <>
      {STRAINS.map((st) => {
        const inv = totals.strains[st.id];
        const potential = Math.floor(inv.trimmed / BRICK_SIZE);
        return (
          <div key={st.id} className="dx-glass dx-inv dx-tint" style={{ ['--tint' as string]: st.tint }}>
            <div className="head">
              <div className="logo">
                <Logo id={st.id} />
              </div>
              <div className="min-w-0">
                <div className={`truncate text-base font-extrabold ${st.nameColor}`}>{st.name}</div>
              </div>
            </div>
            <div className="dx-inv-top">
              <div className="cell gold">
                <span className="lbl">On hand</span>
                <span className={`big ${inv.bricks ? '' : 'zero'}`}>{n(inv.bricks)}</span>
              </div>
              <div className="cell green">
                <span className="lbl">To press</span>
                <span className={`big ${potential ? '' : 'zero'}`}>{n(potential)}</span>
              </div>
            </div>
            <div className="totline mid">
              <span className="dx-muted">Trimmed</span>
              <b>{n(inv.trimmed)}</b>
            </div>
            <div className="totline minor">
              <span>Untrimmed</span>
              <b>{n(inv.untrimmed)}</b>
            </div>
            <WhereList
              pick={(id) => {
                const c = budCell(stock.get(id), st.id);
                return [c.bricks ? `${c.bricks} bricks` : '', c.trimmed ? `${n(c.trimmed)} trim` : '', c.untrimmed ? `${n(c.untrimmed)} untrim` : ''].filter(Boolean).join(' · ');
              }}
            />
          </div>
        );
      })}
    </>
  );
}

/** Weed hero tiles for the chosen place (or everything). */
function Hero({ view }: { view: string }) {
  const { totals, totalsFor } = useNarcotics();
  const t = view === 'all' ? totals : totalsFor([view]);
  const leftover = t.trimmed - t.potential * BRICK_SIZE;
  return (
    <div className="dx-inv-hero">
      <div className="dx-glass dx-hero gold">
        <i className="fa-solid fa-cube ico" />
        <div className="lbl">Bricks on hand</div>
        <div className="num dx-mono">{n(t.bricks)}</div>
        <div className="sub">{t.potential ? <><b>{n(t.bricks + t.potential)}</b> once it&apos;s all pressed</> : 'Packaged and ready'}</div>
      </div>
      <div className="dx-glass dx-hero green">
        <i className="fa-solid fa-cubes ico" />
        <div className="lbl">Ready to press</div>
        <div className="num dx-mono">{n(t.potential)}</div>
        <div className="sub">
          Pressed from <b>{n(t.trimmed)}</b> trimmed
        </div>
      </div>
      <div className="dx-side">
        <div className="dx-glass dx-mid">
          <div className="lbl">Trimmed bud</div>
          <div className="num dx-mono">{n(t.trimmed)}</div>
          <div className="dx-muted text-xs">{t.potential ? `${n(leftover)} left over after pressing` : `${n(BRICK_SIZE - leftover)} more to a brick`}</div>
        </div>
        <div className="dx-minors">
          <div className="dx-glass dx-minor">
            <div className="lbl">Untrimmed</div>
            <div className="num dx-mono">{n(t.untrimmed)}</div>
          </div>
          <div className="dx-glass dx-minor">
            <div className="lbl">Coca leaves</div>
            <div className="num dx-mono" style={{ color: '#7dd3fc' }}>
              {n(t.coca)}
            </div>
          </div>
          <div className="dx-glass dx-minor">
            <div className="lbl">Coke bricks</div>
            <div className="num dx-mono" style={{ color: '#bae6fd' }}>
              {t.cokeSmall}
              <span className="text-xs text-slate-500"> S</span> · {t.cokeLarge}
              <span className="text-xs text-slate-500"> L</span>
            </div>
          </div>
          <div className="dx-glass dx-minor">
            <div className="lbl">Meth bins</div>
            <div className="num dx-mono" style={{ color: '#67e8f9' }}>
              {n(t.meth)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stock by location for one product line: pick a place, then change what's there.
 * The Weed tab shows strains (plus the pot plan for grows); Coke and Meth show their cards.
 */
export function StockByLocation({ kind, ops, footer }: { kind: StockKind; ops: Ops; footer?: (view: string, setView: (v: string) => void) => ReactNode }) {
  const { locById, stock, locLabel } = useNarcotics();
  const toast = useToast();
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem(`hq_narc_view_${kind}`) || 'all';
    } catch {
      return 'all';
    }
  });
  const [step, setStep] = useState(100);
  const [moving, setMoving] = useState<StrainId | 'coke' | 'meth' | null>(null);
  const pick = (v: string) => {
    setView(v);
    try {
      localStorage.setItem(`hq_narc_view_${kind}`, v);
    } catch {
      /* optional */
    }
  };
  const loc = view === 'all' ? undefined : locById.get(view);
  const growNoStorage = loc?.kind === 'grow' && !loc.storage;
  const stashTo = loc?.stashTo ?? MAIN_STASH;
  const holdsStock = loc && (() => {
    const s = stock.get(loc.id);
    return Object.values(s ?? {}).some((v) => (typeof v === 'number' ? v > 0 : v && typeof v === 'object' && Object.values(v).some((x) => Number(x) > 0)));
  })();

  return (
    <>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <span />
        {kind !== 'meth' && (
          <label className="flex items-center gap-2 text-xs text-slate-400" title="Amount used by the − / + and Trim buttons">
            <span className="font-semibold">Step amount</span>
            <input type="number" min={1} value={step} onChange={(e) => setStep(Math.max(1, toCount(e.target.value) || 1))} className="dx-input w-24 text-center" />
          </label>
        )}
      </div>
      <LocationTabs view={loc ? view : 'all'} setView={pick} kind={kind} showGrows={kind === 'weed'} />
      {kind === 'weed' && (!loc || !growNoStorage || holdsStock) && <Hero view={loc ? view : 'all'} />}
      <div className="mb-4">
        {!loc ? (
          <p className="text-xs text-slate-400">
            <i className="fa-solid fa-circle-info mr-1 text-weed-500" />
            Totals across every stash and location. Pick a tab to add, {kind === 'weed' ? 'trim, press' : 'press'} or move stock.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              {loc.kind === 'grow' ? (
                <span className="inv-kind grow">
                  <i className="fa-solid fa-cannabis" />
                  Grow{loc.storage ? ' · stock on site' : ''}
                </span>
              ) : (
                <span className="inv-kind house">
                  <i className="fa-solid fa-warehouse" />
                  {loc.crewId ? 'Crew stash house' : loc.id === MAIN_STASH ? 'Gang-wide' : 'Stash house'}
                </span>
              )}
              Editing <b className="text-white">{locLabel(loc.id)}</b>
              {loc.kind === 'grow' && loc.name ? ` · ${loc.name}` : ''}.
              {kind !== 'meth' && ` The − / + and Trim buttons use the step amount (${n(step)}).`}
            </p>
            {growNoStorage && (
              <p className="mt-1 text-xs text-amber-300">
                <i className="fa-solid fa-triangle-exclamation mr-1" />
                Postal {loc.postal} has no on-site storage: harvests go to <b className="text-white">{locLabel(stashTo)}</b>.
                {holdsStock && (
                  <button type="button" className="dx-chip-btn ml-2" onClick={() => toast.run(ops.moveAll(loc.id, stashTo, stock.get(loc.id), locLabel(loc.id), locLabel(stashTo)))}>
                    <i className="fa-solid fa-dolly mr-1" />
                    Move everything to {locLabel(stashTo)}
                  </button>
                )}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              {loc.excludeTotals ? (
                <>
                  <i className="fa-solid fa-eye-slash mr-1 text-slate-500" />
                  Left out of totals: this stock doesn&apos;t count toward the totals or the charts.
                </>
              ) : (
                'Counted in totals.'
              )}
              <button type="button" className="dx-chip-btn ml-2" onClick={() => toast.run(ops.setExcluded(loc, !loc.excludeTotals))}>
                <i className={`fa-solid ${loc.excludeTotals ? 'fa-eye' : 'fa-eye-slash'} mr-1`} />
                {loc.excludeTotals ? 'Count in totals' : 'Leave out of totals'}
              </button>
            </p>
          </>
        )}
      </div>
      {(!growNoStorage || holdsStock) && (
        <div className="dx-inv-grid">
          {!loc ? (
            <AllCards kind={kind} />
          ) : kind === 'weed' ? (
            STRAINS.map((s) => <StrainCard key={s.id} loc={loc} strain={s} step={step} ops={ops} onMove={() => setMoving(s.id)} />)
          ) : kind === 'coke' ? (
            <CokeCard loc={loc} step={step} ops={ops} onMove={() => setMoving('coke')} />
          ) : (
            <MethCard loc={loc} ops={ops} onMove={() => setMoving('meth')} />
          )}
        </div>
      )}
      {growNoStorage && !holdsStock && kind !== 'weed' && (
        <Empty title="No storage here" text={`Postal ${loc!.postal} doesn't keep stock on site. Pick a stash house above.`} />
      )}
      {footer?.(loc ? view : 'all', pick)}
      {moving && loc && <MoveModal from={loc} item={moving} ops={ops} onClose={() => setMoving(null)} />}
    </>
  );
}

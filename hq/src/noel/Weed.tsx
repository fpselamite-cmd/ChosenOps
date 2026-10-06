import { useState } from 'react';
import { useHub } from '../hooks/useHub';
import {
  BRICK_SIZE,
  MAIN_STASH,
  PLANTS_PER_POT,
  STRAINS,
  fmtBricks,
  formatDuration,
  formatTime,
  n,
  toCount,
  type OpsLocation,
  type StrainId,
} from './data';
import { allocState, durationHours, growScale, planEstimate, plannedPots, readyAtLabel, timerState } from './grow';
import type { Ops } from './ops';
import { StockByLocation } from './Stock';
import { useNarcotics } from './store';
import { Empty, Logo, NoelModal, celebrate, useToast } from './ui';

// ---------- Harvest ----------

/** Harvest form: what each strain gave, where it goes, then a new cycle starts. Opens for each queued grow in turn. */
export function HarvestModal({ queue, ops, onClose }: { queue: OpsLocation[]; ops: Ops; onClose: () => void }) {
  const { storage, strainYield, locLabel, yields, locById } = useNarcotics();
  const toast = useToast();
  const [i, setI] = useState(0);
  const loc = locById.get(queue[i]!.id) ?? queue[i]!;
  const dests = storage.filter((b) => b.kind === 'stash' || (b.id === loc.id && loc.storage));
  const prefill = Object.fromEntries(STRAINS.map((s) => [s.id, Math.round(toCount(loc.strainPots?.[s.id]) * strainYield(s.id).avg)])) as Record<StrainId, number>;
  const [amounts, setAmounts] = useState<Record<StrainId, string>>(() => Object.fromEntries(STRAINS.map((s) => [s.id, String(prefill[s.id])])) as Record<StrainId, string>);
  const [dest, setDest] = useState(loc.storage ? loc.id : loc.stashTo && dests.some((d) => d.id === loc.stashTo) ? loc.stashTo : MAIN_STASH);
  const planned = [...STRAINS].sort((a, b) => Number(toCount(loc.strainPots?.[b.id]) > 0) - Number(toCount(loc.strainPots?.[a.id]) > 0));
  const total = STRAINS.reduce((s, x) => s + toCount(amounts[x.id]), 0);

  const next = () => {
    if (i + 1 < queue.length) {
      const l = locById.get(queue[i + 1]!.id) ?? queue[i + 1]!;
      setI(i + 1);
      setAmounts(Object.fromEntries(STRAINS.map((s) => [s.id, String(Math.round(toCount(l.strainPots?.[s.id]) * strainYield(s.id).avg))])) as Record<StrainId, string>);
      setDest(l.storage ? l.id : l.stashTo ?? MAIN_STASH);
    } else onClose();
  };

  async function save(skipStock: boolean) {
    const got = skipStock ? {} : Object.fromEntries(STRAINS.map((s) => [s.id, toCount(amounts[s.id])]).filter(([, v]) => (v as number) > 0));
    // Only numbers someone actually changed teach the yield estimate.
    const learned = skipStock ? {} : Object.fromEntries(Object.entries(got).filter(([id, v]) => v !== prefill[id as StrainId]));
    celebrate('harvest', { x: innerWidth / 2, y: innerHeight / 2 });
    await toast.run(ops.harvest(loc, got, dest, dest === loc.id ? 'its on-site storage' : locLabel(dest), learned, yields));
    next();
  }

  return (
    <NoelModal wide onClose={onClose} onSubmit={() => save(false)}>
      <h2 className="text-center text-xl font-black text-white">
        Harvest Postal {loc.postal}
        {queue.length > 1 ? ` (${i + 1} of ${queue.length})` : ''}
      </h2>
      <p className="text-center text-xs text-slate-400">
        Enter the untrimmed bud collected for each strain. It goes to the stash house you pick and the timer restarts. Amounts start from the pot plan&apos;s estimate.
      </p>
      <label className="flex items-center gap-2 text-xs font-semibold text-slate-300">
        <i className="fa-solid fa-warehouse text-weed-500" />
        <span className="shrink-0">Send to</span>
        <select className="dx-input min-w-0 flex-1" value={dest} onChange={(e) => setDest(e.target.value)}>
          {dests.map((d) => (
            <option key={d.id} value={d.id}>
              {d.id === loc.id ? `Postal ${loc.postal} (on site)` : locLabel(d.id)}
            </option>
          ))}
        </select>
      </label>
      <div id="harvest-rows" className="max-h-[46vh] divide-y divide-weed-900/40 overflow-y-auto pr-1">
        {planned.map((s) => {
          const pots = toCount(loc.strainPots?.[s.id]);
          return (
            <label key={s.id} className="flex items-center gap-3 py-1.5">
              <span className="h-8 w-8 shrink-0">
                <Logo id={s.id} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-sm font-bold ${s.nameColor}`}>{s.name}</span>
                <span className="block text-[10px] text-slate-500">{pots ? `${pots} pots planned` : 'Not in pot plan'}</span>
              </span>
              <input
                type="number"
                min={0}
                value={amounts[s.id]}
                onChange={(e) => setAmounts({ ...amounts, [s.id]: e.target.value })}
                className="w-28 rounded-lg border border-weed-900 bg-darkbg px-2 py-1.5 text-right font-mono text-sm text-white focus:border-weed-400 focus:outline-none"
              />
            </label>
          );
        })}
      </div>
      <p className="text-right font-mono text-xs text-weed-300">{n(total)} untrimmed total</p>
      <button type="submit" className="dx-btn dx-btn-g" style={{ padding: '11px 14px', fontSize: 14 }}>
        <i className="fa-solid fa-cannabis mr-1" /> Add to Stock &amp; Restart
      </button>
      <button type="button" onClick={() => save(true)} className="dx-btn dx-btn-o">
        Just Restart the Timer
      </button>
      <button type="button" onClick={onClose} className="w-full text-xs text-slate-400 hover:text-white">
        Cancel
      </button>
    </NoelModal>
  );
}

// ---------- Upcoming harvests timeline ----------

function etHour(ms: number) {
  return Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24;
}

function Upcoming({ grows }: { grows: OpsLocation[] }) {
  const { now, strainYield } = useNarcotics();
  const items = grows
    .map((l) => ({ l, st: timerState(l, now), bricks: planEstimate(l, strainYield).bricks }))
    .filter((x) => x.st.status !== 'idle')
    .sort((a, b) => a.st.readyAt - b.st.readyAt);
  const readyNow = items.filter((x) => x.st.status === 'ready');
  const coming = items.filter((x) => x.st.status === 'running');
  const next = items.filter((x) => x.st.readyAt - now <= 24 * 3600e3);
  const nextBricks = next.reduce((s, x) => s + x.bricks, 0);

  let line = null;
  if (coming.length) {
    const spanHours = Math.min(7 * 24, Math.max(36, Math.ceil((coming[coming.length - 1]!.st.readyAt - now) / 3600e3 / 6) * 6 + 2));
    const span = spanHours * 3600e3;
    const step = spanHours <= 48 ? 6 : spanHours <= 96 ? 12 : 24;
    const ticks: { pos: number; label: string; day: boolean }[] = [];
    const firstHour = Math.floor(now / 3600e3) * 3600e3 + 3600e3;
    for (let t = firstHour; t < now + span; t += 3600e3) {
      const h = etHour(t);
      if (h % step) continue;
      const pos = ((t - now) / span) * 100;
      if (pos < 4 || pos > 97) continue;
      ticks.push({
        pos,
        day: h === 0,
        label: h === 0 ? new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' }) : new Date(t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric' }),
      });
    }
    line = (
      <div className="line">
        <div className="axis" />
        <span className="nowmark" title="Now" />
        {ticks.map((t) => (
          <span key={t.pos} className={`tick ${t.day ? 'day' : ''}`} style={{ left: `${t.pos.toFixed(2)}%` }}>
            {t.label}
          </span>
        ))}
        {coming.map((x, i) => (
          <div key={x.l.id} className="mk" style={{ left: `${Math.max(1, Math.min(99, ((x.st.readyAt - now) / span) * 100)).toFixed(2)}%` }} title={`Postal ${x.l.postal} · ${readyAtLabel(x.l, now)}`}>
            <div className="lbl">
              <b>{x.l.postal}</b> {x.bricks ? <span>~{fmtBricks(x.bricks)}</span> : null}
              <br />
              {new Date(x.st.readyAt).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })}
            </div>
            <div className="stem" style={{ height: i % 2 ? 6 : 34 }} />
            <div className="dot" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="dx-glass dx-upc">
      <div className="dx-sec">
        <h2>Upcoming Harvests</h2>
        <span className="dx-muted text-xs">
          {next.length ? (
            <>
              Next 24h: <b className="text-weed-400">~{fmtBricks(nextBricks)} bricks</b> from {next.length} {next.length === 1 ? 'grow' : 'grows'}
            </>
          ) : (
            'Nothing due in the next 24 hours'
          )}
        </span>
      </div>
      {readyNow.length > 0 && (
        <div className="now-row">
          <span className="dx-muted font-semibold">Ready now:</span>
          {readyNow.map((x) => (
            <span key={x.l.id} className="chip">
              {x.l.postal}
              {x.bricks ? ` · ~${fmtBricks(x.bricks)}` : ''}
            </span>
          ))}
        </div>
      )}
      {line ?? (!readyNow.length && <p className="dx-muted pb-2 text-xs">No grows running. Start a timer to see when harvests are due.</p>)}
    </div>
  );
}

// ---------- Grow timer cards ----------

function GrowsView({ ops, onHarvest }: { ops: Ops; onHarvest: (locs: OpsLocation[]) => void }) {
  const { grows, visible, now, strainYield, locLabel } = useNarcotics();
  const { crewById } = useHub();
  const toast = useToast();
  const shown = grows.filter(visible);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const states = shown.map((l) => ({ l, st: timerState(l, now) }));
  const idle = states.filter((x) => x.st.status === 'idle').map((x) => x.l);
  const ready = states.filter((x) => x.st.status === 'ready').map((x) => x.l);
  const active = states.filter((x) => x.st.status !== 'idle').map((x) => x.l);
  const sel = shown.filter((l) => picked.has(l.id));
  const selState = (s: string) => sel.filter((l) => timerState(l, now).status === s);
  const toggle = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
  };

  return (
    <>
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <p className="text-xs text-slate-400">
          Postals: <span className="font-mono font-bold text-weed-300">{shown.map((l) => l.postal).join(', ') || '—'}</span>. Pot plans are under each grow in{' '}
          <b>Stock &amp; pot plans</b>.
        </p>
        {shown.length > 0 && (
          <div className="dx-plan-actions">
            <button type="button" className="dx-act solid" onClick={() => toast.run(ops.setTimers(idle, true))} disabled={!idle.length}>
              <i className="fa-solid fa-play mr-1" />
              Start all idle{idle.length ? ` (${idle.length})` : ''}
            </button>
            <button type="button" className="dx-act" onClick={() => onHarvest(ready)} disabled={!ready.length}>
              <i className="fa-solid fa-cannabis mr-1" />
              Harvest all ready{ready.length ? ` (${ready.length})` : ''}
            </button>
            <button
              type="button"
              className="dx-act"
              disabled={!active.length}
              onClick={() => confirm('Stop every grow timer you can see? Their progress is lost.') && toast.run(ops.setTimers(active, false))}
            >
              <i className="fa-solid fa-stop mr-1" />
              Stop all
            </button>
          </div>
        )}
      </div>
      <Upcoming grows={shown} />
      {sel.length > 0 && (
        <div className="dx-bulk">
          <b>{sel.length} selected</b>
          <button type="button" className="dx-act solid" disabled={!selState('idle').length} onClick={() => toast.run(ops.setTimers(selState('idle'), true)).then(() => setPicked(new Set()))}>
            <i className="fa-solid fa-play mr-1" />
            Start{selState('idle').length ? ` (${selState('idle').length})` : ''}
          </button>
          <button type="button" className="dx-act" disabled={!selState('ready').length} onClick={() => (onHarvest(selState('ready')), setPicked(new Set()))}>
            <i className="fa-solid fa-cannabis mr-1" />
            Harvest{selState('ready').length ? ` (${selState('ready').length})` : ''}
          </button>
          <button
            type="button"
            className="dx-act"
            disabled={selState('idle').length === sel.length}
            onClick={() => {
              const a = sel.filter((l) => timerState(l, now).status !== 'idle');
              if (confirm(`Stop ${a.length} ${a.length === 1 ? 'timer' : 'timers'}?`)) toast.run(ops.setTimers(a, false)).then(() => setPicked(new Set()));
            }}
          >
            <i className="fa-solid fa-stop mr-1" />
            Stop
          </button>
          <button type="button" className="dx-act" onClick={() => setPicked(new Set(shown.map((l) => l.id)))}>
            Select all
          </button>
          <button type="button" className="dx-act" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}
      <div className="dx-tc-grid">
        {!shown.length && (
          <div style={{ gridColumn: '1/-1' }}>
            <Empty title="No grows yet" text="Add a grow spot by its postal on the Stash page and its timer starts here." />
          </div>
        )}
        {states.map(({ l, st }) => {
          const isReady = st.status === 'ready';
          const isIdle = st.status === 'idle';
          const est = planEstimate(l, strainYield).bricks;
          const crew = l.crewId ? crewById.get(l.crewId) : undefined;
          const pills = STRAINS.filter((s) => toCount(l.strainPots?.[s.id]) > 0);
          return (
            <div key={l.id} className={`dx-glass dx-tc ${st.status} ${picked.has(l.id) ? 'picked' : ''}`}>
              <div className="top">
                <div className="min-w-0">
                  <h2>{l.postal}</h2>
                  <div className="alias">
                    {l.name || 'Grow'}
                    {crew && (
                      <span className="ml-1.5 rounded px-1 font-mono text-[9px] font-bold text-black" style={{ background: crew.color }}>
                        {crew.tag}
                      </span>
                    )}
                  </div>
                </div>
                <div className="sel">
                  <span className={`dx-status ${isReady ? 'rdy' : isIdle ? 'idle' : 'run'}`}>{isReady ? 'Ready!' : isIdle ? 'Not started' : 'Growing'}</span>
                  <input type="checkbox" checked={picked.has(l.id)} onChange={(e) => toggle(l.id, e.target.checked)} aria-label={`Select ${l.postal}`} />
                </div>
              </div>
              <div className="mid">
                <div className="bigpot">
                  <i className="fa-solid fa-cannabis" style={{ ['--grow' as string]: growScale(st).toFixed(2) }} />
                </div>
                <div className="clock">
                  {isReady ? (
                    <>
                      <div className="t">Ready!</div>
                      <div className="s">Harvest now</div>
                    </>
                  ) : isIdle ? (
                    <>
                      <div className="t">{formatTime(st.totalSecs)}</div>
                      <div className="s">{formatDuration(durationHours(l))} cycle · not started</div>
                    </>
                  ) : (
                    <>
                      <div className="t">{formatTime(st.remainingSecs)}</div>
                      <div className="s">{Math.floor(st.pct)}% grown</div>
                    </>
                  )}
                </div>
              </div>
              {!isIdle && !isReady && (
                <div className="track">
                  <div className="fill" style={{ width: `${st.pct.toFixed(2)}%` }} />
                </div>
              )}
              <div className="eta">
                <span>{isReady ? 'Ready to harvest' : isIdle ? 'Not running' : readyAtLabel(l, now)}</span>
                <span>{est ? `~${fmtBricks(est)} bricks` : ''}</span>
              </div>
              <div className="plan">
                {pills.length ? (
                  pills.map((s) => (
                    <span key={s.id} className="p" style={{ ['--t' as string]: s.tint }}>
                      {s.name} {toCount(l.strainPots?.[s.id])}
                    </span>
                  ))
                ) : (
                  <span className="dx-muted text-[11px]">No pot plan yet</span>
                )}
              </div>
              <div className="truncate text-[11px] text-slate-500" title="Where harvests go">
                <i className="fa-solid fa-warehouse mr-1" />
                Harvest → {l.storage ? 'on-site storage' : locLabel(l.stashTo ?? MAIN_STASH)}
              </div>
              <div className="acts">
                {isReady ? (
                  <>
                    <button type="button" className="dx-btn dx-btn-g" onClick={() => onHarvest([l])}>
                      <i className="fa-solid fa-cannabis mr-1" />
                      Harvest &amp; Restart
                    </button>
                    <button type="button" className="dx-btn dx-stop" onClick={() => toast.run(ops.setTimers([l], false))} title="Stop without harvesting">
                      <i className="fa-solid fa-stop" />
                    </button>
                  </>
                ) : isIdle ? (
                  <button type="button" className="dx-btn dx-btn-o" onClick={() => toast.run(ops.setTimers([l], true))}>
                    <i className="fa-solid fa-play mr-1" />
                    Start {formatDuration(durationHours(l))} cycle
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="dx-btn dx-btn-o"
                      onClick={() => confirm(`Restart Postal ${l.postal}'s timer from now? The current cycle's progress is lost.`) && toast.run(ops.setTimers([l], true))}
                      title="Start the cycle over from now"
                    >
                      <i className="fa-solid fa-rotate-right mr-1" />
                      Restart
                    </button>
                    <button type="button" className="dx-btn dx-stop" onClick={() => toast.run(ops.setTimers([l], false))}>
                      <i className="fa-solid fa-stop mr-1" />
                      Stop
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// ---------- Pot plans ----------

function smartBalance(loc: OpsLocation, all: OpsLocation[], totalsBud: Record<string, number>, avg: (id: StrainId) => number) {
  const projected: Record<string, number> = {};
  for (const s of STRAINS) {
    let bud = totalsBud[s.id] ?? 0;
    for (const o of all) if (o.id !== loc.id) bud += toCount(o.strainPots?.[s.id]) * avg(s.id);
    projected[s.id] = bud;
  }
  const plan = Object.fromEntries(STRAINS.map((s) => [s.id, 0])) as Record<StrainId, number>;
  const total = Math.max(1, toCount(loc.pots) || 10);
  for (let i = 0; i < total; i++) {
    const lowest = STRAINS.reduce((best, s) => (projected[s.id]! < projected[best.id]! ? s : best), STRAINS[0]);
    plan[lowest.id] += 1;
    projected[lowest.id]! += avg(lowest.id);
  }
  return plan;
}

function PlanLocation({ loc, ops }: { loc: OpsLocation; ops: Ops }) {
  const { strainYield, totals, grows, now } = useNarcotics();
  const toast = useToast();
  const a = allocState(loc);
  const est = planEstimate(loc, strainYield);
  const free = Math.max(0, a.total - a.planned);
  const scale = Math.max(a.total, a.planned);
  const plan = (p: Partial<Record<StrainId, number>>, text: string) => toast.run(ops.setPlan(loc, p, text));
  const setStrain = (id: StrainId, v: number) => plan({ ...(loc.strainPots ?? {}), [id]: Math.max(0, v) }, `Plan for Postal ${loc.postal} changed`);
  const st = timerState(loc, now);
  return (
    <>
      <div className="dx-glass dx-plan-head">
        <div>
          <div className="pid">{loc.postal}</div>
          <div className="alias">
            {loc.name || 'Grow location'} · {st.status === 'running' ? readyAtLabel(loc, now) : st.status === 'ready' ? 'Ready to harvest' : 'Not growing'}
          </div>
        </div>
        <div className="dx-plan-pots">
          <span className="lbl">Location pots</span>
          <button type="button" className="dx-step" onClick={() => ops.setPots(loc, a.total - 1)} disabled={a.total <= 1}>
            −
          </button>
          <input
            key={a.total}
            type="number"
            min={1}
            className="dx-input"
            defaultValue={a.total}
            aria-label="Location pots"
            onBlur={(e) => toCount(e.target.value) !== a.total && ops.setPots(loc, toCount(e.target.value) || 10)}
          />
          <button type="button" className="dx-step" onClick={() => ops.setPots(loc, a.total + 1)}>
            +
          </button>
        </div>
        <div className="dx-plan-actions">
          <button
            type="button"
            className="dx-act solid"
            title="More pots for the strains you're lowest on"
            onClick={() => {
              const bud = Object.fromEntries(STRAINS.map((s) => [s.id, totals.strains[s.id].bricks * BRICK_SIZE + totals.strains[s.id].trimmed + totals.strains[s.id].untrimmed]));
              const p = smartBalance(loc, grows, bud, (id) => strainYield(id).avg);
              const top = Object.entries(p)
                .filter(([, v]) => v > 0)
                .sort((x, y) => y[1] - x[1])
                .slice(0, 3)
                .map(([id, v]) => `${STRAINS.find((s) => s.id === id)!.name} ${v}`);
              plan(p, `Smart balance for Postal ${loc.postal}: most pots to the strains you're lowest on (${top.join(', ')}).`);
            }}
          >
            <i className="fa-solid fa-brain mr-1" />
            Smart Balance
          </button>
          <button
            type="button"
            className="dx-act"
            title="Split the pots evenly across all 10 strains"
            onClick={() => {
              const base = Math.floor(a.total / 10);
              const rem = a.total % 10;
              plan(Object.fromEntries(STRAINS.map((s, i) => [s.id, base + (i < rem ? 1 : 0)])), `Split ${a.total} pots evenly across 10 strains for Postal ${loc.postal}`);
            }}
          >
            <i className="fa-solid fa-scale-balanced mr-1" />
            Even Split
          </button>
          <button type="button" className="dx-act" disabled={!a.planned} onClick={() => plan(Object.fromEntries(STRAINS.map((s) => [s.id, 0])), `Cleared the plan for Postal ${loc.postal}`)}>
            <i className="fa-solid fa-eraser mr-1" />
            Clear
          </button>
        </div>
        <div className="dx-meter">
          <div className="bar">
            {STRAINS.map((s) => {
              const pots = toCount(loc.strainPots?.[s.id]);
              return pots ? <span key={s.id} style={{ width: `${((Math.min(pots, scale) / scale) * 100).toFixed(2)}%`, background: `rgb(${s.tint})` }} title={`${s.name}: ${pots} pots`} /> : null;
            })}
            {a.planned > a.total && <span className="over" style={{ width: `${(((a.planned - a.total) / scale) * 100).toFixed(2)}%` }} />}
          </div>
          <div className="txt">
            {a.cls === 'ok' ? (
              <span className="ok">
                <i className="fa-solid fa-circle-check mr-1" />
                All {a.total} pots planned
              </span>
            ) : a.cls === 'under' ? (
              <span className="under">
                <i className="fa-solid fa-circle-exclamation mr-1" />
                {free} of {a.total} pots unassigned
              </span>
            ) : (
              <span className="overtxt">
                <i className="fa-solid fa-triangle-exclamation mr-1" />
                {a.planned - a.total} over: planned {a.planned}, location has {a.total}
              </span>
            )}
            <span className="dx-muted">
              {a.planned} / {a.total}
            </span>
          </div>
          <div className="dx-plan-totals">
            <div>
              <div className="l">Plants</div>
              <div className="v">{n(a.planned * PLANTS_PER_POT)}</div>
              <div className="s">{PLANTS_PER_POT} per pot</div>
            </div>
            <div>
              <div className="l">Est. bud</div>
              <div className="v">{n(Math.round(est.buds))}</div>
              <div className="s">
                {n(Math.round(est.min))} – {n(Math.round(est.max))}
              </div>
            </div>
            <div>
              <div className="l">Est. bricks</div>
              <div className="v hot">{fmtBricks(est.bricks)}</div>
              <div className="s">per {formatDuration(durationHours(loc))} cycle</div>
            </div>
          </div>
        </div>
      </div>
      <div className="dx-plan-grid">
        {STRAINS.map((s) => {
          const pots = toCount(loc.strainPots?.[s.id]);
          const y = strainYield(s.id);
          return (
            <div key={s.id} className={`dx-glass dx-ps dx-tint ${pots ? '' : 'zero'}`} style={{ ['--tint' as string]: s.tint }}>
              <div className="head">
                <div className="logo">
                  <Logo id={s.id} />
                </div>
                <div className={`nm ${s.nameColor}`}>{s.name}</div>
              </div>
              <div className="stepper">
                <button type="button" className="dx-step" onClick={() => setStrain(s.id, pots - 1)} disabled={!pots}>
                  −
                </button>
                <input
                  key={pots}
                  type="number"
                  min={0}
                  className="dx-input"
                  defaultValue={pots}
                  aria-label={`${s.name} pots`}
                  onBlur={(e) => toCount(e.target.value) !== pots && setStrain(s.id, toCount(e.target.value))}
                />
                <button type="button" className="dx-step" onClick={() => setStrain(s.id, pots + 1)}>
                  +
                </button>
              </div>
              <div className="est">
                <b>{fmtBricks((pots * y.avg) / BRICK_SIZE)}</b>
                <span>bricks · ~{n(Math.round(pots * y.avg))} bud</span>
              </div>
              <div className="src">
                <span title={y.samples ? `Average of the last ${y.samples} harvests` : 'Default estimate until this strain is harvested'}>
                  {Math.round(y.avg)}/pot · {y.samples ? `${y.samples} harvest${y.samples === 1 ? '' : 's'}` : 'default'}
                </span>
                {free > 0 && (
                  <button type="button" className="fill-rest" onClick={() => setStrain(s.id, pots + free)} title={`Give this strain the ${free} unassigned pots`}>
                    +{free}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function PlanOverview({ grows, pick }: { grows: OpsLocation[]; pick: (id: string) => void }) {
  const { strainYield } = useNarcotics();
  let grandPots = 0;
  let grandBricks = 0;
  const rows = STRAINS.map((s) => {
    const y = strainYield(s.id);
    const cells = grows.map((l) => toCount(l.strainPots?.[s.id]));
    const total = cells.reduce((a, b) => a + b, 0);
    const bricks = (total * y.avg) / BRICK_SIZE;
    grandPots += total;
    grandBricks += bricks;
    return { s, cells, total, bricks };
  });
  return (
    <div className="dx-glass dx-overview">
      <div className="dx-sec" style={{ padding: '16px 18px 0' }}>
        <h2>All Locations</h2>
        <span className="dx-muted text-xs">Pots per strain · expected bricks each cycle</span>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th className="strain">Strain</th>
              {grows.map((l) => {
                const a = allocState(l);
                return (
                  <th key={l.id}>
                    <button type="button" className="font-mono font-bold text-white hover:text-weed-300" onClick={() => pick(l.id)}>
                      {l.postal}
                    </button>
                    <div className={`alloc ${a.cls}`}>
                      {a.planned}/{a.total}
                    </div>
                  </th>
                );
              })}
              <th>Pots</th>
              <th>Bricks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, cells, total, bricks }) => (
              <tr key={s.id} className={total ? '' : 'nil-row'}>
                <th className="strain">
                  <span className="logo">
                    <Logo id={s.id} />
                  </span>
                  <span className={s.nameColor}>{s.name}</span>
                </th>
                {cells.map((c, i) => (
                  <td key={grows[i]!.id} className={c ? '' : 'nil'}>
                    {c || '·'}
                  </td>
                ))}
                <td className="tot">{total}</td>
                <td className="br">{fmtBricks(bricks)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th className="strain">Pots planned</th>
              {grows.map((l) => (
                <td key={l.id}>{plannedPots(l)}</td>
              ))}
              <td className="tot">{grandPots}</td>
              <td />
            </tr>
            <tr>
              <th className="strain">Est. bricks</th>
              {grows.map((l) => (
                <td key={l.id} className="br">
                  {fmtBricks(planEstimate(l, strainYield).bricks)}
                </td>
              ))}
              <td />
              <td className="br big">{fmtBricks(grandBricks)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="dx-muted text-[11px]" style={{ padding: '0 18px 14px' }}>
        Pick a grow&apos;s tab above to edit its plan.
      </p>
    </div>
  );
}

function PotPlan({ view, setView, ops }: { view: string; setView: (v: string) => void; ops: Ops }) {
  const { grows, locById, visible, learnedStrains } = useNarcotics();
  const { can } = useHub();
  const loc = locById.get(view);
  const shown = grows.filter(visible);
  if (!(loc?.kind === 'grow') && !(view === 'all' && shown.length)) return null;
  return (
    <>
      <div className="dx-sec" style={{ marginTop: 28 }}>
        <h2>
          <i className="fa-solid fa-table-cells mr-1 text-weed-400" />
          Pot Plan{loc?.kind === 'grow' ? <> · <span className="font-mono">{loc.postal}</span></> : null}
        </h2>
        <span className="dx-muted text-xs">
          <span className="font-semibold text-weed-400">1 pot = 4 plants, 750 bud = 1 brick.</span>
        </span>
      </div>
      <p className="dx-muted mb-3 text-xs">
        {learnedStrains ? (
          <>
            <i className="fa-solid fa-chart-line mr-1 text-weed-400" />
            Estimates use your real harvests for {learnedStrains} of 10 strains.
            {can('manageOps') && (
              <button type="button" className="ml-1 text-slate-500 underline hover:text-red-300" onClick={() => confirm('Forget the learned yields and go back to the default estimate (198 bud per pot)?') && ops.resetYields()}>
                Reset
              </button>
            )}
          </>
        ) : (
          <>
            <i className="fa-solid fa-chart-line mr-1 text-slate-500" />
            Estimates start at ~198 bud per pot and learn from your harvests.
          </>
        )}
      </p>
      {loc?.kind === 'grow' ? <PlanLocation loc={loc} ops={ops} /> : <PlanOverview grows={shown} pick={setView} />}
    </>
  );
}

export function Weed({ ops, onHarvest }: { ops: Ops; onHarvest: (locs: OpsLocation[]) => void }) {
  const [sub, setSub] = useState<'grows' | 'stock'>(() => {
    try {
      return localStorage.getItem('hq_narc_weed') === 'stock' ? 'stock' : 'grows';
    } catch {
      return 'grows';
    }
  });
  const pick = (s: 'grows' | 'stock') => {
    setSub(s);
    try {
      localStorage.setItem('hq_narc_weed', s);
    } catch {
      /* optional */
    }
  };
  return (
    <>
      <div className="dx-tabs mb-4">
        <button type="button" className={`dx-tab ${sub === 'grows' ? 'on' : ''}`} onClick={() => pick('grows')}>
          <i className="fa-solid fa-cannabis" />
          Grow timers
        </button>
        <button type="button" className={`dx-tab ${sub === 'stock' ? 'on' : ''}`} onClick={() => pick('stock')}>
          <i className="fa-solid fa-warehouse" />
          Stock &amp; pot plans
        </button>
      </div>
      {sub === 'grows' ? <GrowsView ops={ops} onHarvest={onHarvest} /> : <StockByLocation kind="weed" ops={ops} footer={(view, setView) => <PotPlan view={view} setView={setView} ops={ops} />} />}
    </>
  );
}

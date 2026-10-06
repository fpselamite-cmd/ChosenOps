import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { initials } from '../lib/format';
import { METH_SIZES, fmtBricks, formatDuration, formatTime, type Activity, type OpsLocation } from './data';
import { cookState, cookTimeLabel, durationHours, growScale, planEstimate, readyAtLabel, runLabel, runState, timerState } from './grow';
import type { Ops } from './ops';
import { useNarcotics } from './store';
import { Beaker, useToast } from './ui';

export type NarcTab = 'overview' | 'weed' | 'meth' | 'coke';

/** A person's picture (or initials) in NoelOps' round avatar style. */
export function NoelAvatar({ name }: { name: string }) {
  const { roster } = useHub();
  if (name === 'ChosenOps')
    return (
      <span className="dx-av" style={{ background: 'hsl(var(--acc-h) 80% 10%)', color: 'hsl(var(--acc-h) 69% 58%)', borderColor: 'hsl(var(--acc-h) 64% 24%)' }} title="ChosenOps">
        <i className="fa-solid fa-cannabis" />
      </span>
    );
  const m = roster.find((x) => x.name === name);
  if (m?.avatar) return <img className="dx-av" src={m.avatar} alt={name} title={name} />;
  return (
    <span className="dx-av" style={{ background: 'linear-gradient(135deg,#6e5516,#2a2009)', color: '#f8e7a8' }} title={name}>
      {initials(name)}
    </span>
  );
}

export function ActivityText({ a }: { a: Activity }) {
  const { roster } = useHub();
  const m = roster.find((x) => x.name === a.who);
  return (
    <>
      {m ? (
        <Link to={`/members/${m.id}`} className="dx-person-link font-bold">
          {a.who}
        </Link>
      ) : (
        <b>{a.who}</b>
      )}{' '}
      {a.pre} <b className="g">{a.hi}</b> {a.post}
    </>
  );
}

export function relTime(ms: number | undefined, now: number) {
  if (!ms) return 'just now';
  const secs = Math.max(0, Math.floor((now - ms) / 1000));
  if (secs < 45) return 'just now';
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))} min ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)} h ago`;
  return new Date(ms).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}

/** The slim LIVE ticker: the newest lines drift past; click it for the full list. */
function Ticker() {
  const { activity, now } = useNarcotics();
  const [open, setOpen] = useState(false);
  const runRef = useRef<HTMLSpanElement>(null);
  const [dur, setDur] = useState(60);
  const items = activity.slice(0, 12);
  useEffect(() => {
    const w = runRef.current?.scrollWidth ?? 0;
    setDur(Math.max(60, Math.round(w / 15))); // a slow drift: ~15px a second
  }, [items.map((a) => a.id).join()]);

  const run = (aria?: boolean) => (
    <span className="tk-run" ref={aria ? undefined : runRef} aria-hidden={aria || undefined}>
      {items.map((a) => (
        <span key={a.id}>
          <span className="tk-item">
            <NoelAvatar name={a.who} />
            <span>
              <ActivityText a={a} />
            </span>
            <span className="when">{relTime(a.at?.toMillis(), now)}</span>
          </span>
          <span className="tk-sep">•</span>
        </span>
      ))}
    </span>
  );

  return (
    <div className={`dx-ticker ${open ? 'open' : ''}`}>
      <button type="button" className="tk-live" onClick={() => setOpen(!open)} title="Show all Live Activity">
        <span className="dx-dot" />
        LIVE
      </button>
      <div className="tk-win" onClick={() => setOpen(!open)} title="Show all Live Activity">
        {items.length ? (
          <div className="tk-track" style={{ ['--tk-dur' as string]: `${dur}s` }}>
            {run()}
            {run(true)}
          </div>
        ) : (
          <div className="tk-track" style={{ animation: 'none' }}>
            <span className="tk-item tk-quiet">Quiet so far. Harvests, cooks and sales show up here live.</span>
          </div>
        )}
      </div>
      <button type="button" className="tk-more" onClick={() => setOpen(!open)} aria-label="Show all Live Activity" aria-expanded={open}>
        <i className="fa-solid fa-chevron-down" />
      </button>
      {open && (
        <div className="dx-feed-drop dx-glass">
          <div className="dx-sec">
            <h2>Live Activity</h2>
            <span className="dx-chip">
              <span className="dx-dot" />
              LIVE
            </span>
          </div>
          <ul className="dx-feed">
            {activity.map((a) => (
              <li key={a.id}>
                <NoelAvatar name={a.who} />
                <div className="min-w-0">
                  <ActivityText a={a} />
                  <div className="when">{relTime(a.at?.toMillis(), now)}</div>
                </div>
              </li>
            ))}
            {!activity.length && <li style={{ display: 'block' }}>Quiet so far.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function GrowMini({ loc, ops, onHarvest }: { loc: OpsLocation; ops: Ops; onHarvest: (l: OpsLocation) => void }) {
  const { now } = useNarcotics();
  const toast = useToast();
  const st = timerState(loc, now);
  const ready = st.status === 'ready';
  const idle = st.status === 'idle';
  return (
    <div className={`dx-gb ${st.status}`} title={`Postal ${loc.postal} · ${ready ? 'Ready to harvest' : idle ? 'Not started' : readyAtLabel(loc, now)}`}>
      <div className="pot">
        <i className="fa-solid fa-cannabis" style={{ ['--grow' as string]: growScale(st).toFixed(2) }} />
      </div>
      <div className="who">
        <span className="pid">{loc.postal}</span>
        <span className="alias">{loc.name || 'Grow'}</span>
      </div>
      <div className="time">
        {ready ? (
          <>
            <span className="t">Ready!</span>
            <span className="s">Harvest now</span>
          </>
        ) : idle ? (
          <>
            <span className="t">{formatTime(st.totalSecs)}</span>
            <span className="s">Not started</span>
          </>
        ) : (
          <>
            <span className="t">{formatTime(st.remainingSecs)}</span>
            <span className="s">{Math.floor(st.pct)}% grown</span>
          </>
        )}
      </div>
      <div className="low">
        {ready ? (
          <button type="button" onClick={() => onHarvest(loc)} className="dx-btn dx-btn-g">
            <i className="fa-solid fa-cannabis mr-1" /> Harvest &amp; Restart
          </button>
        ) : idle ? (
          <button type="button" onClick={() => toast.run(ops.setTimers([loc], true))} className="dx-btn dx-btn-o">
            <i className="fa-solid fa-play mr-1" /> Start {formatDuration(durationHours(loc))} cycle
          </button>
        ) : (
          <>
            <div className="track">
              <div className="fill" style={{ width: `${st.pct.toFixed(2)}%` }} />
            </div>
            <div className="eta">{readyAtLabel(loc, now)}</div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Grow timers, meth cooks and coke runs counting down, across the top of every Narcotics tab,
 * with the LIVE ticker underneath. It also claims "ready" announcements for the feed.
 */
export function TimerBar({ ops, onHarvest, setTab }: { ops: Ops; onHarvest: (l: OpsLocation) => void; setTab: (t: NarcTab) => void }) {
  const { grows, cooks, runs, now, visible, strainYield } = useNarcotics();
  const toast = useToast();
  const shown = grows.filter(visible);
  const soon = shown
    .map((l) => ({ l, st: timerState(l, now) }))
    .filter(({ st }) => st.status !== 'idle' && st.readyAt - now <= 24 * 3600e3);
  const soonBricks = soon.reduce((s, { l }) => s + planEstimate(l, strainYield).bricks, 0);

  // Announce ready grows, cooks and runs in the feed once (the first page to notice wins).
  const claimed = useRef(new Set<string>());
  useEffect(() => {
    const claim = (kind: 'cooks' | 'runs' | 'locations', id: string) => {
      const k = `${kind}/${id}`;
      if (claimed.current.has(k)) return;
      claimed.current.add(k);
      ops.claimReady(kind, id);
    };
    grows.forEach((l) => {
      if (timerState(l, now).status === 'ready' && !l.alertSent) claim('locations', l.id);
    });
    cooks.forEach((c) => !c.told && cookState(c, now).ready && claim('cooks', c.id));
    runs.forEach((r) => !r.told && runState(r, now).ready && claim('runs', r.id));
  }, [now, grows, cooks, runs, ops]);

  return (
    <div className="dx-growbar -mx-4 -mt-6 mb-6 lg:-mx-8">
      <div className={`dx-growbar-in ${cooks.length || runs.length ? 'multi' : ''}`}>
        <div className="gb-label">
          <b>
            <i className="fa-solid fa-cannabis mr-1 text-weed-500" />
            Grows
          </b>
          <span className="dx-muted text-[10px]">{soon.length ? `Next 24h ~${fmtBricks(soonBricks)} bricks` : ''}</span>
          <button type="button" onClick={() => setTab('weed')}>
            Manage →
          </button>
        </div>
        <div id="dx-timers">
          {shown.length ? (
            shown.map((l) => <GrowMini key={l.id} loc={l} ops={ops} onHarvest={onHarvest} />)
          ) : (
            <div className="dx-gb-empty">No grow locations yet. Add one on the Stash page.</div>
          )}
        </div>
        {cooks.length > 0 && (
          <div className="dx-cookbar">
            <div className="gb-label">
              <b>
                <i className="fa-solid fa-flask mr-1 text-cyan-300" />
                Meth
              </b>
              <button type="button" onClick={() => setTab('meth')}>
                Manage →
              </button>
            </div>
            <div id="dx-cooks">
              {cooks.map((c) => {
                const st = cookState(c, now);
                return (
                  <div key={c.id} className={`dx-gb mx-gb ${st.ready ? 'ready' : 'running'}`} title={`${METH_SIZES[c.size]} yield · ${c.by}`}>
                    <div className="pot">
                      <Beaker level={st.pct} ready={st.ready} />
                    </div>
                    <div className="who">
                      <span className="pid">{METH_SIZES[c.size]} yield</span>
                      <span className="alias">{c.by}</span>
                    </div>
                    <div className="time">
                      {st.ready ? (
                        <>
                          <span className="t">Ready!</span>
                          <span className="s">Collect</span>
                        </>
                      ) : (
                        <>
                          <span className="t">{formatTime(st.left)}</span>
                          <span className="s">{st.cls === 'maybe' ? 'might be ready' : 'cooking'}</span>
                        </>
                      )}
                    </div>
                    <div className="low">
                      {st.ready ? (
                        <button type="button" onClick={() => toast.run(ops.collectCook(c))} className="dx-btn dx-btn-g">
                          <i className="fa-solid fa-check mr-1" />
                          Collected
                        </button>
                      ) : (
                        <>
                          <div className="track">
                            <div className="fill" style={{ width: `${(st.pct * 100).toFixed(2)}%` }} />
                          </div>
                          <div className="eta">Ready {cookTimeLabel(st.readyAt)}</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {runs.length > 0 && (
          <div className="dx-cookbar ck-bar">
            <div className="gb-label">
              <b>
                <i className="fa-solid fa-snowflake mr-1 text-sky-300" />
                Coke
              </b>
              <button type="button" onClick={() => setTab('coke')}>
                Manage →
              </button>
            </div>
            <div id="dx-runs">
              {runs.map((r) => {
                const st = runState(r, now);
                return (
                  <div key={r.id} className={`dx-gb mx-gb ck-gb ${st.ready ? 'ready' : 'running'}`} title={`${runLabel(r)} · ${r.crew}`}>
                    <div className="pot">
                      <i className="fa-solid fa-snowflake" />
                    </div>
                    <div className="who">
                      <span className="pid">{runLabel(r)}</span>
                      <span className="alias">{r.crew}</span>
                    </div>
                    <div className="time">
                      {st.ready ? (
                        <>
                          <span className="t">Done!</span>
                          <span className="s">Press</span>
                        </>
                      ) : (
                        <>
                          <span className="t">{formatTime(st.left)}</span>
                          <span className="s">running</span>
                        </>
                      )}
                    </div>
                    <div className="low">
                      {st.ready ? (
                        <span className="note">Bricks should be ready</span>
                      ) : (
                        <>
                          <div className="track">
                            <div className="fill" style={{ width: `${(st.pct * 100).toFixed(2)}%` }} />
                          </div>
                          <div className="eta">Done {cookTimeLabel(st.readyAt)}</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <Ticker />
    </div>
  );
}

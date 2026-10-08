import { Check, Hourglass, ListChecks, Map as MapIcon, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from '../../hooks/useHub';
import { fmtDate } from '../../lib/format';
import { confirmStep, markStep, setStrikes, STRIKES, unconfirmStep, unmarkStep, wcName, type Onboarding, type WelcomeSettings } from '../../lib/welcome';
import type { Progress } from './useWelcome';

type Mode = 'path' | 'list';
const KEY = 'welcome-view';
const readMode = (): Mode => {
  try {
    return localStorage.getItem(KEY) === 'path' ? 'path' : 'list';
  } catch {
    return 'list';
  }
};

interface Stop {
  id: string;
  label: string;
  sub: string;
  state: 'done' | 'now' | 'wait' | 'lock';
  to?: string;
}

/** The milestones in order; the first one not done is where they are now. */
export function stopsOf(w: WelcomeSettings, p: Progress, ob: Onboarding | null | undefined, memberId: string): Stop[] {
  const raw: (Omit<Stop, 'state'> & { done: boolean; waiting?: boolean })[] = [
    { id: 'rules', label: 'The rules', sub: p.rules ? 'Accepted' : 'Read and accept', done: p.rules, to: '/welcome?tab=rules' },
    { id: 'sheet', label: 'Character sheet', sub: p.sheet ? 'Filled in' : 'Fill it in', done: p.sheet, to: `/members/${memberId}` },
    { id: 'tasks', label: 'Operations', sub: `${p.tasksDone} of ${w.steps.length} signed off`, done: p.tasksDone >= w.steps.length, waiting: p.pending > 0 },
    ...(w.repTarget ? [{ id: 'rep', label: `${w.repTarget.toLocaleString()} rep`, sub: `${Math.min(p.rep, w.repTarget).toLocaleString()} / ${w.repTarget.toLocaleString()}`, done: p.repDone, to: '/petty-crime' }] : []),
    { id: 'rec', label: 'Recommended', sub: ob?.recommended ? `by ${ob.recommended.byName}` : 'A handler puts you up', done: !!ob?.recommended },
  ];
  let found = false;
  return raw.map((r) => {
    let state: Stop['state'] = 'lock';
    if (r.done) state = 'done';
    else if (!found) {
      found = true;
      state = r.waiting ? 'wait' : 'now';
    }
    return { id: r.id, label: r.label, sub: r.sub, to: r.to, state };
  });
}

// A gentle S-curve across the box; stops sit along it.
const pathPoint = (t: number) => ({ x: 6 + t * 80, y: 78 - t * 56 + Math.sin(t * Math.PI * 2) * 14 });
const curve = (upTo = 1) => {
  const pts = Array.from({ length: 41 }, (_, i) => pathPoint((i / 40) * upTo));
  return pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
};

function PathView({ stops, patched }: { stops: Stop[]; patched: boolean }) {
  const at = stops.findIndex((s) => s.state !== 'done');
  const reach = at === -1 ? 1 : at / stops.length;
  return (
    <>
    <ol className="welcome-vpath sm:hidden">
      {stops.map((s, i) => (
        <li key={s.id} className={`welcome-stop-v ${s.state}`}>
          <span className="welcome-dot">{s.state === 'done' ? <Check className="size-5" /> : s.state === 'wait' ? <Hourglass className="size-4" /> : i + 1}</span>
          <span>
            {s.to && s.state !== 'lock' ? <Link to={s.to} className="welcome-v-label">{s.label}</Link> : <b className="welcome-v-label">{s.label}</b>}
            <small>{s.sub}</small>
          </span>
        </li>
      ))}
      <li className="welcome-stop-v">
        <span className={`welcome-patch static ${patched ? 'on' : ''}`}>
          <span>Blooded</span>
          <b>In</b>
        </span>
      </li>
    </ol>
    <div className="welcome-path relative max-sm:hidden">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <path d={curve()} className="welcome-road" vectorEffect="non-scaling-stroke" />
        {reach > 0 && <path d={curve(reach)} className="welcome-road-done" vectorEffect="non-scaling-stroke" />}
      </svg>
      {stops.map((s, i) => {
        const p = pathPoint(i / stops.length);
        const body = (
          <>
            <span className="welcome-dot">{s.state === 'done' ? <Check className="size-5" /> : s.state === 'wait' ? <Hourglass className="size-4" /> : i + 1}</span>
            <b>{s.label}</b>
            <small>{s.sub}</small>
          </>
        );
        return (
          <div key={s.id} className={`welcome-stop ${s.state}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            {s.to && s.state !== 'lock' ? <Link to={s.to}>{body}</Link> : body}
          </div>
        );
      })}
      <div className={`welcome-patch ${patched ? 'on' : ''}`} style={{ left: `${pathPoint(1).x}%`, top: `${pathPoint(1).y}%` }}>
        <span>Blooded</span>
        <b>In</b>
      </div>
    </div>
    </>
  );
}

/** The stamp card (path view) or the plain checklist, for the associate or a handler looking at them. */
export function Road({ memberId, name, w, p, ob, handler }: { memberId: string; name: string; w: WelcomeSettings; p: Progress; ob: Onboarding | null | undefined; handler?: boolean }) {
  const { me } = useHub();
  const [mode, setMode] = useState<Mode>(readMode);
  const self = memberId === me.id;
  const setM = (m: Mode) => {
    setMode(m);
    try {
      localStorage.setItem(KEY, m);
    } catch {
      /* private window */
    }
  };
  const stops = stopsOf(w, p, ob, memberId);
  const { memberById } = useHub();
  const member = memberById.get(memberId);
  // Ready for Oath (the final line) opens once every other topic is signed off by both sides.
  const topicsDone = w.steps.filter((t) => !t.final).every((t) => p.stamps.get(t.id)?.status === 'done');
  const locked = (stepId: string) => !!w.steps.find((t) => t.id === stepId)?.final && !topicsDone;
  const act = (stepId: string) => {
    const s = p.stamps.get(stepId);
    if (locked(stepId) && !s) return <span className="text-[11px] text-smoke">After every topic</span>;
    if (handler && !self) {
      if (s?.status === 'done')
        return (
          <button className="text-[11px] text-smoke hover:text-red-300" onClick={() => unmarkStep(memberId, stepId)}>
            <Undo2 className="inline size-3" /> Undo
          </button>
        );
      if (!s) return <span className="text-[11px] text-smoke">Waiting on {name.split(' ')[0]}</span>;
      return (
        <button className="btn-gold btn-sm" onClick={() => confirmStep(me, memberId, stepId)}>
          <Check className="size-3.5" /> WC sign off
        </button>
      );
    }
    if (!self) return null;
    if (!s)
      return (
        <button className="btn-ghost btn-sm" onClick={() => markStep(me, stepId)}>
          I did it
        </button>
      );
    if (s.status === 'pending')
      return (
        <button className="text-[11px] text-smoke hover:text-red-300" onClick={() => unmarkStep(memberId, stepId)}>
          Take back
        </button>
      );
    return null;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="label text-gold-400">{self ? 'Your progress' : `${name}'s progress`}</p>
            <b className="font-hud text-xl text-gold-200">{p.pct}%</b>
          </div>
          <div className="welcome-bar mt-1.5">
            <i style={{ width: `${p.pct}%` }} />
          </div>
        </div>
        <div className="flex border border-line">
          <button className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${mode === 'path' ? 'bg-gold-500/15 text-gold-200' : 'text-smoke'}`} onClick={() => setM('path')}>
            <MapIcon className="size-3.5" /> Path
          </button>
          <button className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs ${mode === 'list' ? 'bg-gold-500/15 text-gold-200' : 'text-smoke'}`} onClick={() => setM('list')}>
            <ListChecks className="size-3.5" /> Sheet
          </button>
        </div>
      </div>

      {mode === 'path' ? (
        <>
          <PathView stops={stops} patched={!!ob?.graduatedAt} />
          <div className="welcome-card">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <p className="label text-[9px] text-gold-500">The Chosen · Associate card</p>
                <p className="font-display text-2xl text-gold-100">{name}</p>
              </div>
              <p className="font-hud text-3xl font-bold text-gold-300">
                {p.tasksDone}/{w.steps.length}
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {w.steps.map((t, i) => {
                const s = p.stamps.get(t.id);
                return (
                  <div key={t.id} className={`welcome-stamp ${s?.status ?? ''}`} style={{ ['--tilt' as string]: `${((i * 7) % 9) - 4}deg` }}>
                    <span className="welcome-stamp-title">{t.title}</span>
                    {t.detail && <span className="welcome-stamp-detail">{t.detail}</span>}
                    <span className="welcome-stamp-foot">
                      {s?.status === 'done' ? `Signed off · ${wcName(s)}` : s?.status === 'pending' ? 'Waiting on a WC' : ''}
                    </span>
                    <span className="mt-auto pt-1.5">{act(t.id)}</span>
                  </div>
                );
              })}
              {!w.steps.length && <p className="col-span-full text-sm text-smoke">No operations set yet.</p>}
            </div>
            <p className="mt-4 text-xs text-gold-200/60">Fill every stamp and hit the milestones, and a handler can put you up to High Table.</p>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {/* The associate sheet: name, join date, warnings and strikes, then every topic with both sign-offs. */}
          <div className="assoc-sheet">
            <div className="assoc-head">
              <div className="assoc-id">
                <span className="assoc-k">Name</span>
                <span className="assoc-v">{name}</span>
                <span className="assoc-k">Associate join date</span>
                <span className="assoc-v">{member?.joinedAt ? fmtDate(member.joinedAt) : '—'}</span>
              </div>
              <div className="assoc-strikes">
                {STRIKES.map((x) => {
                  const on = (ob?.strikes ?? 0) >= x.n;
                  const can = handler && !self;
                  return (
                    <button
                      key={x.n}
                      type="button"
                      disabled={!can}
                      title={can ? (on ? 'Click to take back' : `Give a ${x.label.toLowerCase()}`) : ob?.strikesBy ? `Set by ${ob.strikesBy}` : x.label}
                      onClick={() => can && setStrikes(me, memberId, (ob?.strikes ?? 0) === x.n ? x.n - 1 : x.n)}
                      className={`assoc-strike ${on ? 'on' : ''}`}
                      style={{ ['--c' as string]: x.color }}
                    >
                      <span>{x.label}</span>
                      <i className="assoc-box">{on && <Check className="size-3.5" strokeWidth={3} />}</i>
                    </button>
                  );
                })}
              </div>
            </div>
            <table className="assoc-table">
              <thead>
                <tr>
                  <th>Training topic</th>
                  <th>Associate sign off</th>
                  <th>WC sign off</th>
                  <th>Name of WC</th>
                </tr>
              </thead>
              <tbody>
                {w.steps.map((t) => {
                  const st = p.stamps.get(t.id);
                  const lock = locked(t.id);
                  const mineToSign = self && !st && !lock;
                  const mineToTake = self && st?.status === 'pending';
                  const wcCan = handler && !self && !!st;
                  return (
                    <tr key={t.id} className={`${t.final ? 'assoc-final' : ''} ${lock && !st ? 'assoc-locked' : ''}`}>
                      <td>
                        <span className="text-gold-100">{t.title}</span>
                        {t.detail && <span className="block text-[11px] text-smoke">{t.detail}</span>}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`assoc-box ${st ? 'on' : ''}`}
                          disabled={!(mineToSign || mineToTake)}
                          title={mineToSign ? 'Sign off: I’ve done this' : mineToTake ? 'Take my sign-off back' : lock ? 'Opens once every topic is signed off' : st ? 'Signed off' : ''}
                          onClick={() => (mineToSign ? markStep(me, t.id) : mineToTake ? unmarkStep(memberId, t.id) : undefined)}
                        >
                          {st && <Check className="size-3.5" strokeWidth={3} />}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`assoc-box ${st?.status === 'done' ? 'on wc' : ''}`}
                          disabled={!wcCan}
                          title={!st ? `Waiting on ${self ? 'you' : name.split(' ')[0]} to sign first` : wcCan ? (st.status === 'done' ? 'Take the WC sign-off back' : 'WC sign off') : st.status === 'done' ? 'Signed off' : 'Waiting on a WC'}
                          onClick={() => wcCan && (st!.status === 'done' ? unconfirmStep(memberId, t.id) : confirmStep(me, memberId, t.id))}
                        >
                          {st?.status === 'done' && <Check className="size-3.5" strokeWidth={3} />}
                        </button>
                      </td>
                      <td className="text-sm text-gold-200">{wcName(st)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ul className="hud divide-y divide-line-soft">
            {[
              { id: 'rules', title: 'Read and accept the rules', done: p.rules, to: '/welcome?tab=rules' },
              { id: 'sheet', title: 'Fill in your character sheet', done: p.sheet, to: `/members/${memberId}` },
              ...(w.repTarget ? [{ id: 'rep', title: `Earn ${w.repTarget.toLocaleString()} rep (${Math.min(p.rep, w.repTarget).toLocaleString()} so far)`, done: p.repDone, to: '/petty-crime' }] : []),
              { id: 'rec', title: ob?.recommended ? `Recommended to High Table by ${ob.recommended.byName}` : 'Get recommended to High Table', done: !!ob?.recommended },
            ].map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className={`grid size-5 shrink-0 place-items-center border ${x.done ? 'border-ok bg-ok/20 text-ok' : 'border-gold-600'}`}>{x.done && <Check className="size-3.5" />}</span>
                {'to' in x && x.to && self && !x.done ? (
                  <Link to={x.to} className="text-gold-100 hover:text-gold-300">
                    {x.title}
                  </Link>
                ) : (
                  <span className={x.done ? 'text-ash' : 'text-gold-100'}>{x.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

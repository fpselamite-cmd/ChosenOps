import { Check, Hourglass, ListChecks, Map as MapIcon, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from '../../hooks/useHub';
import { confirmStep, markStep, unmarkStep, type Onboarding, type WelcomeSettings } from '../../lib/welcome';
import type { Progress } from './useWelcome';

type Mode = 'path' | 'list';
const KEY = 'welcome-view';
const readMode = (): Mode => {
  try {
    return localStorage.getItem(KEY) === 'list' ? 'list' : 'path';
  } catch {
    return 'path';
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
  const act = (stepId: string) => {
    const s = p.stamps.get(stepId);
    if (handler && !self) {
      if (s?.status === 'done')
        return (
          <button className="text-[11px] text-smoke hover:text-red-300" onClick={() => unmarkStep(memberId, stepId)}>
            <Undo2 className="inline size-3" /> Undo
          </button>
        );
      return (
        <button className="btn-gold btn-sm" onClick={() => confirmStep(me, memberId, stepId)}>
          <Check className="size-3.5" /> {s ? 'Confirm' : 'Sign off'}
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
            <ListChecks className="size-3.5" /> Checklist
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
                      {s?.status === 'done' ? `Signed off · ${s.byName}` : s?.status === 'pending' ? 'Waiting on a handler' : ''}
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
        <ul className="hud divide-y divide-line-soft">
          {[
            { id: 'rules', title: 'Read and accept the rules', done: p.rules, tag: p.rules ? 'Done' : '', to: '/welcome?tab=rules' },
            { id: 'sheet', title: 'Fill in your character sheet', done: p.sheet, tag: p.sheet ? 'Done' : '', to: `/members/${memberId}` },
            ...w.steps.map((t) => {
              const s = p.stamps.get(t.id);
              return { id: t.id, title: t.title, detail: t.detail, done: s?.status === 'done', wait: s?.status === 'pending', tag: s?.status === 'done' ? `Signed off · ${s.byName}` : s?.status === 'pending' ? 'Waiting on a handler' : '', step: true };
            }),
            ...(w.repTarget ? [{ id: 'rep', title: `Earn ${w.repTarget.toLocaleString()} rep`, detail: `${p.rep.toLocaleString()} so far`, done: p.repDone, tag: p.repDone ? 'Done' : '', to: '/petty-crime' }] : []),
            { id: 'rec', title: 'Get recommended to High Table', done: !!ob?.recommended, tag: ob?.recommended ? `By ${ob.recommended.byName}` : '' },
          ].map((r) => {
            const x = r as typeof r & { detail?: string; wait?: boolean; step?: boolean; to?: string };
            return (
              <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className={`grid size-5 shrink-0 place-items-center border ${x.done ? 'border-ok bg-ok/20 text-ok' : x.wait ? 'border-yellow-400 text-yellow-300' : 'border-gold-600'}`}>
                  {x.done ? <Check className="size-3.5" /> : x.wait ? <Hourglass className="size-3" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  {x.to && self && !x.done ? (
                    <Link to={x.to} className="text-gold-100 hover:text-gold-300">
                      {x.title}
                    </Link>
                  ) : (
                    <span className={x.done ? 'text-ash' : 'text-gold-100'}>{x.title}</span>
                  )}
                  {x.detail && <span className="block text-xs text-smoke">{x.detail}</span>}
                </span>
                {x.tag && <span className={`text-xs ${x.done ? 'text-ok' : 'text-yellow-300'}`}>{x.tag}</span>}
                {x.step && act(x.id)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

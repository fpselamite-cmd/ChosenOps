import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { logoSrc, STRAIN_BY_ID, type StrainId } from './data';
import type { Done } from './ops';

// ---------- Toasts with Undo (NoelOps' corner notifications) ----------

const UNDO_MS = 8000;
const ICONS = { success: 'fa-circle-check text-weed-400', warning: 'fa-triangle-exclamation text-amber-400', info: 'fa-circle-info text-indigo-300' };
type ToastType = keyof typeof ICONS;

interface Toast {
  id: number;
  type: ToastType;
  text: string;
  key?: string;
  undos?: (() => Promise<unknown>)[];
  out?: boolean;
  until: number;
}

interface ToastApi {
  /** Shows what an action did, with an Undo button for 8 seconds. Repeat presses with the same key merge. */
  done: (d: Done | null | undefined) => void;
  alert: (text: string, type?: ToastType) => void;
  /** Runs an action, shows its result, and reports failures. */
  run: (p: Promise<Done | null | undefined | void>) => Promise<void>;
}

const ToastCtx = createContext<ToastApi | null>(null);

/** `gold` renders the same toasts in ChosenOps' gold style (the Stash page). */
export function ToastProvider({ children, gold }: { children: ReactNode; gold?: boolean }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      setToasts((list) => {
        if (!list.some((x) => x.until <= now)) return list;
        return list.filter((x) => x.until > now - 300).map((x) => (x.until <= now ? { ...x, out: true } : x));
      });
    }, 250);
    return () => clearInterval(t);
  }, []);

  const push = useCallback((t: Omit<Toast, 'id' | 'until'>, ms: number) => {
    setToasts((list) => {
      const live = t.key ? list.find((x) => x.key === t.key && !x.out && x.undos) : undefined;
      if (live) {
        return list.map((x) =>
          x === live ? { ...x, text: t.text, undos: [...(x.undos ?? []), ...(t.undos ?? [])], until: Date.now() + ms } : x,
        );
      }
      return [...list, { ...t, id: ++seq.current, until: Date.now() + ms }].slice(-4);
    });
  }, []);

  const api: ToastApi = {
    done: (d) => {
      if (!d) return;
      push({ type: 'success', text: d.text, key: d.key, undos: d.undo ? [d.undo] : undefined }, UNDO_MS);
    },
    alert: (text, type = 'info') => push({ type, text }, type === 'warning' ? 6500 : 4500),
    run: async (p) => {
      try {
        const d = await p;
        if (d) api.done(d);
      } catch (e) {
        console.error(e);
        api.alert("That didn't save. You may not have permission, or the connection dropped.", 'warning');
      }
    },
  };

  async function undo(t: Toast) {
    setToasts((list) => list.filter((x) => x.id !== t.id));
    try {
      // Newest first, so merged presses unwind in order.
      for (const u of [...(t.undos ?? [])].reverse()) await u();
      api.alert('Undone.');
    } catch {
      api.alert("Couldn't undo that.", 'warning');
    }
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {gold ? (
        <div className="fixed right-4 bottom-24 z-50 flex w-[min(92vw,380px)] flex-col gap-2 lg:bottom-6" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`hud flex items-center gap-3 px-4 py-3 text-sm text-bone shadow-2xl transition-opacity ${t.out ? 'opacity-0' : ''}`}>
              <span className={t.type === 'warning' ? 'text-warn' : 'text-gold-300'}>{t.type === 'warning' ? '!' : '✓'}</span>
              <span className="flex-1">{t.text}</span>
              {t.undos && (
                <button type="button" className="btn-ghost btn-sm" onClick={() => undo(t)}>
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="dx-toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`dx-toast ${t.type} ${t.out ? 'out' : ''}`}>
              <i className={`fa-solid ${ICONS[t.type]}`} />
              <span className="flex-1">{t.text}</span>
              {t.undos && (
                <button type="button" className="dx-undo" onClick={() => undo(t)}>
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const t = useContext(ToastCtx);
  if (!t) throw new Error('useToast outside ToastProvider');
  return t;
}

// ---------- Logos ----------

export function Logo({ id, className = '' }: { id: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  const name = STRAIN_BY_ID[id as StrainId]?.name ?? id;
  if (missing)
    return (
      <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-weed-800 bg-weed-950/80 p-2 text-center text-[10px] font-bold text-weed-400">
        <i className="fa-solid fa-cannabis mb-1 text-2xl text-weed-400" />
        <span>No Logo</span>
      </div>
    );
  return (
    <img
      src={logoSrc(id)}
      alt={name}
      onError={() => setMissing(true)}
      className={`h-full w-full rounded-xl object-contain drop-shadow-md transition-transform duration-200 hover:scale-105 ${className}`}
    />
  );
}

/** The Coke Bricks card shows both stickers (small in front, large behind). */
export function CokePair() {
  return (
    <span className="dx-logo-pair">
      <span>
        <Logo id="cokeLarge" />
      </span>
      <span>
        <Logo id="cokeSmall" />
      </span>
    </span>
  );
}

export const Holo = () => (
  <>
    <span className="fx-foil" />
    <span className="fx-glare" />
  </>
);

/** Holo cards tilt toward the pointer. */
export function useHolo() {
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const card = (e.target as Element)?.closest?.('.noel .fx-holo') as HTMLElement | null;
      if (!card) return;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      card.style.transform = `perspective(800px) rotateY(${((px - 0.5) * 16).toFixed(2)}deg) rotateX(${((0.5 - py) * 16).toFixed(2)}deg)`;
      card.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
      card.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
    };
    const out = (e: PointerEvent) => {
      const card = (e.target as Element)?.closest?.('.noel .fx-holo') as HTMLElement | null;
      if (card && !card.contains(e.relatedTarget as Node)) card.style.transform = '';
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerout', out);
    return () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', out);
    };
  }, []);
}

// ---------- Celebrations ----------

/** Leaves float up on a harvest, a brick stamps down on a press. */
export function celebrate(kind: 'harvest' | 'press', at: { x: number; y: number }, label = '') {
  const root = document.querySelector('.noel');
  if (!root || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.className = 'fx-layer';
  const place = (node: HTMLElement) => {
    node.style.left = `${at.x}px`;
    node.style.top = `${at.y}px`;
    layer.appendChild(node);
  };
  if (kind === 'harvest') {
    for (let i = 0; i < 10; i++) {
      const leaf = document.createElement('i');
      leaf.className = 'fa-solid fa-cannabis fx-leaf';
      leaf.style.fontSize = `${12 + Math.random() * 14}px`;
      leaf.style.setProperty('--dx', `${Math.round(Math.random() * 180 - 90)}px`);
      leaf.style.setProperty('--dy', `${-Math.round(60 + Math.random() * 100)}px`);
      leaf.style.setProperty('--r', `${Math.round(Math.random() * 300 - 150)}deg`);
      leaf.style.animationDelay = `${i * 40}ms`;
      place(leaf);
    }
  } else {
    const brick = document.createElement('div');
    brick.className = 'fx-brick';
    brick.textContent = label.slice(0, 4).toUpperCase();
    place(brick);
  }
  root.appendChild(layer);
  setTimeout(() => layer.remove(), 1800);
}

export const centerOf = (el: Element | null) => {
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 };
};

// ---------- Small pieces ----------

export function Empty({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="fx-empty">
      <div className="art">
        <i className="fa-solid fa-cannabis" />
        <i className="fa-solid fa-cannabis" />
        <i className="fa-solid fa-cannabis" />
      </div>
      <b>{title}</b>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function NoelModal({ onClose, children, wide, onSubmit }: { onClose: () => void; children: ReactNode; wide?: boolean; onSubmit?: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="dx-modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className={`dx-glass dx-modal-card space-y-3 text-left ${wide ? 'dx-modal-wide' : ''}`}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.();
        }}
      >
        {children}
      </form>
    </div>
  );
}

const BEAKER_PATH = 'M16 6h8v13l11 21a3 3 0 0 1-2.7 4.4H7.7A3 3 0 0 1 5 40l11-21z';
let beakerSeq = 0;
/** The meth beaker: liquid level 0..1 with rising bubbles. */
export function Beaker({ level, ready }: { level: number; ready?: boolean }) {
  const [id] = useState(() => `bk${++beakerSeq}`);
  const y = (44.4 - 26 * Math.max(0.08, Math.min(1, level))).toFixed(1);
  return (
    <svg className={`bk ${ready ? 'ready' : ''}`} viewBox="0 0 40 48" aria-hidden="true">
      <defs>
        <clipPath id={id}>
          <path d={BEAKER_PATH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <rect className="bk-liq" x="0" y={y} width="40" height="48" />
        <circle className="bk-b" cx="15" cy="41" r="2" />
        <circle className="bk-b b2" cx="22" cy="42" r="1.6" />
        <circle className="bk-b b3" cx="26" cy="40" r="1.8" />
      </g>
      <path className="bk-glass" d={BEAKER_PATH} />
      <path className="bk-rim" d="M13.5 5.5h13" />
    </svg>
  );
}

/** NoelOps' stopwatch icon (the hand slowly sweeps round). */
export const Stopwatch = () => (
  <svg className="stw" viewBox="0 0 40 48" aria-hidden="true">
    <path className="sw-top" d="M15 5.5h10M20 5.5v6.5M32 15.5l3-3" />
    <circle className="sw-body" cx="20" cy="29" r="15" />
    <circle className="sw-dot" cx="20" cy="29" r="2.2" />
    <path className="sw-hand" d="M20 29V18.5" />
  </svg>
);

/** Chart hover tips (anything with data-tip). */
export function useChartTips() {
  useEffect(() => {
    let tip = document.getElementById('dx-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'dx-tip';
      tip.className = 'hidden';
      document.querySelector('.noel')?.appendChild(tip);
    }
    const t = tip;
    const place = (e: MouseEvent, el: HTMLElement) => {
      t.innerHTML = el.dataset.tip ?? '';
      t.classList.remove('hidden');
      const x = Math.min(innerWidth - t.offsetWidth - 8, e.clientX + 14);
      const y = e.clientY - t.offsetHeight - 12 < 8 ? e.clientY + 16 : e.clientY - t.offsetHeight - 12;
      t.style.left = `${Math.max(8, x)}px`;
      t.style.top = `${y}px`;
    };
    const move = (e: MouseEvent) => {
      const el = (e.target as Element)?.closest?.('[data-tip]') as HTMLElement | null;
      if (el) place(e, el);
      else t.classList.add('hidden');
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('click', move);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('click', move);
      t.remove();
    };
  }, []);
}

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Page title block: serif gold title, small HUD kicker and an optional action area. */
export function PageHeader({
  icon: Icon,
  kicker,
  title,
  sub,
  actions,
}: {
  icon: LucideIcon;
  kicker: string;
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label t-accent flex items-center gap-2 text-gold-500">
          <Icon className="size-3.5" /> {kicker}
        </p>
        {/* Lettered like the seal: Cinzel foil with a couple of stars caught in it. */}
        <div className="title-sky relative mt-1 inline-block pr-6">
          <h1 className="foil foil-animate font-display text-3xl font-bold tracking-[0.06em] sm:text-[2.6rem]">{title}</h1>
          <span className="star4 twinkle absolute -top-1 right-0 size-3.5" aria-hidden />
          <span className="star4 twinkle absolute top-1/2 -left-3 size-2 [animation-delay:1.3s]" aria-hidden />
          <div className="constellation draw mt-1 w-[min(320px,100%)]" aria-hidden />
        </div>
        {sub && <p className="mt-2 max-w-2xl text-sm text-ash">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

/** HUD panel with a bracketed title row. */
export function Panel({
  title,
  right,
  children,
  className = '',
  pad = true,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section className={`hud rise ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
          <h2 className="t-soft font-hud text-sm font-bold tracking-[0.16em] text-gold-300 uppercase">
            <span className="star4 t-accent mr-1.5 inline-block size-2.5 align-[-1px]" aria-hidden />
            {title}
          </h2>
          {right}
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

/** Big number tile for dashboards and stats. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="hud px-4 py-3">
      <p className="label">{label}</p>
      <p className="t-soft mt-1 font-mono text-2xl font-semibold text-gold-100">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-smoke">{sub}</p>}
    </div>
  );
}

/** Segmented tab switcher. */
export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: ReactNode }[];
}) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px border-b-2 px-3 py-2 font-hud text-sm font-bold tracking-[0.12em] uppercase transition ${
            value === t.id ? 't-tab-on border-gold-400 text-gold-200' : 'border-transparent text-smoke hover:text-gold-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

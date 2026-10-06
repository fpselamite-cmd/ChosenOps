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
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="label flex items-center gap-2 text-gold-500">
          <Icon className="size-3.5" /> {kicker}
        </p>
        <h1 className="foil mt-1 font-display text-3xl font-bold tracking-wide sm:text-4xl">{title}</h1>
        {sub && <p className="mt-1.5 max-w-2xl text-sm text-ash">{sub}</p>}
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
    <section className={`hud ${className}`}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-2.5">
          <h2 className="font-hud text-sm font-bold tracking-[0.16em] text-gold-300 uppercase">
            <span className="text-gold-600">[</span> {title} <span className="text-gold-600">]</span>
          </h2>
          {right}
        </div>
      )}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

/** Big number tile for dashboards and crew stats. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="hud px-4 py-3">
      <p className="label">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-gold-100">{value}</p>
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
            value === t.id ? 'border-gold-400 text-gold-200' : 'border-transparent text-smoke hover:text-gold-200'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

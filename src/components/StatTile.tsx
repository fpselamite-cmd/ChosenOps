import type { Currency } from '../lib/types';
import { CURRENCY_META, formatAmount } from '../lib/format';

const ICONS: Record<Currency, string> = { clean: '$', dirty: '✦', rep: '♜' };

export function StatTile({ type, value, hint }: { type: Currency; value: number; hint?: string }) {
  const meta = CURRENCY_META[type];
  return (
    <div className={`panel relative overflow-hidden p-5 ${type === 'rep' ? 'border-rep/30' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-smoke">{meta.label}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-full border text-sm ${meta.bg} ${meta.color}`}>{ICONS[type]}</span>
      </div>
      <div className={`mt-3 font-display text-3xl font-bold ${value < 0 ? 'text-red-400' : meta.color}`}>{formatAmount(type, value)}</div>
      {hint && <div className="mt-1 text-xs text-smoke">{hint}</div>}
    </div>
  );
}

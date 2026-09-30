import type { CharacterStatus } from '../lib/types';

const COLORS: Record<CharacterStatus, string> = {
  Active: 'bg-emerald-500',
  'Laying Low': 'bg-sky-500',
  Jailed: 'bg-orange-500',
  Hospitalized: 'bg-rose-400',
  MIA: 'bg-zinc-500',
  Deceased: 'bg-zinc-700',
};

export function StatusPill({ status }: { status?: CharacterStatus }) {
  const s = status || 'Active';
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-smoke">
      <span className={`h-2 w-2 rounded-full ${COLORS[s]}`} />
      {s}
    </span>
  );
}

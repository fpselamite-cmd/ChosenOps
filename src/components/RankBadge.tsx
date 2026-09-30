import type { Rank } from '../lib/types';

export function RankBadge({ rank, className = '' }: { rank?: Rank | null; className?: string }) {
  if (!rank) return <span className={`text-xs text-smoke ${className}`}>Unranked</span>;
  const color = rank.color || '#d4af37';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[11px] font-bold uppercase tracking-wider ${className}`}
      style={{ color, borderColor: `${color}66`, background: `${color}14` }}
    >
      {rank.order === 0 && <span aria-hidden>♛</span>}
      {rank.name}
    </span>
  );
}

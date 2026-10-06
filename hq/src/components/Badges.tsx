import { Crown } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Crew, Rank } from '../lib/types';

/** Rank as a gold chip. Leadership ranks get a crown. */
export function RankBadge({ rank, className = '' }: { rank?: Rank; className?: string }) {
  if (!rank) return <span className={`chip bg-raised text-smoke ${className}`}>Unranked</span>;
  const top = rank.order === 0;
  return (
    <span
      className={`chip ${top ? 'bg-gold-400 text-void' : rank.leadership ? 'bg-gold-700/60 text-gold-100' : 'bg-gold-900/70 text-gold-200'} ${className}`}
    >
      {rank.leadership && <Crown className="size-3" />}
      {rank.name}
    </span>
  );
}

/** Crew chip in the crew's own color. Links to the crew page. */
export function CrewChip({ crew, link = true, full = false }: { crew: Crew; link?: boolean; full?: boolean }) {
  const body = (
    <span
      className="chip text-void"
      style={{ background: crew.color }}
      title={crew.name}
    >
      {full ? crew.name : crew.tag}
    </span>
  );
  return link ? (
    <Link to={`/crews/${crew.id}`} className="hover:brightness-110">
      {body}
    </Link>
  ) : (
    body
  );
}

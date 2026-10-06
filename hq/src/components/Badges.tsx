import { Crown } from 'lucide-react';
import type React from 'react';
import { Link } from 'react-router-dom';
import type { Crew, Rank } from '../lib/types';

/** Rank as a gold chip. Leadership ranks get a crown. */
export function RankBadge({ rank, className = '' }: { rank?: Rank; className?: string }) {
  if (!rank) return <span className={`seal ${className}`} style={{ '--seal': '#3a3a44' } as React.CSSProperties}>Unranked</span>;
  const top = rank.order === 0;
  // Wax seals: the Boss in gold-brown, leadership in deep red, everyone else in wine.
  const wax = top ? '#7a5a10' : rank.leadership ? '#8e1b22' : '#4a1a26';
  return (
    <span className={`seal ${className}`} style={{ '--seal': wax } as React.CSSProperties}>
      {rank.leadership && <Crown className="-ml-0.5 size-3 text-gold-200" />}
      {rank.name}
    </span>
  );
}

/** Crew chip in the crew's own color. Links to the crew page. */
export function CrewChip({ crew, link = true, full = false }: { crew: Crew; link?: boolean; full?: boolean }) {
  const body = (
    <span className="seal" style={{ '--seal': crew.color } as React.CSSProperties} title={crew.name}>
      {full ? crew.name : crew.tag}
    </span>
  );
  return link ? (
    <Link to={`/crews?crew=${crew.id}`} className="hover:brightness-110">
      {body}
    </Link>
  ) : (
    body
  );
}

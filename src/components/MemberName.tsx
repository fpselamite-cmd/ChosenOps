import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { useLore } from '../hooks/useLore';
import { displayName } from '../lib/format';
import type { Member } from '../lib/types';
import { Avatar } from './Avatar';
import { RankBadge } from './RankBadge';
import { StatusPill } from './StatusPill';

/**
 * A member's name that links to their profile and shows a quick-look card on hover/focus.
 * Pass `children` to wrap something other than the plain name (e.g. an avatar card).
 */
export function MemberName({
  id,
  children,
  className = '',
}: {
  id: string | null | undefined;
  children?: ReactNode;
  className?: string;
}) {
  const { memberById } = useHub();
  const member = id ? memberById.get(id) : undefined;
  const anchor = useRef<HTMLAnchorElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);
  const timer = useRef<number>(undefined);

  const show = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const above = r.bottom + 190 > window.innerHeight;
      const x = Math.min(Math.max(r.left + r.width / 2, 150), window.innerWidth - 150);
      setPos({ x, y: above ? r.top - 8 : r.bottom + 8, above });
    }, 220);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPos(null), 120);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!member) return <span className={`text-smoke ${className}`}>{children ?? 'Unknown'}</span>;

  return (
    <>
      <Link
        ref={anchor}
        to={`/members/${member.id}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        className={children ? className : `font-medium text-gold-200 hover:text-gold-50 hover:underline ${className}`}
      >
        {children ?? displayName(member)}
      </Link>
      {pos &&
        createPortal(
          <div
            onMouseEnter={() => window.clearTimeout(timer.current)}
            onMouseLeave={hide}
            className="fixed z-50 w-[280px]"
            style={{ left: pos.x, top: pos.y, transform: `translate(-50%, ${pos.above ? '-100%' : '0'})` }}
          >
            <HoverCard member={member} />
          </div>,
          document.body,
        )}
    </>
  );
}

function HoverCard({ member }: { member: Member }) {
  const { rankById, memberById } = useHub();
  const rank = member.rankId ? rankById.get(member.rankId) : null;
  const c = member.character ?? {};
  const boss = member.reportsTo ? memberById.get(member.reportsTo) : null;
  const { tiesOf, lore } = useLore();
  const ties = tiesOf(member.id).length;
  const written = lore.filter((l) => l.authorId === member.id).length;
  return (
    <div className="panel animate-[fadein_.12s_ease-out] overflow-hidden border-gold-700/60 p-0">
      <div className="h-1 bg-gradient-to-r from-gold-700 via-gold-300 to-gold-700" />
      <div className="flex gap-3 p-3">
        <Avatar member={member} size="md" ring />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-bold text-bone">{displayName(member)}</div>
          {c.alias && <div className="truncate text-xs italic text-gold-300">“{c.alias}”</div>}
          <div className="mt-1">
            <RankBadge rank={rank} />
          </div>
        </div>
      </div>
      {c.quote && <p className="border-t border-edge px-3 py-2 font-serif text-sm italic text-parchment/85">❝ {c.quote} ❞</p>}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-edge px-3 py-2 text-xs">
        <span className="text-smoke">Status</span>
        <StatusPill status={c.characterStatus} />
        {c.specialty && (
          <>
            <span className="text-smoke">Specialty</span>
            <span className="truncate">{c.specialty}</span>
          </>
        )}
        {ties > 0 && (
          <>
            <span className="text-smoke">Ties</span>
            <span>{ties}</span>
          </>
        )}
        {written > 0 && (
          <>
            <span className="text-smoke">Lore written</span>
            <span>{written}</span>
          </>
        )}
        {boss && (
          <>
            <span className="text-smoke">Answers to</span>
            <span className="truncate">{displayName(boss)}</span>
          </>
        )}
        <span className="text-smoke">Player</span>
        <span className="truncate text-smoke">@{member.username}</span>
      </div>
    </div>
  );
}

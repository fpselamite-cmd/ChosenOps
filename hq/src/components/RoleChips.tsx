import { useHub } from '../hooks/useHub';
import { RoleRibbon } from './Badges';

/** The roles someone holds, as ribbons: High Table roles first. */
export function RoleChips({ memberId, className = '', size = 'sm' }: { memberId: string; className?: string; size?: 'sm' | 'lg' }) {
  const { rolesOf } = useHub();
  const list = [...rolesOf(memberId)].sort((a, b) => Number(!!b.lead) - Number(!!a.lead) || Number(!!a.honor) - Number(!!b.honor) || a.order - b.order);
  if (!list.length) return null;
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
      {list.map((r) => (
        <RoleRibbon key={r.id} role={r} size={size} />
      ))}
    </span>
  );
}

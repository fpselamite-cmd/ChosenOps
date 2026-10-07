import { useHub } from '../hooks/useHub';

/** Plain chips for the roles someone holds. (The chip and badge look is being redesigned.) */
export function RoleChips({ memberId, className = '' }: { memberId: string; className?: string }) {
  const { rolesOf } = useHub();
  const list = rolesOf(memberId);
  if (!list.length) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {list.map((r) => (
        <span key={r.id} title={r.note} className={`chip px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase ${r.honor ? 'bg-sky-500/10 text-sky-300 ring-1 ring-sky-400/30' : 'bg-gold-400/10 text-gold-200 ring-1 ring-gold-400/30'}`}>
          {r.name}
        </span>
      ))}
    </span>
  );
}

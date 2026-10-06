import { Link } from 'react-router-dom';
import { useHub } from '../hooks/useHub';

/** A member's name that links to their profile. */
export function MemberName({ id, className = '' }: { id?: string | null; className?: string }) {
  const { memberById } = useHub();
  const m = id ? memberById.get(id) : undefined;
  if (!m) return <span className={`text-smoke ${className}`}>Unknown</span>;
  return (
    <Link to={`/members/${m.id}`} className={`font-semibold text-gold-100 hover:text-gold-300 hover:underline ${className}`}>
      {m.name}
    </Link>
  );
}

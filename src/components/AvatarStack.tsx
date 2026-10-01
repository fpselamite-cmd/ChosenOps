import { useHub } from '../hooks/useHub';
import { Avatar } from './Avatar';
import { MemberName } from './MemberName';

/** Overlapping avatar row of tagged characters, each with a hover card. */
export function AvatarStack({ ids, max = 6 }: { ids: string[]; max?: number }) {
  const { memberById } = useHub();
  const shown = ids.filter((id) => memberById.has(id));
  if (!shown.length) return null;
  return (
    <div className="flex items-center">
      {shown.slice(0, max).map((id, i) => (
        <MemberName key={id} id={id} className={`${i ? '-ml-2' : ''} rounded-full ring-2 ring-panel`}>
          <Avatar member={memberById.get(id)} size="xs" />
        </MemberName>
      ))}
      {shown.length > max && <span className="ml-1.5 text-xs text-smoke">+{shown.length - max}</span>}
    </div>
  );
}

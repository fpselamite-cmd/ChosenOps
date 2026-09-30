import type { Member } from '../lib/types';
import { displayName } from '../lib/format';

const SIZES = { xs: 'h-6 w-6 text-[10px]', sm: 'h-9 w-9 text-xs', md: 'h-14 w-14 text-base', lg: 'h-24 w-24 text-2xl', xl: 'h-40 w-40 text-4xl' };

export function Avatar({ member, size = 'sm', ring = false }: { member?: Member | null; size?: keyof typeof SIZES; ring?: boolean }) {
  const name = displayName(member);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const cls = `${SIZES[size]} shrink-0 rounded-full object-cover ${ring ? 'ring-2 ring-gold-500/70 ring-offset-2 ring-offset-ink' : 'border border-edge'}`;
  if (member?.avatar) return <img src={member.avatar} alt={name} className={cls} />;
  return (
    <div className={`${cls} grid place-items-center bg-gradient-to-br from-coal to-panel font-display font-bold text-gold-400`}>
      {initials || '?'}
    </div>
  );
}

import { initials } from '../lib/format';
import type { Member } from '../lib/types';
import { PartyHat } from './PartyHat';

const SIZES = { xs: 'size-6 text-[9px]', sm: 'size-8 text-[11px]', md: 'size-11 text-sm', lg: 'size-16 text-lg', xl: 'size-24 text-2xl' };

export function Avatar({
  member,
  size = 'sm',
  online,
  ring,
}: {
  member?: Pick<Member, 'name' | 'avatar'> | null;
  size?: keyof typeof SIZES;
  online?: boolean;
  /** A colored ring around the picture. */
  ring?: string;
}) {
  const name = member?.name ?? '?';
  return (
    <span className={`relative inline-flex shrink-0 ${SIZES[size]}`}>
      <span
        className="flex size-full items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-gold-700 to-gold-900 font-hud font-bold text-gold-100 ring-1 ring-gold-500/50"
        style={ring ? { boxShadow: `0 0 0 2px ${ring}` } : undefined}
      >
        {member?.avatar ? <img src={member.avatar} alt="" className="size-full object-cover" /> : initials(name)}
      </span>
      <PartyHat id={(member as { id?: string } | null | undefined)?.id} />
      {online !== undefined && (
        <span
          className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-void ${online ? 'online-dot bg-ok' : 'bg-smoke/50'}`}
        />
      )}
    </span>
  );
}

export function AvatarStack({ members, max = 5 }: { members: Member[]; max?: number }) {
  const shown = members.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((m) => (
        <span key={m.id} className="-ml-2 first:ml-0">
          <Avatar member={m} size="xs" />
        </span>
      ))}
      {members.length > max && <span className="ml-1.5 font-mono text-[11px] text-smoke">+{members.length - max}</span>}
    </span>
  );
}

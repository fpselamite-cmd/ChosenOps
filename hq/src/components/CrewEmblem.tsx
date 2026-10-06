import type { Crew } from '../lib/types';

const SIZES = { sm: 'size-9 text-[11px]', md: 'size-14 text-sm', lg: 'size-24 text-xl' };

/** The crew's uploaded emblem, or a shield with its tag in the crew color. */
export function CrewEmblem({ crew, size = 'md' }: { crew: Pick<Crew, 'emblem' | 'tag' | 'color'>; size?: keyof typeof SIZES }) {
  if (crew.emblem)
    return (
      <img
        src={crew.emblem}
        alt=""
        className={`${SIZES[size]} shrink-0 object-cover`}
        style={{ clipPath: 'polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%)', boxShadow: `0 0 0 2px ${crew.color}` }}
      />
    );
  return (
    <span
      className={`${SIZES[size]} relative flex shrink-0 items-center justify-center font-hud font-bold tracking-wider`}
      style={{ clipPath: 'polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%)', background: crew.color }}
    >
      <span
        className="absolute inset-[2px] flex items-center justify-center bg-coal"
        style={{ clipPath: 'polygon(50% 0, 100% 18%, 100% 62%, 50% 100%, 0 62%, 0 18%)', color: crew.color }}
      >
        {crew.tag}
      </span>
    </span>
  );
}

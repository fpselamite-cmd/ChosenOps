import { createContext, useContext } from 'react';
import type { Party } from '../lib/parties';

/** Who's celebrating today (filled in by the PartyProvider). */
export const PartyCtx = createContext<{ parties: Party[]; celebrating: Set<string> }>({ parties: [], celebrating: new Set() });
export const useParties = () => useContext(PartyCtx);

/** A little party hat on the avatar of anyone celebrating today. */
export function PartyHat({ id }: { id?: string }) {
  const { celebrating } = useParties();
  if (!id || !celebrating.has(id)) return null;
  return (
    <svg className="party-hat" viewBox="0 0 24 28" aria-label="Celebrating today">
      <path d="M12 2 L21 25 Q12 28 3 25 Z" fill="url(#ph)" stroke="#0b0a07" strokeWidth="1" />
      <defs>
        <linearGradient id="ph" x1="0" x2="1">
          <stop offset="0" stopColor="#f472b6" />
          <stop offset="0.5" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="9" cy="16" r="1.4" fill="#fff" />
      <circle cx="14" cy="11" r="1.2" fill="#fff" />
      <circle cx="15" cy="20" r="1.3" fill="#fff" />
      <circle cx="12" cy="2.5" r="2.4" fill="#fde68a" />
    </svg>
  );
}


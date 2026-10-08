import { Banknote, CalendarDays, Car, Crown, Eye, Feather, FlaskConical, HandHeart, HeartPulse, Scale, Shield, Star, Swords, UserPlus, type LucideIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useHub } from '../hooks/useHub';
import type { Role } from '../lib/roles';
import type React from 'react';
import type { Rank } from '../lib/types';

/**
 * Rank seals: wax pressed with a gem. The look comes from the rank's place in the chain of command,
 * so renamed or new ranks just slot in: the bottom rank gets a plain stamp, then quartz, amethyst,
 * emerald and sapphire climbing up; leadership is ruby (the highest one darker and glowing); the Boss
 * is gold wax set with a diamond.
 */
export type SealTier = 'stamp' | 'quartz' | 'amethyst' | 'emerald' | 'sapphire' | 'ruby' | 'bloodruby' | 'diamond';
export const SEAL_TIERS: Record<SealTier, { wax: string; gem: string | null; label: string }> = {
  stamp: { wax: '#3d3f47', gem: null, label: 'Iron stamp' },
  quartz: { wax: '#5a2430', gem: '#f3e9f7', label: 'Quartz' },
  amethyst: { wax: '#3a2358', gem: '#b77cff', label: 'Amethyst' },
  emerald: { wax: '#173f2c', gem: '#3ee08f', label: 'Emerald' },
  sapphire: { wax: '#1b2f5c', gem: '#5b98ff', label: 'Sapphire' },
  ruby: { wax: '#7a1219', gem: '#ff4057', label: 'Ruby' },
  bloodruby: { wax: '#3f080d', gem: '#ff2442', label: 'Blood ruby' },
  diamond: { wax: '#7a5a10', gem: '#ffffff', label: 'Diamond' },
};
const CLIMB: SealTier[] = ['sapphire', 'emerald', 'amethyst', 'quartz'];

/** Each rank's seal, worked out from the whole ranks list. */
export function sealTiers(ranks: Rank[]) {
  const out = new Map<string, SealTier>();
  const sorted = [...ranks].sort((a, b) => a.order - b.order);
  const lead = sorted.filter((r) => r.order !== 0 && r.leadership);
  const rest = sorted.filter((r) => r.order !== 0 && !r.leadership);
  sorted.filter((r) => r.order === 0).forEach((r) => out.set(r.id, 'diamond'));
  lead.forEach((r, i) => out.set(r.id, i === 0 ? 'bloodruby' : 'ruby'));
  rest.forEach((r, i) => out.set(r.id, rest.length > 1 && i === rest.length - 1 ? 'stamp' : CLIMB[Math.min(i, CLIMB.length - 1)]!));
  return out;
}

/** A faceted gem pressed into the wax. */
function Gem({ color, size }: { color: string; size: number }) {
  return (
    <svg className="seal-gem" width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ '--gem': color } as React.CSSProperties}>
      <polygon points="10,1 18,7 15,18 5,18 2,7" className="g-base" />
      <polygon points="10,1 13.5,7 10,9 6.5,7" className="g-top" />
      <polygon points="2,7 6.5,7 10,9 5,18" className="g-left" />
      <polygon points="18,7 13.5,7 10,9 15,18" className="g-right" />
      <polygon points="5,18 10,9 15,18" className="g-low" />
      <circle cx="8" cy="5.2" r="1.1" className="g-glint" />
    </svg>
  );
}

/** Rank as a wax seal with a gem pressed in. `lg` for profile headers and the Family tree. */
export function RankBadge({ rank, className = '', size = 'sm' }: { rank?: Rank; className?: string; size?: 'sm' | 'lg' }) {
  const { ranks } = useHub();
  const tiers = useMemo(() => sealTiers(ranks), [ranks]);
  if (!rank)
    return (
      <span className={`seal rank-seal t-stamp ${size === 'lg' ? 'seal-lg' : ''} ${className}`} style={{ '--seal': '#2c2c33' } as React.CSSProperties}>
        Unranked
      </span>
    );
  const tier = tiers.get(rank.id) ?? 'quartz';
  const t = SEAL_TIERS[tier];
  return (
    <span className={`seal rank-seal t-${tier} ${size === 'lg' ? 'seal-lg' : ''} ${className}`} style={{ '--seal': t.wax } as React.CSSProperties} title={`${rank.name} · ${t.label} seal`}>
      {t.gem ? <Gem color={t.gem} size={size === 'lg' ? 16 : 12} /> : <span className="seal-press" aria-hidden />}
      {rank.order === 0 && <Crown className="-ml-0.5 size-3 text-gold-100" />}
      {rank.name}
    </span>
  );
}

/** A small icon for a role, from its name. */
const ROLE_ICONS: [RegExp, LucideIcon][] = [
  [/welcome|handler|greet/i, HandHeart],
  [/archiv|scribe|lore|histor/i, Feather],
  [/event|party|planner/i, CalendarDays],
  [/treasur|bank|money|account/i, Banknote],
  [/recruit/i, UserPlus],
  [/medic|doctor|nurse/i, HeartPulse],
  [/arm|gun|weapon/i, Swords],
  [/driv|wheel|mechanic/i, Car],
  [/cook|chem/i, FlaskConical],
  [/intel|spy|scout/i, Eye],
  [/enforc|muscle|security/i, Shield],
  [/council|consig|advis/i, Scale],
];
export function roleIcon(r: Pick<Role, 'name' | 'lead' | 'honor'>): LucideIcon {
  return ROLE_ICONS.find(([re]) => re.test(r.name))?.[1] ?? (r.lead ? Crown : r.honor ? Star : Shield);
}

/** A role as a small ribbon: gold for High Table powers, steel for working roles, sky silk for honors. */
export function RoleRibbon({ role, size = 'sm' }: { role: Role; size?: 'sm' | 'lg' }) {
  const Icon = roleIcon(role);
  const kind = role.lead ? 'lead' : role.honor ? 'honor' : 'work';
  return (
    <span className={`role-ribbon rr-${kind} ${size === 'lg' ? 'rr-lg' : ''}`} title={role.note || `${role.name}${role.lead ? ' · High Table' : role.honor ? ' · honor' : ''}`}>
      <Icon className="rr-icon" strokeWidth={2.2} />
      {role.name}
    </span>
  );
}


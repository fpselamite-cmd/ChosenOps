import {
  CalendarDays,
  Cannabis,
  Crosshair,
  HandCoins,
  Lock,
  LayoutDashboard,
  Map,
  Network,
  ShieldCheck,
  Trophy,
  Swords,
  Users,
  VenetianMask,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import { NOELOPS_URL } from './noelops';
import type { PageId } from './types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Access is checked against this page. Absent means always open. */
  page?: PageId;
  /** Opens another site in a new tab instead of a page here. */
  href?: string;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'HQ',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/locker', label: 'My Locker', icon: Lock },
      { to: '/hall-of-fame', label: 'Hall of Fame', icon: Trophy },
    ],
  },
  {
    group: 'Ops',
    items: [
      { to: '/narcotics', label: 'Narcotics', icon: Cannabis, page: 'narcotics', href: NOELOPS_URL },
      { to: '/stash', label: 'Stash', icon: Warehouse, page: 'stash' },
    ],
  },
  { group: 'Money', items: [{ to: '/blackmarket', label: 'BlackMarket', icon: VenetianMask, page: 'blackmarket' }] },
  {
    group: 'War',
    items: [
      { to: '/blacksites', label: 'Blacksites', icon: Crosshair, page: 'blacksites' },
      { to: '/gear', label: 'Gear & Loadouts', icon: Swords, page: 'gear' },
    ],
  },
  { group: 'Street', items: [{ to: '/petty-crime', label: 'Petty Crime', icon: HandCoins, page: 'pettycrime' }] },
  {
    group: 'People',
    items: [
      { to: '/crews', label: 'Crews', icon: Users, page: 'crews' },
      { to: '/family', label: 'Family', icon: Network, page: 'family' },
    ],
  },
];

/** Shown as buttons in the header rather than in the menu. */
export const HEADER_NAV: NavItem[] = [
  { to: '/map', label: 'Map', icon: Map, page: 'map' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, page: 'calendar' },
];

export const ADMIN_NAV: NavItem = { to: '/admin', label: 'Admin', icon: ShieldCheck };

/** The BlackMarket keeps NoelOps' layout (its stylesheet, scoped to .noel) in the HQ's gold. Everything else is gold. */
export type PageTheme = 'gold' | 'blackmarket';
export function themeFor(path: string): PageTheme {
  if (path.startsWith('/blackmarket')) return 'blackmarket';
  return 'gold';
}

import {
  CalendarDays,
  Cannabis,
  Crosshair,
  HandCoins,
  LayoutDashboard,
  Map,
  Network,
  ShieldCheck,
  Swords,
  Users,
  VenetianMask,
  Warehouse,
  type LucideIcon,
} from 'lucide-react';
import type { PageId } from './types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Access is checked against this page. Absent means always open. */
  page?: PageId;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'HQ', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    group: 'Ops',
    items: [
      { to: '/narcotics', label: 'Narcotics', icon: Cannabis, page: 'narcotics' },
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

/**
 * Narcotics wears the full NoelOps look (its own stylesheet, scoped to .noel);
 * the BlackMarket keeps its red on black. Everything else is gold.
 */
export type PageTheme = 'gold' | 'noel' | 'blackmarket';
export function themeFor(path: string): PageTheme {
  if (path.startsWith('/narcotics')) return 'noel';
  if (path.startsWith('/blackmarket')) return 'blackmarket';
  return 'gold';
}

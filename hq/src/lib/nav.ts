import {
  CalendarDays,
  Crosshair,
  FlaskConical,
  HandCoins,
  LayoutDashboard,
  Map,
  Network,
  ShieldCheck,
  Snowflake,
  Swords,
  Timer,
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
      { to: '/stash', label: 'Stash', icon: Warehouse, page: 'stash' },
      { to: '/timers', label: 'Timers', icon: Timer, page: 'timers' },
      { to: '/meth', label: 'Meth', icon: FlaskConical, page: 'meth' },
      { to: '/coke', label: 'Coke', icon: Snowflake, page: 'coke' },
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
 * NoelOps pages keep their original colors inside the gold shell:
 * grow green with purple grow-light, meth cyan, coke ice blue, BlackMarket red on black.
 */
export type PageTheme = 'gold' | 'grow' | 'meth' | 'coke' | 'blackmarket';
export function themeFor(path: string): PageTheme {
  if (path.startsWith('/stash') || path.startsWith('/timers')) return 'grow';
  if (path.startsWith('/meth')) return 'meth';
  if (path.startsWith('/coke')) return 'coke';
  if (path.startsWith('/blackmarket')) return 'blackmarket';
  return 'gold';
}

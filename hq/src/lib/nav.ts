import {
  Banknote,
  CalendarDays,
  Cannabis,
  Crosshair,
  FolderSearch,
  HandCoins,
  HandHeart,
  Lock,
  LayoutDashboard,
  Library,
  Map,
  Network,
  ShieldCheck,
  Trophy,
  Swords,
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
  /** Only associates and the Welcome Committee see it. */
  welcome?: boolean;
  /** Hidden from associates until they're blooded in. */
  archives?: boolean;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'HQ',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/family', label: 'Family', icon: Network, page: 'family' },
      { to: '/welcome', label: 'Welcome', icon: HandHeart, welcome: true },
      { to: '/hall-of-fame', label: 'Hall of Fame', icon: Trophy },
      { to: '/archives', label: 'Archives', icon: Library, archives: true },
    ],
  },
  {
    group: 'Me',
    items: [
      { to: '/locker', label: 'My Locker', icon: Lock },
      { to: '/gear', label: 'Gear & Loadouts', icon: Swords, page: 'gear' },
    ],
  },
  {
    group: 'Business',
    items: [
      { to: '/blackmarket', label: 'BlackMarket', icon: VenetianMask, page: 'blackmarket' },
      { to: '/money', label: 'Money', icon: Banknote },
      { to: '/stash', label: 'Stash', icon: Warehouse, page: 'stash' },
      { to: '/narcotics', label: 'Narcotics', icon: Cannabis, page: 'narcotics', href: NOELOPS_URL },
      { to: '/petty-crime', label: 'Petty Crime', icon: HandCoins, page: 'pettycrime' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/blacksites', label: 'Blacksites', icon: Crosshair, page: 'blacksites' },
      { to: '/rivals', label: 'Rivals', icon: FolderSearch },
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

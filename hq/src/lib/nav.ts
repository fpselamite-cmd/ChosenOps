import {
  Banknote,
  CalendarDays,
  Cannabis,
  Crosshair,
  Gem,
  Dices,
  FolderSearch,
  HandCoins,
  HandHeart,
  Lock,
  LayoutDashboard,
  Library,
  Map,
  Network,
  Route,
  Trophy,
  UserRound,
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
  /** Only the Welcome Committee (and leadership) see it here; associates get it at the very top instead. */
  handlers?: boolean;
  /** Associates can open it. They see nothing else in the menu until they're blooded in. */
  assoc?: boolean;
  /** Points at the signed-in member's own character page. */
  me?: boolean;
}

/** Associates see this on its own, above everything, until they're blooded in. */
export const WELCOME_TOP: NavItem = { to: '/welcome', label: 'Welcome', icon: HandHeart, assoc: true };

export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'HQ',
    items: [
      { to: '/', label: 'Dashboard', icon: LayoutDashboard, assoc: true },
      { to: '/stash', label: 'Stash', icon: Warehouse, page: 'stash' },
      { to: '/petty-crime', label: 'Petty Crime', icon: HandCoins, page: 'pettycrime', assoc: true },
      { to: '/casino', label: 'Casino', icon: Dices, assoc: true },
    ],
  },
  {
    group: 'Me',
    items: [
      { to: '/me', label: 'Me', icon: UserRound, me: true, assoc: true },
      { to: '/locker', label: 'My Locker', icon: Lock, assoc: true },
      { to: '/gear', label: 'Gear & Loadouts', icon: Swords, page: 'gear', assoc: true },
      { to: '/money', label: 'Money', icon: Banknote, assoc: true },
    ],
  },
  {
    group: 'Business',
    items: [
      { to: '/blackmarket', label: 'BlackMarket', icon: VenetianMask, page: 'blackmarket' },
      { to: '/narcotics', label: 'Narcotics', icon: Cannabis, page: 'narcotics', href: NOELOPS_URL },
    ],
  },
  {
    group: 'Operations',
    items: [
      { to: '/blacksites', label: 'Blacksites', icon: Crosshair, page: 'blacksites' },
      { to: '/heists', label: 'Heists', icon: Gem },
      { to: '/narco-runs', label: 'Narco Runs', icon: Route, page: 'narcotics' },
      { to: '/welcome', label: 'Welcome', icon: HandHeart, handlers: true },
    ],
  },
  {
    group: 'Lore',
    items: [
      { to: '/family', label: 'Family', icon: Network, page: 'family' },
      { to: '/rivals', label: 'Rivals', icon: FolderSearch },
      { to: '/archives', label: 'Archives', icon: Library },
      { to: '/hall-of-fame', label: 'Hall of Fame', icon: Trophy },
    ],
  },
];

/** The phone bar's three picks (two left of the Dashboard, one right) until someone chooses their own. */
export const DEFAULT_BAR = ['/me', '/family', '/casino'];

/** Shown as buttons in the header rather than in the menu. */
export const HEADER_NAV: NavItem[] = [
  { to: '/map', label: 'Map', icon: Map, page: 'map' },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays, page: 'calendar' },
];


/** The BlackMarket keeps NoelOps' layout (its stylesheet, scoped to .noel) in the HQ's gold. Everything else is gold. */
export type PageTheme = 'gold' | 'blackmarket';
export function themeFor(path: string): PageTheme {
  if (path.startsWith('/blackmarket')) return 'blackmarket';
  return 'gold';
}

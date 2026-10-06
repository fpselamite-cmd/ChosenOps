import {
  CalendarDays,
  Crosshair,
  FlaskConical,
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

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar. */
  mobile?: boolean;
}

export const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'HQ', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, mobile: true }] },
  {
    group: 'Ops',
    items: [
      { to: '/stash', label: 'Stash', icon: Warehouse, mobile: true },
      { to: '/timers', label: 'Timers', icon: Timer, mobile: true },
      { to: '/meth', label: 'Meth', icon: FlaskConical },
      { to: '/coke', label: 'Coke', icon: Snowflake },
    ],
  },
  { group: 'Money', items: [{ to: '/blackmarket', label: 'BlackMarket', icon: VenetianMask }] },
  {
    group: 'War',
    items: [
      { to: '/blacksites', label: 'Blacksites', icon: Crosshair },
      { to: '/gear', label: 'Gear & Loadouts', icon: Swords },
    ],
  },
  {
    group: 'People',
    items: [
      { to: '/crews', label: 'Crews', icon: Users, mobile: true },
      { to: '/family', label: 'Family', icon: Network },
      { to: '/map', label: 'Map', icon: Map },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    ],
  },
];

export const ADMIN_NAV: NavItem = { to: '/admin', label: 'Admin', icon: ShieldCheck };

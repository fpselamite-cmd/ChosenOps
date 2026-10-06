/** What each not-yet-built page will hold. Shown on its placeholder so the plan can be reviewed. */
export const ROADMAP: Record<string, { step: number; title: string; kicker: string; sub: string; features: string[] }> = {
  blackmarket: {
    step: 3,
    title: 'BlackMarket',
    kicker: 'Money',
    sub: 'Where product sells for dirty money.',
    features: [
      'Sell flow and the ringing Narco call button',
      'Ledger with filters, charts and CSV export, plus weekly price history',
      'Wish list: post what the gang needs, claim it, mark it got',
      'Wash: dirty money to clean, minus the launderer’s cut',
      'Budget (leadership + Treasurer): crew bank, cuts, payouts and expenses',
    ],
  },
  blacksites: {
    step: 5,
    title: 'Blacksites',
    kicker: 'War',
    sub: 'Every King of the Hill fight The Chosen took part in.',
    features: [
      'Log each blacksite: date, zone, result, rival gangs, hold time and rep gained',
      'Who showed up, their role, kills / downs and the MVP',
      'Loot screenshots, plus itemised loot that drops into the Armory',
      'Running rep total, win rate, and stats per crew and per person',
    ],
  },
  gear: {
    step: 6,
    title: 'Gear & Loadouts',
    kicker: 'War',
    sub: 'The armory and a Call of Duty style loadout editor.',
    features: [
      'Every gun, attachment and ammo type (you’ll send the data)',
      'Loadout editor: primary, secondary, lethal, tactical, armor, attachment slots and live stat bars',
      'Loadout templates per role and per crew',
      'Armory stock by location with a sign-out log (returned, lost, seized)',
      'Each member’s current loadout on their profile',
    ],
  },
  map: {
    step: 4,
    title: 'Map',
    kicker: 'People',
    sub: 'The city map with pins for every op.',
    features: ['Upload the map once', 'Pins for grows, stash houses, labs, warehouses and blacksite zones', 'Click a pin for live timers and stock'],
  },
  calendar: {
    step: 4,
    title: 'Calendar',
    kicker: 'People',
    sub: 'The week ahead, in Eastern time.',
    features: ['Events with weekly repeats (like the coca leaves harvest)', 'Crew-only events', 'Today’s events in the dashboard ticker'],
  },
};

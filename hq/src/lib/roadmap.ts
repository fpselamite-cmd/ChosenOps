/** What each not-yet-built page will hold. Shown on its placeholder so the plan can be reviewed. */
export const ROADMAP: Record<string, { step: number; title: string; kicker: string; sub: string; features: string[] }> = {
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
};

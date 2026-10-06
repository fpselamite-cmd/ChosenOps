/** What each not-yet-built page will hold. Shown on its placeholder so the plan can be reviewed. */
export const ROADMAP: Record<string, { step: number; title: string; kicker: string; sub: string; features: string[] }> = {
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

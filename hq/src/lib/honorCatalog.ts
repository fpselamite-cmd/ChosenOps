import type { Honor, HonorKind, Rarity, StatId } from './honors';

/**
 * The big catalog: a six-step ladder on every number the HQ counts (badge, hue, badge, title,
 * frame, secret badge), a chip shop full of titles, hues, frames, effects and badges, and a wing of
 * honors only High Table hands out. Generated from the lists below, so it's easy to grow.
 */
type M = (id: string, kind: HonorKind, name: string, rarity: Rarity, stat: StatId, goal: number, description: string, look?: Partial<Honor>) => Omit<Honor, 'at'>;
type H = (id: string, kind: HonorKind, name: string, rarity: Rarity, description: string, look?: Partial<Honor>) => Omit<Honor, 'at'>;

/** Every icon a badge (and a banner sigil) can carry. */
export const CATALOG_ICONS = [
  'Anchor', 'Axe', 'Bomb', 'Bone', 'Briefcase', 'Cigarette', 'Clock', 'Compass', 'Key', 'Lock', 'Map', 'Wine', 'Music', 'Plane', 'Rocket', 'Scale', 'Scissors', 'Ship', 'Siren', 'Snowflake',
  'Sword', 'Train', 'Umbrella', 'Wallet', 'Wrench', 'Mountain', 'Sun', 'Bird', 'Cat', 'Dog', 'Fish', 'Hammer', 'Pickaxe', 'Radio', 'Shell', 'Sparkles', 'Banknote', 'Gavel', 'Handshake', 'Hourglass',
  'Medal', 'Pizza', 'Sailboat', 'Beer', 'Martini', 'Clover', 'Hand', 'Fingerprint', 'Glasses', 'Camera', 'Bike', 'Truck', 'Flashlight', 'Lightbulb', 'Infinity', 'Biohazard', 'Radiation', 'Footprints',
  'Drama', 'Joystick', 'Gift', 'Book', 'Candy', 'Coffee', 'Store', 'Building', 'Castle', 'Church', 'KeyRound', 'Bell', 'Megaphone', 'Hash', 'Percent', 'Award', 'Bitcoin', 'PiggyBank', 'Shirt',
  'Gamepad2', 'Pill', 'Tornado', 'Waves', 'Leaf', 'TreePine', 'Flower', 'Citrus', 'Grape', 'Egg',
] as const;

/** Named colors for hues. */
const COLORS: [string, string][] = [
  ['Oxblood', '#4a0d14'], ['Cardinal', '#c41e3a'], ['Garnet', '#7b1e2b'], ['Vermilion', '#e34234'], ['Rust', '#b7410e'], ['Burnt Orange', '#cc5500'], ['Tangerine', '#f28500'], ['Saffron', '#f4c430'],
  ['Mustard', '#d1a019'], ['Brass', '#b5a642'], ['Champagne', '#f7e7ce'], ['Ivory', '#fffff0'], ['Bone White', '#e3dac9'], ['Olive Drab', '#6b8e23'], ['Absinthe', '#7fdd4c'], ['Lime Twist', '#bfff00'],
  ['Emerald City', '#10b981'], ['Bottle Green', '#006a4e'], ['Pine', '#01796f'], ['Seafoam', '#71eeb8'], ['Teal Smoke', '#367588'], ['Turquoise', '#30d5c8'], ['Caribbean', '#00a8b5'], ['Ice Blue', '#a5f2f3'],
  ['Steel Blue', '#4682b4'], ['Cobalt', '#0047ab'], ['Navy Pinstripe', '#1b2a49'], ['Ultramarine', '#3f00ff'], ['Indigo Night', '#2e1a6b'], ['Royal Purple', '#7851a9'], ['Orchid', '#da70d6'], ['Mauve', '#e0b0ff'],
  ['Plum', '#673147'], ['Magenta Lights', '#ff00a8'], ['Flamingo', '#fc8eac'], ['Blush', '#de5d83'], ['Rosewood', '#65000b'], ['Cocoa', '#5c3317'], ['Mahogany', '#c04000'], ['Tobacco', '#71563c'],
  ['Espresso', '#3c2415'], ['Gunmetal', '#2a3439'], ['Pewter', '#899499'], ['Ash', '#b2beb5'], ['Charcoal', '#36454f'], ['Onyx Black', '#0f0f10'], ['Pearl', '#eae0c8'], ['Platinum Blonde', '#efe1c4'],
  ['Sunset Strip', '#fd5e53'], ['Miami Pink', '#ff6ec7'], ['Vice Teal', '#00e5c7'], ['Smoke Grey', '#848884'], ['Bourbon', '#b56b1f'], ['Cognac', '#9a463d'], ['Merlot', '#73343a'], ['Jade Dragon', '#00a86b'],
  ['Midnight Oil', '#0b1d3a'], ['Storm', '#4f666a'], ['Thunder', '#33292f'], ['Electric Lime', '#ccff00'], ['Hot Coral', '#ff4f58'], ['Aztec Gold', '#c39953'], ['Rose Quartz', '#f7cac9'], ['Lavender Haze', '#b8a9e3'],
];

/** The ladders: what's counted, its six steps, and the six names. Goals rise with rarity. */
const LADDERS: { stat: StatId; icon: string; goals: number[]; names: [string, string, string, string, string, string] }[] = [
  { stat: 'fights', icon: 'Swords', goals: [2, 10, 40, 75, 200, 400], names: ['Scrapper', 'Brawl Bronze', 'Front Liner', 'The Hammer', 'Siege Breaker', 'Unkillable'] },
  { stat: 'wins', icon: 'Flag', goals: [2, 10, 20, 75, 150, 300], names: ['Plant the Flag', 'Victory Red', 'Ground Holder', 'The Conqueror', 'Banner of Ash', 'Undefeated'] },
  { stat: 'mvps', icon: 'Star', goals: [2, 3, 8, 15, 25, 50], names: ['Standout', 'Spotlight Gold', 'Crowd Favorite', 'The Headliner', 'Hall of Stars', 'Living Legend'] },
  { stat: 'kills', icon: 'Crosshair', goals: [5, 25, 150, 400, 750, 2000], names: ['First Notch', 'Gunsmoke', 'Sharpshooter', 'The Executioner', 'Bullet Storm', 'Death Itself'] },
  { stat: 'runs', icon: 'Truck', goals: [5, 40, 150, 300, 600, 1200], names: ['Errand Boy', 'Highway Grey', 'Long Hauler', 'The Smuggler', 'Cartel Road', 'Ghost Convoy'] },
  { stat: 'harvests', icon: 'Leaf', goals: [10, 30, 75, 200, 400, 800], names: ['Seedling', 'Kush Green', 'Crop Master', 'The Botanist', 'Endless Fields', 'Mother Plant'] },
  { stat: 'cooks', icon: 'FlaskConical', goals: [5, 25, 75, 200, 400, 800], names: ['Lab Rat', 'Blue Sky', 'Chemist', 'The Professor', 'Cook Supreme', 'Pure Ninety-Nine'] },
  { stat: 'pressed', icon: 'Box', goals: [5, 25, 150, 300, 750, 1500], names: ['Press Hand', 'Brick Red', 'Heavy Press', 'The Mason', 'Brick Empire', 'Iron Press'] },
  { stat: 'sold', icon: 'Store', goals: [25, 100, 500, 2000, 5000, 10000], names: ['Corner Boy', 'Street Gold', 'The Connect', 'Distributor', 'Supply Chain', 'El Patron'] },
  { stat: 'washed', icon: 'WashingMachine', goals: [5000, 50000, 250000, 3000000, 10000000, 50000000], names: ['Spin Cycle', 'Clean Mint', 'Front Business', 'The Accountant', 'Offshore', 'Spotless'] },
  { stat: 'petty', icon: 'Hand', goals: [5, 25, 150, 300, 750, 1500], names: ['Pickpocket', 'Alley Grey', 'Hustler', 'Street Legend', 'King of the Block', 'Untraceable'] },
  { stat: 'dinners', icon: 'Utensils', goals: [2, 15, 40, 60, 150, 300], names: ['Pass the Bread', 'Red Sauce', 'Regular', 'The Host', 'Sunday Table', 'Forever Family'] },
  { stat: 'duesPaid', icon: 'Coins', goals: [2, 15, 40, 75, 150, 300], names: ['Paid Up', 'Tithe Gold', 'Reliable', 'The Steady Hand', 'Never Late', 'Pillar of Gold'] },
  { stat: 'days', icon: 'CalendarDays', goals: [7, 60, 120, 270, 730, 1460], names: ['New Blood', 'Week Old Wine', 'Settled In', 'Old Timer', 'Long Memory', 'Elder of the Family'] },
  { stat: 'streak', icon: 'Flame', goals: [5, 10, 45, 75, 150, 500], names: ['Warmed Up', 'Ember', 'On Fire', 'The Faithful', 'Never Dark', 'Eternal Flame'] },
  { stat: 'repSent', icon: 'Landmark', goals: [50, 250, 2500, 7500, 15000, 50000], names: ['Tribute', 'Respect Red', 'Benefactor', 'The Patron', 'Family Bank', 'Cornerstone'] },
  { stat: 'votes', icon: 'Vote', goals: [3, 5, 20, 40, 75, 150], names: ['Voter', 'Ballot Blue', 'Civic Duty', 'The Whip', 'The Caucus', 'Voice of the People'] },
  { stat: 'birthdays', icon: 'Cake', goals: [2, 4, 5, 6, 8, 10], names: ['Candles', 'Frosting', 'Party Regular', 'The Guest of Honor', 'Decade Club', 'Ageless'] },
  { stat: 'stories', icon: 'Feather', goals: [2, 4, 8, 20, 30, 50], names: ['Scribe', 'Ink Black', 'Storyteller', 'The Historian', 'Keeper of Tales', 'The Myth Maker'] },
  { stat: 'sightings', icon: 'Eye', goals: [3, 10, 15, 35, 75, 150], names: ['Watcher', 'Eagle Eye', 'Scout', 'The Informant', 'Eyes Everywhere', 'Big Brother'] },
  { stat: 'bounties', icon: 'Target', goals: [1, 2, 4, 6, 10, 20], names: ['Bounty Hunter', 'Wanted Red', 'Collector', 'The Tracker', 'Dead or Alive', 'The Reckoning'] },
  { stat: 'reactions', icon: 'MessageCircle', goals: [25, 100, 500, 1000, 2500, 5000], names: ['Chatterbox', 'Peanut Gallery', 'Commentator', 'The Critic', 'Voice of the Archives', 'Never Silent'] },
  { stat: 'hands', icon: 'Spade', goals: [50, 250, 500, 2500, 7500, 15000], names: ['Rookie Gambler', 'Felt Green', 'Card Shark', 'The High Roller', 'House Legend', 'Owns the House'] },
  { stat: 'chipsWon', icon: 'Coins', goals: [5000, 50000, 200000, 1000000, 2500000, 10000000], names: ['Small Winner', 'Chip Gold', 'Hot Hand', 'The Whale', 'Bank Breaker', 'Midas'] },
  { stat: 'biggestWin', icon: 'Diamond', goals: [500, 5000, 10000, 50000, 100000, 500000], names: ['Lucky Break', 'Jackpot Green', 'Big Score', 'The Miracle', 'House Killer', 'Impossible Odds'] },
  { stat: 'blackjacks', icon: 'Club', goals: [5, 10, 25, 75, 150, 300], names: ['Twenty-One', 'Blackjack Black', 'Ace High', 'The Counter', 'Natural Born', 'Dealer’s Nightmare'] },
  { stat: 'jackpots', icon: 'Cherry', goals: [1, 2, 4, 6, 10, 20], names: ['Three Cherries', 'Slot Gold', 'One Armed Bandit', 'The Lucky One', 'Reel King', 'Fortune’s Child'] },
  { stat: 'heists', icon: 'Gem', goals: [2, 10, 15, 40, 75, 150], names: ['Lookout', 'Vault Silver', 'Crew Member', 'The Inside Man', 'Score of the Century', 'Never Caught'] },
  { stat: 'heistWins', icon: 'Briefcase', goals: [1, 5, 15, 30, 60, 120], names: ['Clean Getaway', 'Getaway Green', 'Pro', 'The Planner', 'Perfect Record', 'The Phantom'] },
  { stat: 'heistFails', icon: 'Siren', goals: [2, 3, 8, 12, 20, 40], names: ['Sirens', 'Police Blue', 'Hot Pursuit', 'The Escape Artist', 'Most Wanted', 'Cat With Nine Lives'] },
  { stat: 'bestTake', icon: 'Banknote', goals: [10000, 50000, 150000, 400000, 750000, 2000000], names: ['Pocket Money', 'Greenback', 'Big Take', 'The Payday', 'Fort Knox', 'Billion Dollar Smile'] },
  { stat: 'heistStreak', icon: 'Zap', goals: [2, 3, 4, 7, 12, 20], names: ['Hot Streak', 'Lightning', 'Untouched', 'The Clean Machine', 'Flawless', 'Smooth Criminal'] },
  { stat: 'asDriver', icon: 'Car', goals: [1, 3, 5, 20, 40, 75], names: ['Behind the Wheel', 'Burnt Rubber', 'Getaway Driver', 'The Transporter', 'Fast Lane', 'Ghost Rider'] },
  { stat: 'asHacker', icon: 'KeyRound', goals: [1, 3, 5, 20, 40, 75], names: ['Script Kiddie', 'Matrix Green', 'Codebreaker', 'The Ghost Coder', 'Backdoor', 'Zero Day'] },
  { stat: 'asGunman', icon: 'Crosshair', goals: [1, 3, 5, 20, 40, 75], names: ['Trigger Man', 'Muzzle Flash', 'Hired Muscle', 'The Enforcer', 'Hail of Bullets', 'One Man Army'] },
  { stat: 'narcoRuns', icon: 'Truck', goals: [3, 5, 25, 100, 150, 300], names: ['Mule', 'Dusty Road', 'Runner', 'The Cartel Courier', 'Silk Road', 'Ghost Pipeline'] },
  { stat: 'runsClean', icon: 'Shield', goals: [3, 10, 50, 75, 150, 300], names: ['Clean Run', 'Spotless Blue', 'Smooth Operator', 'The Professional', 'Never Stopped', 'Invisible'] },
  { stat: 'runsBusted', icon: 'Siren', goals: [2, 3, 8, 12, 20, 40], names: ['Pulled Over', 'Cuff Silver', 'Repeat Offender', 'The Usual Suspect', 'Rap Sheet', 'Bail Money'] },
  { stat: 'runsRobbed', icon: 'Skull', goals: [2, 3, 8, 12, 20, 40], names: ['Shaken Down', 'Bruise Purple', 'Marked Man', 'The Target', 'Bad Luck Charm', 'Still Standing'] },
  { stat: 'bestHaul', icon: 'Wallet', goals: [10000, 50000, 250000, 400000, 750000, 2000000], names: ['First Bag', 'Money Green', 'Heavy Bag', 'The Big Haul', 'Truckload', 'Cartel Fortune'] },
];

const LADDER_RARITY: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const LADDER_KIND: HonorKind[] = ['badge', 'hue', 'badge', 'title', 'frame', 'badge'];
/** Frame themes the ladders hand out (by turns). */
const LADDER_THEMES = ['gothic', 'horns', 'laurel', 'filigree', 'chains', 'bullets', 'dice', 'moon', 'wings', 'crown', 'skulls', 'flames', 'roses', 'lightning', 'stars'];

const SHOP_TITLES = [
  'The Charmer', 'Smooth Talker', 'Silver Fox', 'The Sharp Dresser', 'Cool Customer', 'The Dapper', 'Mister Nice Guy', 'The Wiseguy', 'Fast Eddie', 'Sweet Talker', 'The Natural', 'Lady Killer',
  'Boss Material', 'Man of Means', 'The Big Spender', 'Money Bags', 'The Tycoon', 'High Society', 'Old Money', 'New Money', 'The Mogul', 'Penthouse', 'Velvet Glove', 'Diamond Cut', 'The Jeweler',
  'Midnight Rider', 'Night Owl', 'Neon Saint', 'The Prophet', 'The Philosopher', 'The Poet', 'Smokestack', 'Lucky Strike', 'Ace in the Hole', 'Snake Eyes', 'Double Down', 'All In', 'Royal Flush',
  'House Rules', 'The Closer',
];
const GIVEN_TITLES = [
  'Right Hand', 'Left Hand', 'The Consigliere’s Ear', 'The Negotiator', 'Peacemaker', 'Warmonger', 'The Butcher', 'The Surgeon', 'The Cleaner', 'Ghost of the Docks', 'Shadow of the Don', 'The Untouchable',
  'Made in Blood', 'The Loyal', 'Sworn Brother', 'Sworn Sister', 'The Oath Keeper', 'Keeper of Secrets', 'The Vault', 'The Architect', 'The Strategist', 'The General', 'The Diplomat', 'The Fixer’s Fixer',
  'The Firestarter', 'The Wolf', 'The Lion', 'The Viper', 'The Raven', 'The Fox',
];
const GIVEN_BADGES: [string, string][] = [
  ['Order of the Rose', 'Flower'], ['Iron Cross', 'Shield'], ['Golden Gavel', 'Gavel'], ['Silent Key', 'Key'], ['Bloodline', 'Heart'], ['The Handshake', 'Handshake'], ['Lighthouse', 'Lightbulb'], ['Anchor of the Family', 'Anchor'],
  ['Night Raven', 'Bird'], ['Lone Wolf', 'Dog'], ['Cat Burglar', 'Cat'], ['Big Fish', 'Fish'], ['Mountain Mover', 'Mountain'], ['Sunrise Oath', 'Sun'], ['Infinite Loyalty', 'Infinity'], ['Fingerprint Free', 'Fingerprint'],
  ['Castle Keeper', 'Castle'], ['Church Bells', 'Church'], ['Hourglass', 'Hourglass'], ['Compass Rose', 'Compass'],
];
const SHOP_BADGES: [string, string][] = [
  ['Martini Hour', 'Martini'], ['Cold One', 'Beer'], ['Fine Wine', 'Wine'], ['Coffee Run', 'Coffee'], ['Pizza Night', 'Pizza'], ['Sweet Tooth', 'Candy'], ['Four Leaf', 'Clover'], ['Smoke Break', 'Cigarette'],
  ['Shades On', 'Glasses'], ['Paparazzi', 'Camera'], ['Joyride', 'Bike'], ['Jet Set', 'Plane'], ['Yacht Club', 'Sailboat'], ['Shipping Magnate', 'Ship'], ['Night Train', 'Train'], ['Rocket Fuel', 'Rocket'],
  ['Arcade King', 'Gamepad2'], ['Joystick', 'Joystick'], ['Gift Giver', 'Gift'], ['Bookworm', 'Book'], ['Music Lover', 'Music'], ['Radio Head', 'Radio'], ['Rainy Day', 'Umbrella'], ['Piggy Bank', 'PiggyBank'],
  ['Crypto Bro', 'Bitcoin'], ['Toolbox', 'Wrench'], ['Hard Hat', 'Hammer'], ['Gold Digger', 'Pickaxe'], ['Lumberjack', 'Axe'], ['Bomb Squad', 'Bomb'], ['Bad Bone', 'Bone'], ['Seashell', 'Shell'],
  ['Shooting Star', 'Sparkles'], ['Hazard', 'Biohazard'], ['Hot Zone', 'Radiation'], ['Footsteps', 'Footprints'], ['Drama Queen', 'Drama'], ['Tornado Alley', 'Tornado'], ['Big Wave', 'Waves'], ['Evergreen', 'TreePine'],
];
const SHOP_FRAME_THEMES = ['filigree', 'chains', 'bullets', 'dice', 'moon', 'wings', 'gothic', 'horns', 'neon', 'laurel', 'wax', 'band', 'cards', 'chips', 'hearts', 'stars', 'roses', 'lightning'];
const FRAME_NAMES: Record<string, string> = {
  filigree: 'Filigree', chains: 'Heavy Chains', bullets: 'Bandolier', dice: 'Loaded Dice', moon: 'Crescent Moon', wings: 'Fallen Angel', gothic: 'Cathedral Glass', horns: 'Hellhound', neon: 'Vegas Neon', laurel: 'Caesar',
  wax: 'Signet', band: 'Stacks on Stacks', cards: 'Full House', chips: 'Chip Leader', hearts: 'Heartbreaker', stars: 'Constellation', roses: 'Black Rose', lightning: 'Thunderstruck', crown: 'Royal', skulls: 'Catacombs', flames: 'Hellfire',
};
export const NEW_EFFECTS = ['goldleaf', 'ember', 'smoke', 'holo', 'chrome', 'toxic', 'bloodmoon', 'aurora'] as const;
const EFFECT_NAMES: Record<string, string> = { goldleaf: 'Gold Leaf', ember: 'Smoldering', smoke: 'Smoke Screen', holo: 'Hologram', chrome: 'Chrome', toxic: 'Toxic', bloodmoon: 'Blood Moon', aurora: 'Aurora' };

const RARE_BY_PRICE = (p: number): Rarity => (p >= 30000 ? 'legendary' : p >= 8000 ? 'epic' : p >= 3000 ? 'rare' : p >= 1200 ? 'uncommon' : 'common');
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const say = (n: number) => n.toLocaleString('en-US');

export function bigCatalog(m: M, h: H, statLabel: (s: StatId) => string): Omit<Honor, 'at'>[] {
  const out: Omit<Honor, 'at'>[] = [];
  // Ladders
  LADDERS.forEach((l, li) => {
    l.names.forEach((name, i) => {
      const kind = LADDER_KIND[i]!;
      const rarity = LADDER_RARITY[i]!;
      const goal = l.goals[i]!;
      const id = `L-${l.stat}-${i}`;
      const desc = `${say(goal)} ${statLabel(l.stat).toLowerCase()}.`;
      const look: Partial<Honor> =
        kind === 'badge'
          ? { icon: l.icon, ...(i === 5 ? { secret: true } : {}) }
          : kind === 'hue'
            ? { color: COLORS[(li * 3 + i) % COLORS.length]![1] }
            : kind === 'frame'
              ? { theme: LADDER_THEMES[li % LADDER_THEMES.length] as Honor['theme'] }
              : {};
      out.push(m(id, kind, name, rarity, l.stat, goal, desc, look));
    });
  });
  // The chip shop
  SHOP_TITLES.forEach((t, i) => {
    const price = [800, 1200, 1800, 2500, 4000, 6000, 9000, 15000][i % 8]!;
    out.push(h(`S-t-${slug(t)}`, 'title', t, RARE_BY_PRICE(price), 'From the chip shop.', { price }));
  });
  COLORS.forEach(([name, color], i) => {
    const price = [600, 900, 1400, 2200, 3500][i % 5]!;
    out.push(h(`S-h-${slug(name)}`, 'hue', name, RARE_BY_PRICE(price), 'From the chip shop.', { color, price }));
  });
  SHOP_FRAME_THEMES.forEach((theme, i) => {
    const price = [5000, 9000, 14000, 22000, 40000][i % 5]!;
    out.push(h(`S-f-${theme}`, 'frame', FRAME_NAMES[theme] ?? theme, RARE_BY_PRICE(price), 'From the chip shop.', { theme: theme as Honor['theme'], price }));
  });
  NEW_EFFECTS.forEach((effect, i) => {
    const price = [9000, 12000, 15000, 20000, 25000, 30000, 40000, 60000][i]!;
    out.push(h(`S-e-${effect}`, 'effect', EFFECT_NAMES[effect]!, RARE_BY_PRICE(price), 'From the chip shop.', { effect: effect as Honor['effect'], price }));
  });
  SHOP_BADGES.forEach(([name, icon], i) => {
    const price = [700, 1100, 1700, 2600, 4200, 7000][i % 6]!;
    out.push(h(`S-b-${slug(name)}`, 'badge', name, RARE_BY_PRICE(price), 'From the chip shop.', { icon, price }));
  });
  // High Table's own
  GIVEN_TITLES.forEach((t, i) => out.push(h(`G-t-${slug(t)}`, 'title', t, (['rare', 'epic', 'legendary'] as Rarity[])[i % 3]!, 'Given by High Table.')));
  GIVEN_BADGES.forEach(([name, icon], i) => out.push(h(`G-b-${slug(name)}`, 'badge', name, (['rare', 'epic', 'legendary', 'mythic'] as Rarity[])[i % 4]!, 'Given by High Table.', { icon })));
  ['filigree', 'wings', 'moon', 'chains'].forEach((theme, i) => out.push(h(`G-f-${theme}`, 'frame', `${['Golden', 'Seraph', 'Night', 'Iron'][i]} ${FRAME_NAMES[theme]}`, (['legendary', 'mythic', 'epic', 'epic'] as Rarity[])[i]!, 'Given by High Table.', { theme: theme as Honor['theme'] })));
  NEW_EFFECTS.slice(0, 4).forEach((effect) => out.push(h(`G-e-${effect}`, 'effect', `${EFFECT_NAMES[effect]} (Honored)`, 'mythic', 'Given by High Table, rarely.', { effect: effect as Honor['effect'] })));
  return out;
}

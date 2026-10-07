/**
 * Each member's star in the Family sky. Plain colors are free; the showy ones are kept back as
 * rewards for later (they show locked in Customize until then).
 */
export interface StarStyle {
  id: string;
  label: string;
  core: string;
  glow: string;
  /** Not unlockable yet: saved for future rewards. */
  locked?: boolean;
  effect?: 'aurora' | 'pulsar' | 'binary' | 'nova';
}

export const STARS: StarStyle[] = [
  { id: 'gold', label: 'Chosen gold', core: '#fff3c4', glow: '#f6dd8a' },
  { id: 'white', label: 'White dwarf', core: '#ffffff', glow: '#dfe8ff' },
  { id: 'ice', label: 'Ice blue', core: '#e6f6ff', glow: '#7cc8ff' },
  { id: 'rose', label: 'Rose', core: '#ffe6ee', glow: '#ff8fb3' },
  { id: 'ember', label: 'Ember', core: '#fff0e0', glow: '#ff9a4a' },
  { id: 'emerald', label: 'Emerald', core: '#e9fff3', glow: '#4fe0a0' },
  { id: 'violet', label: 'Violet', core: '#f3ecff', glow: '#b48cff' },
  { id: 'crimson', label: 'Blood moon', core: '#ffe3e3', glow: '#ff4d5e' },
  { id: 'aurora', label: 'Aurora', core: '#ffffff', glow: '#79d3e6', locked: true, effect: 'aurora' },
  { id: 'pulsar', label: 'Pulsar', core: '#ffffff', glow: '#a4b8ff', locked: true, effect: 'pulsar' },
  { id: 'binary', label: 'Binary star', core: '#fff3c4', glow: '#f6dd8a', locked: true, effect: 'binary' },
  { id: 'nova', label: 'Supernova', core: '#fffbe8', glow: '#ffcf6b', locked: true, effect: 'nova' },
];
export const starStyle = (id?: string | null) => STARS.find((s) => s.id === id && !s.locked) ?? STARS[0]!;

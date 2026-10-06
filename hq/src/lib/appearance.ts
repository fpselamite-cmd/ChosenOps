import { useEffect } from 'react';

/** How the HQ looks to one member. Saved on their member file and cached on the device. */
export interface Prefs {
  accent?: 'gold' | 'rose' | 'silver' | 'emerald' | 'violet';
  sky?: 'stars' | 'deep' | 'plain';
  motion?: 'on' | 'off';
  wheel?: 'on' | 'off';
  text?: 'normal' | 'large';
  shooting?: 'on' | 'off';
}

export const DEFAULT_PREFS: Required<Prefs> = { accent: 'gold', sky: 'stars', motion: 'on', wheel: 'on', text: 'normal', shooting: 'on' };

export const ACCENTS: { id: NonNullable<Prefs['accent']>; label: string; swatch: string }[] = [
  { id: 'gold', label: 'Chosen gold', swatch: 'linear-gradient(135deg,#fdf6dd,#d4af37 50%,#6e5516)' },
  { id: 'rose', label: 'Rose gold', swatch: 'linear-gradient(135deg,#fdf0ed,#d98e7f 50%,#6e4035)' },
  { id: 'silver', label: 'Moonlight', swatch: 'linear-gradient(135deg,#f6f8fc,#a3b1cc 50%,#49536a)' },
  { id: 'emerald', label: 'Emerald', swatch: 'linear-gradient(135deg,#ecfdf3,#43c585 50%,#1a5e3e)' },
  { id: 'violet', label: 'Amethyst', swatch: 'linear-gradient(135deg,#f5f1fe,#a487f0 50%,#4a3a7e)' },
];
export const SKIES: { id: NonNullable<Prefs['sky']>; label: string; hint: string }[] = [
  { id: 'stars', label: 'Starry night', hint: 'The sky from the seal' },
  { id: 'deep', label: 'Deep space', hint: 'Nebula glow, more color' },
  { id: 'plain', label: 'Plain black', hint: 'No stars, easiest to read' },
];

const KEY = 'chosenops.prefs';
export const cachedPrefs = (): Prefs => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
};

/** Puts the prefs on <html> so the CSS can follow them. */
export function applyPrefs(p: Prefs) {
  const all = { ...DEFAULT_PREFS, ...p };
  const el = document.documentElement;
  el.dataset.accent = all.accent;
  el.dataset.sky = all.sky;
  el.dataset.motion = all.motion;
  el.dataset.wheel = all.wheel;
  el.dataset.text = all.text;
  el.dataset.shooting = all.shooting;
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private mode: fine, the member file still has them.
  }
}

/** Keeps <html> in step with the signed-in member's saved prefs. */
export function useApplyPrefs(prefs?: Prefs | null) {
  useEffect(() => {
    applyPrefs(prefs ?? cachedPrefs());
  }, [prefs]);
}

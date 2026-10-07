import { Backpack, Bomb, Box, Crosshair, FireExtinguisher, Hammer, Pill, Shield, Sword, Wrench, Zap } from 'lucide-react';

/** One icon per kind of item, for tiles with no picture. */
export const KIND_ICON = {
  gun: Crosshair,
  attachment: Wrench,
  ammo: Zap,
  melee: Sword,
  armor: Shield,
  safety: FireExtinguisher,
  throwable: Bomb,
  gear: Backpack,
  tool: Hammer,
  consumable: Pill,
  other: Box,
} as const;

/** Tile border color by kind, like loot rarity. */
export const KIND_COLOR: Record<string, string> = {
  gun: '#d4af37',
  attachment: '#a487f0',
  ammo: '#9ca3af',
  melee: '#e25560',
  armor: '#5f91ef',
  safety: '#2dd4bf',
  throwable: '#f59e0b',
  gear: '#c08a3e',
  tool: '#94a3b8',
  consumable: '#f472b6',
  other: '#e5e7eb',
  drug: '#43c585',
};

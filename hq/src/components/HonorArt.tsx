import {
  Box,
  CalendarDays,
  Car,
  Coins,
  Crosshair,
  Crown,
  DollarSign,
  Eye,
  Feather,
  Flag,
  Flame,
  FlaskConical,
  Gem,
  Ghost,
  HandCoins,
  Heart,
  HelpCircle,
  Landmark,
  MessageCircle,
  Moon,
  Package,
  Rose,
  Shield,
  Skull,
  Sprout,
  Star,
  Swords,
  Target,
  Trophy,
  Utensils,
  WashingMachine,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { rarityOf, type Honor, type Rarity } from '../lib/honors';
import type { Member } from '../lib/types';
import { Avatar } from './Avatar';

export const ICONS: Record<string, LucideIcon> = { Skull, Crown, Swords, Crosshair, Flag, Star, Package, Car, Sprout, FlaskConical, Box, Gem, WashingMachine, HandCoins, Utensils, CalendarDays, Flame, Landmark, Coins, Feather, Eye, Target, MessageCircle, Shield, Heart, Moon, Rose, Zap, Trophy, Ghost };

const vars = (r: Rarity, extra: CSSProperties = {}) => ({ '--rar': rarityOf(r).color, ...extra }) as CSSProperties;

/** A badge: its icon on a gem, shield or hex in the rarity's color. Higher tiers glow, shimmer, burn. */
export function Badge({ h, size = 64, locked }: { h: Pick<Honor, 'icon' | 'shape' | 'rarity'>; size?: number; locked?: boolean }) {
  const Icon = locked ? HelpCircle : (ICONS[h.icon ?? ''] ?? Star);
  return (
    <span className={`hb-badge hb-${h.shape ?? 'gem'} rar-${h.rarity} ${locked ? 'locked' : ''}`} style={vars(h.rarity, { width: size, height: size })}>
      <span className="hb-badge-face">
        <Icon style={{ width: size * 0.42, height: size * 0.42 }} strokeWidth={1.8} />
      </span>
    </span>
  );
}

const ORNAMENTS: Record<string, { icon: LucideIcon; n: number } | null> = {
  iron: null,
  barbed: null,
  roses: { icon: Rose, n: 6 },
  skulls: { icon: Skull, n: 6 },
  money: { icon: DollarSign, n: 8 },
  crown: { icon: Crown, n: 1 },
  flames: { icon: Flame, n: 8 },
};

/** A Diablo-style portrait frame around someone's avatar: a theme, in the rarity's metal. */
export function Framed({ member, frame, size = 'lg', online }: { member: Pick<Member, 'name' | 'avatar'>; frame?: Honor | null; size?: 'md' | 'lg' | 'xl'; online?: boolean }) {
  if (!frame) return <Avatar member={member} size={size} online={online} />;
  const o = ORNAMENTS[frame.theme ?? 'iron'];
  const px = size === 'xl' ? 96 : size === 'lg' ? 64 : 44;
  return (
    <span className={`hf hf-${frame.theme ?? 'iron'} rar-${frame.rarity}`} style={vars(frame.rarity, { width: px + 20, height: px + 20 })}>
      <span className="hf-rays" aria-hidden />
      <span className="hf-ring" aria-hidden />
      {o &&
        Array.from({ length: o.n }, (_, i) => {
          const a = o.n === 1 ? -90 : (360 / o.n) * i - 90;
          return (
            <o.icon
              key={i}
              className="hf-orn"
              style={{ left: `${50 + 50 * Math.cos((a * Math.PI) / 180)}%`, top: `${50 + 50 * Math.sin((a * Math.PI) / 180)}%`, width: o.n === 1 ? px * 0.42 : px * 0.2, height: o.n === 1 ? px * 0.42 : px * 0.2 }}
              strokeWidth={2}
            />
          );
        })}
      <span className="hf-face">
        <Avatar member={member} size={size} online={online} />
      </span>
      {frame.rarity === 'mythic' && (
        <span className="hf-embers" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ left: `${10 + i * 11}%`, animationDelay: `${i * 0.35}s` }} />
          ))}
        </span>
      )}
    </span>
  );
}

/** A name in its equipped color and effect. */
export function FancyName({ name, hue, effect, className = '' }: { name: string; hue?: string | null; effect?: string | null; className?: string }) {
  return (
    <span className={`hn ${effect ? `hn-${effect}` : ''} ${className}`} style={hue ? ({ '--hue': hue, color: hue } as CSSProperties) : undefined} data-text={name}>
      {name}
    </span>
  );
}

/** An equipped title, in its rarity color (animated from Legendary up). */
export function TitleTag({ h, className = '' }: { h: Pick<Honor, 'name' | 'rarity'>; className?: string }) {
  return (
    <span className={`ht rar-${h.rarity} ${className}`} style={vars(h.rarity)}>
      {h.name}
    </span>
  );
}

/** A swatch for a color hue. */
export function HueDot({ color, rarity, size = 40 }: { color: string; rarity: Rarity; size?: number }) {
  return <span className={`hh rar-${rarity}`} style={vars(rarity, { width: size, height: size, background: `radial-gradient(circle at 35% 30%, color-mix(in oklab, ${color} 40%, white), ${color} 55%, color-mix(in oklab, ${color} 50%, black))` })} />;
}

/** Any honor as a tile picture. */
export function HonorPic({ h, locked, member }: { h: Honor; locked?: boolean; member?: Pick<Member, 'name' | 'avatar'> }): ReactNode {
  if (locked && h.kind !== 'badge') return <Badge h={{ icon: '', shape: 'gem', rarity: h.rarity }} locked />;
  if (h.kind === 'badge') return <Badge h={h} locked={locked} />;
  if (h.kind === 'frame') return <Framed member={member ?? { name: '?', avatar: null }} frame={h} size="md" />;
  if (h.kind === 'hue') return <HueDot color={h.color ?? '#d4af37'} rarity={h.rarity} />;
  if (h.kind === 'effect') return <FancyName name="Abc" effect={h.effect} className="text-2xl font-display" />;
  return <TitleTag h={h} className="text-sm" />;
}

export const RarityChip = ({ r }: { r: Rarity }) => (
  <span className="rar-chip" style={vars(r)}>
    {rarityOf(r).label}
  </span>
);

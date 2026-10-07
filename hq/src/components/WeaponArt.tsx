import { useId } from 'react';

/** Where each attachment slot sits on the drawing, per weapon class (viewBox 400×150). */
const ANCHORS: Record<string, Record<string, [number, number]>> = {
  rifle: { sight: [185, 30], rail: [215, 44], muzzle: [390, 66], barrel: [362, 66], handguard: [300, 62], light: [318, 90], grip: [282, 98], magazine: [212, 120], frame: [150, 64], stock: [52, 76], slide: [170, 52], cylinder: [190, 64] },
  smg: { sight: [180, 34], rail: [210, 46], muzzle: [352, 70], barrel: [325, 70], handguard: [270, 68], light: [282, 92], grip: [258, 104], magazine: [200, 124], frame: [175, 68], stock: [78, 78], slide: [160, 56], cylinder: [190, 68] },
  pistol: { sight: [205, 40], rail: [250, 96], muzzle: [318, 64], barrel: [296, 64], handguard: [260, 70], light: [262, 102], grip: [170, 112], magazine: [160, 136], frame: [222, 88], stock: [100, 110], slide: [205, 60], cylinder: [190, 72] },
  shotgun: { sight: [190, 36], rail: [215, 48], muzzle: [392, 64], barrel: [355, 64], handguard: [292, 78], light: [306, 94], grip: [150, 104], magazine: [300, 84], frame: [175, 66], stock: [55, 76], slide: [190, 56], cylinder: [190, 66] },
  sniper: { sight: [190, 26], rail: [190, 44], muzzle: [394, 64], barrel: [345, 64], handguard: [268, 66], light: [270, 88], grip: [150, 102], magazine: [200, 106], frame: [180, 66], stock: [50, 78], slide: [190, 56], cylinder: [190, 66] },
};

const SHAPES: Record<string, string[]> = {
  rifle: [
    'M18 64 L104 54 L104 86 L28 98 L18 92 Z',
    'M104 50 H246 V84 H104 Z',
    'M246 54 H340 V80 H246 Z',
    'M340 62 H388 V70 H340 Z',
    'M148 84 H170 L160 120 H140 Z',
    'M192 84 H220 L228 122 L202 126 Z',
    'M132 40 H232 V50 H132 Z',
  ],
  smg: [
    'M50 70 L118 62 L118 84 L58 92 L50 88 Z',
    'M118 54 H250 V86 H118 Z',
    'M250 60 H322 V80 H250 Z',
    'M322 66 H350 V74 H322 Z',
    'M150 86 H172 L164 118 H144 Z',
    'M188 86 H212 L216 128 L192 130 Z',
    'M140 44 H230 V54 H140 Z',
  ],
  pistol: ['M110 50 H312 V76 H110 Z', 'M124 76 H292 V94 H124 Z', 'M140 94 H192 L180 140 H140 Z', 'M196 94 Q210 110 230 94', 'M312 60 H322 V68 H312 Z'],
  shotgun: [
    'M16 66 L120 56 L120 84 L26 98 L16 92 Z',
    'M120 54 H232 V82 H120 Z',
    'M232 58 H390 V68 H232 Z',
    'M240 70 H360 V80 H240 Z',
    'M270 80 H332 V92 H270 Z',
    'M136 82 H160 L150 112 H130 Z',
  ],
  sniper: [
    'M14 70 L112 56 L120 86 L34 102 L14 96 Z',
    'M120 56 H232 V82 H120 Z',
    'M232 60 H392 V68 H232 Z',
    'M140 32 H240 V46 H140 Z',
    'M132 82 H156 L146 110 H126 Z',
    'M186 82 H214 V102 H186 Z',
    'M236 72 H300 V80 H236 Z',
  ],
};

/** An admin's picture of a gun, with where each slot sits on it (percent of width/height). */
export interface GunArt {
  image: string;
  anchors: Record<string, [number, number]>;
}

/** Where a slot sits, as a percent of the drawing: the admin's spot, or the class default. */
export function slotSpot(cls: string | undefined, slot: string, art?: GunArt | null): [number, number] {
  if (art?.anchors[slot]) return art.anchors[slot]!;
  const k = ANCHORS[cls ?? 'rifle'] ? (cls ?? 'rifle') : 'rifle';
  const [x, y] = ANCHORS[k]![slot] ?? [200, 75];
  return [(x / 400) * 100, (y / 150) * 100];
}

/**
 * A weapon with a light on every attachment slot, like a Tarkov mod screen. Filled slots glow
 * gold; tap one to pick its part. Shows the admin's picture when there is one, otherwise a
 * stylised gold outline for the gun's class.
 */
export function WeaponArt({
  cls,
  slots,
  filled,
  active,
  art,
  onSlot,
  labels,
}: {
  cls?: string;
  slots: string[];
  filled: Set<string>;
  active?: string | null;
  art?: GunArt | null;
  onSlot?: (slot: string) => void;
  labels?: Record<string, string>;
}) {
  const id = useId();
  const k = SHAPES[cls ?? 'rifle'] ? (cls ?? 'rifle') : 'rifle';
  return (
    <div className="relative w-full" style={{ aspectRatio: '400 / 150' }}>
      {art ? (
        <img src={art.image} alt="" className="absolute inset-0 size-full object-contain" style={{ filter: 'drop-shadow(0 0 10px rgba(212,175,55,0.35))' }} />
      ) : (
        <svg viewBox="0 0 400 150" className="absolute inset-0 size-full" role="img" aria-label="Weapon">
          <defs>
            <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a3424" />
              <stop offset="1" stopColor="#15130d" />
            </linearGradient>
          </defs>
          <g fill={`url(#${id}m)`} stroke="#d4af37" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round">
            {SHAPES[k]!.map((d, i) => (
              <path key={i} d={d} />
            ))}
          </g>
        </svg>
      )}
      {slots.map((s) => {
        const [x, y] = slotSpot(cls, s, art);
        const on = filled.has(s);
        const Tag = onSlot ? 'button' : 'span';
        return (
          <Tag
            key={s}
            type={onSlot ? 'button' : undefined}
            onClick={onSlot ? () => onSlot(s) : undefined}
            className={`gun-dot ${on ? 'gun-dot-on' : ''} ${active === s ? 'gun-dot-active' : ''} ${onSlot ? 'cursor-pointer' : 'pointer-events-none'}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            title={labels?.[s] ?? s}
            aria-label={labels?.[s] ?? s}
          >
            {labels && <span className="gun-dot-label">{labels[s]}</span>}
          </Tag>
        );
      })}
    </div>
  );
}

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

/** A stylised weapon outline with a light on every slot; filled slots glow gold. */
export function WeaponArt({ cls, slots, filled, active }: { cls?: string; slots: string[]; filled: Set<string>; active?: string | null }) {
  const id = useId();
  const k = SHAPES[cls ?? 'rifle'] ? (cls ?? 'rifle') : 'rifle';
  const a = ANCHORS[k]!;
  return (
    <svg viewBox="0 0 400 150" className="w-full" role="img" aria-label="Weapon">
      <defs>
        <linearGradient id={`${id}m`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3424" />
          <stop offset="1" stopColor="#15130d" />
        </linearGradient>
        <radialGradient id={`${id}g`}>
          <stop offset="0" stopColor="#ffe9a3" />
          <stop offset="1" stopColor="#d4af37" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g fill={`url(#${id}m)`} stroke="#d4af37" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round">
        {SHAPES[k]!.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {slots.map((s) => {
        const [x, y] = a[s] ?? [200, 75];
        const on = filled.has(s);
        return (
          <g key={s}>
            {on && <circle cx={x} cy={y} r={11} fill={`url(#${id}g)`} />}
            <circle cx={x} cy={y} r={active === s ? 6 : 4.5} fill={on ? '#f5d77a' : '#0a0a0b'} stroke={on ? '#fff3c4' : '#8a7a4a'} strokeWidth={active === s ? 2 : 1.4} />
          </g>
        );
      })}
    </svg>
  );
}

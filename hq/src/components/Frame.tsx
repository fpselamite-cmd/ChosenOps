import { useId, type CSSProperties, type ReactNode } from 'react';
import type { Honor, Rarity } from '../lib/honors';
import type { Member } from '../lib/types';
import { Avatar } from './Avatar';
import { METALS } from './Medal';

/**
 * Diablo-style portrait frames: a ring in the tier's metal with an ornate border that breaks out
 * of the circle (an arch, horns, a crown, thorns, skulls...). Some parts sit behind the portrait
 * (an arch, a wax seal, fanned cards), the rest in front. Epic and up move.
 */
type Parts = { back?: ReactNode; front?: ReactNode };

const RED = '#b3122b';
function star(cx: number, cy: number, r: number, n = 4, inner = 0.35) {
  return Array.from({ length: n * 2 }, (_, i) => {
    const rr = i % 2 ? r * inner : r;
    const a = (Math.PI * i) / n - Math.PI / 2;
    return `${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}
const at = (deg: number, r: number) => [60 + r * Math.cos((deg * Math.PI) / 180), 60 + r * Math.sin((deg * Math.PI) / 180)] as const;

function ornaments(theme: string, m: string, lo: string, hi: string, enamel: string): Parts {
  const s = { stroke: lo, strokeWidth: 1, strokeLinejoin: 'round' as const };
  switch (theme) {
    case 'gothic':
      return {
        back: (
          <g>
            <path d="M24 52 Q24 14 60 -2 Q96 14 96 52 Z" fill={m} {...s} />
            <path d="M32 50 Q33 22 60 8 Q87 22 88 50 Z" fill={enamel} opacity="0.85" />
            {[[18, 46], [102, 46], [14, 66], [106, 66]].map(([x, y], i) => (
              <polygon key={i} points={`${x},${y} ${x + (x < 60 ? 10 : -10)},${y - 6} ${x + (x < 60 ? 10 : -10)},${y + 6}`} fill={m} {...s} />
            ))}
          </g>
        ),
        front: (
          <g>
            <path d="M44 98 H76 L70 112 H50 Z" fill={m} {...s} />
            <circle cx="60" cy="104" r="4.5" fill={RED} stroke={lo} strokeWidth="0.8" />
            <circle cx="58.6" cy="102.6" r="1.4" fill="#fff" opacity="0.8" />
            <polygon points={star(60, 6, 6)} fill={hi} />
          </g>
        ),
      };
    case 'horns':
      return {
        front: (
          <g>
            <path d="M30 34 C14 26 6 10 14 -2 C16 12 26 20 40 24 Z" fill={m} {...s} />
            <path d="M90 34 C106 26 114 10 106 -2 C104 12 94 20 80 24 Z" fill={m} {...s} />
            {[[48, 104], [60, 110], [72, 104]].map(([x, y], i) => (
              <polygon key={i} points={`${x - 4},${y - 6} ${x + 4},${y - 6} ${x},${y + 6}`} fill={m} {...s} />
            ))}
          </g>
        ),
      };
    case 'crown':
      return {
        front: (
          <g>
            <path d="M34 26 L38 4 L48 16 L60 0 L72 16 L82 4 L86 26 Z" fill={m} {...s} />
            <rect x="33" y="22" width="54" height="7" rx="1.5" fill={m} {...s} />
            {[45, 60, 75].map((x, i) => (
              <circle key={x} cx={x} cy="25.5" r="2.2" fill={i === 1 ? RED : '#2563eb'} />
            ))}
          </g>
        ),
      };
    case 'roses':
      return {
        front: (
          <g>
            <circle cx="60" cy="60" r="49" fill="none" stroke="#14532d" strokeWidth="2.4" strokeDasharray="7 3" />
            {Array.from({ length: 14 }, (_, i) => {
              const [x, y] = at(i * 25.7, 49);
              const [x2, y2] = at(i * 25.7 + 6, 54);
              return <line key={i} x1={x} y1={y} x2={x2} y2={y2} stroke="#14532d" strokeWidth="1.6" strokeLinecap="round" />;
            })}
            {[200, 330, 85].map((d) => {
              const [x, y] = at(d, 49);
              return (
                <g key={d}>
                  <circle cx={x} cy={y} r="7" fill={RED} stroke="#5b0a14" strokeWidth="1" />
                  <path d={`M${x - 3} ${y} a3 3 0 1 1 3 3 a2 2 0 1 1 -1.6 -3`} fill="none" stroke="#5b0a14" strokeWidth="1" />
                </g>
              );
            })}
          </g>
        ),
      };
    case 'skulls': {
      const skull = (x: number, y: number, r: number, k: number) => (
        <g key={k}>
          <path d={`M${x} ${y - r} C${x - r} ${y - r} ${x - r} ${y + r * 0.4} ${x - r * 0.6} ${y + r * 0.55} V${y + r} H${x + r * 0.6} V${y + r * 0.55} C${x + r} ${y + r * 0.4} ${x + r} ${y - r} ${x} ${y - r} Z`} fill={m} {...s} />
          <circle cx={x - r * 0.38} cy={y} r={r * 0.26} fill="#0a0a0a" />
          <circle cx={x + r * 0.38} cy={y} r={r * 0.26} fill="#0a0a0a" />
        </g>
      );
      return {
        front: (
          <g>
            <path d="M42 8 L78 22 M78 8 L42 22" stroke={m} strokeWidth="5" strokeLinecap="round" />
            <path d="M42 8 L78 22 M78 8 L42 22" stroke={lo} strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
            {skull(60, 104, 11, 1)}
            {skull(14, 70, 7, 2)}
            {skull(106, 70, 7, 3)}
          </g>
        ),
      };
    }
    case 'barbed':
      return {
        front: (
          <g fill="none">
            <path d={Array.from({ length: 41 }, (_, i) => { const [x, y] = at(i * 9, 48 + (i % 2 ? 2.5 : -2.5)); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ')} stroke={m} strokeWidth="1.8" />
            {Array.from({ length: 10 }, (_, i) => {
              const [x, y] = at(i * 36 + 10, 48);
              return <path key={i} d={`M${x - 3} ${y - 3} L${x + 3} ${y + 3} M${x + 3} ${y - 3} L${x - 3} ${y + 3}`} stroke={m} strokeWidth="1.6" strokeLinecap="round" />;
            })}
          </g>
        ),
      };
    case 'money':
      return {
        front: (
          <g>
            <rect x="30" y="98" width="60" height="16" rx="1.5" fill="#3f7d3a" stroke="#1d3d1b" strokeWidth="1" />
            <ellipse cx="60" cy="106" rx="9" ry="6" fill="none" stroke="#c8e6b9" strokeWidth="1" />
            <text x="60" y="109.5" fontSize="10" fontWeight="900" textAnchor="middle" fill="#e5f5dc" fontFamily="Cinzel, serif">$</text>
            {[[12, 50], [108, 50], [16, 30], [104, 30]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="6" fill={m} {...s} />
            ))}
          </g>
        ),
      };
    case 'flames':
      return {
        back: (
          <g className="fr-flicker">
            {Array.from({ length: 11 }, (_, i) => {
              const d = 180 + i * 18;
              const [x, y] = at(d, 46);
              const [tx, ty] = at(d, 66 + (i % 2 ? 0 : 8));
              return <path key={i} d={`M${x - 6} ${y} Q${(x + tx) / 2 - 6} ${(y + ty) / 2} ${tx} ${ty} Q${(x + tx) / 2 + 6} ${(y + ty) / 2} ${x + 6} ${y} Z`} fill={i % 2 ? '#f97316' : '#facc15'} opacity="0.9" />;
            })}
          </g>
        ),
      };
    case 'chips':
      return {
        front: (
          <g>
            {[[16, 16, RED], [104, 16, '#1d4ed8'], [16, 104, '#15803d'], [104, 104, '#111827']].map(([x, y, c], i) => (
              <g key={i}>
                <circle cx={x as number} cy={y as number} r="10" fill={c as string} stroke={lo} strokeWidth="1" />
                <circle cx={x as number} cy={y as number} r="8.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeDasharray="2.4 3" />
                <circle cx={x as number} cy={y as number} r="4.5" fill={m} />
              </g>
            ))}
          </g>
        ),
      };
    case 'cards':
      return {
        back: (
          <g>
            {[-28, 0, 28].map((r, i) => (
              <g key={r} transform={`rotate(${r} 60 70)`}>
                <rect x="44" y="-2" width="32" height="44" rx="3" fill="#f5f0e1" stroke={lo} strokeWidth="1" />
                <text x="50" y="10" fontSize="9" fontWeight="800" fill={i === 1 ? RED : '#111'} fontFamily="serif">{['K', 'A', 'Q'][i]}</text>
              </g>
            ))}
          </g>
        ),
      };
    case 'stars':
      return {
        back: <polygon points={star(60, 60, 60, 8, 0.72)} fill={m} {...s} />,
        front: (
          <g>
            {[300, 20, 160, 240].map((d, i) => {
              const [x, y] = at(d, 54);
              return <polygon key={i} className="fr-twinkle" style={{ animationDelay: `${i * 0.5}s` }} points={star(x, y, 4.5)} fill="#fff7cf" />;
            })}
          </g>
        ),
      };
    case 'lightning':
      return {
        front: (
          <g className="fr-zap">
            <path d="M14 18 L28 40 L20 42 L32 64 L12 40 L20 38 Z" fill="#fde047" stroke="#a16207" strokeWidth="0.8" />
            <path d="M106 18 L92 40 L100 42 L88 64 L108 40 L100 38 Z" fill="#7dd3fc" stroke="#075985" strokeWidth="0.8" />
          </g>
        ),
      };
    case 'hearts': {
      const heart = (x: number, y: number, r: number, k: number) => <path key={k} d={`M${x} ${y + r} C${x - r * 2} ${y - r * 0.2} ${x - r} ${y - r * 1.6} ${x} ${y - r * 0.5} C${x + r} ${y - r * 1.6} ${x + r * 2} ${y - r * 0.2} ${x} ${y + r} Z`} fill={RED} stroke="#5b0a14" strokeWidth="0.8" />;
      return { front: <g>{[heart(60, 8, 7, 1), heart(60, 108, 6, 2), heart(14, 60, 4.5, 3), heart(106, 60, 4.5, 4)]}</g> };
    }
    case 'neon':
      return {
        front: (
          <g className="fr-neon" fill="none">
            <circle cx="60" cy="60" r="49" stroke="#f0abfc" strokeWidth="2.4" style={{ filter: 'drop-shadow(0 0 3px #e879f9) drop-shadow(0 0 7px #c026d3)' }} />
            <circle cx="60" cy="60" r="53" stroke="#67e8f9" strokeWidth="1.6" strokeDasharray="14 5" style={{ filter: 'drop-shadow(0 0 3px #22d3ee) drop-shadow(0 0 7px #0891b2)' }} />
          </g>
        ),
      };
    case 'laurel':
      return {
        front: (
          <g>
            {[-1, 1].map((side) =>
              Array.from({ length: 8 }, (_, i) => {
                const d = side < 0 ? 110 + i * 18 : 70 - i * 18;
                const [x, y] = at(d, 50);
                return <ellipse key={`${side}${i}`} cx={x} cy={y} rx="7" ry="3.2" transform={`rotate(${d + side * 55} ${x} ${y})`} fill={m} {...s} />;
              }),
            )}
          </g>
        ),
      };
    case 'wax':
      return {
        back: (
          <g>
            <path d="M44 96 L36 118 L46 112 L50 120 L56 98 Z" fill={RED} />
            <path d="M76 96 L84 118 L74 112 L70 120 L64 98 Z" fill="#8f0f24" />
            <path d={Array.from({ length: 24 }, (_, i) => { const [x, y] = at(i * 15, 55 + (i % 3 === 0 ? 3 : 0)); return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; }).join(' ') + ' Z'} fill={enamel} stroke="#00000055" strokeWidth="1" />
          </g>
        ),
      };
    case 'band':
      return {
        front: (
          <g>
            <rect x="8" y="94" width="104" height="13" fill="#e8dcc0" stroke="#7a6a44" strokeWidth="0.8" transform="rotate(-6 60 100)" />
            <text x="60" y="103.5" fontSize="7.5" fontWeight="900" textAnchor="middle" fill="#3f2d0f" fontFamily="Cinzel, serif" letterSpacing="1" transform="rotate(-6 60 100)">$10,000</text>
          </g>
        ),
      };
    default:
      // iron: four rivets
      return {
        front: (
          <g>
            {[45, 135, 225, 315].map((d) => {
              const [x, y] = at(d, 43);
              return <circle key={d} cx={x} cy={y} r="2.4" fill={hi} stroke={lo} strokeWidth="0.8" />;
            })}
          </g>
        ),
      };
  }
}

/** A portrait in its frame. Without a frame, just the avatar. */
export function Framed({ member, frame, size = 'lg', online }: { member: Pick<Member, 'name' | 'avatar'>; frame?: Pick<Honor, 'theme' | 'rarity'> | null; size?: 'md' | 'lg' | 'xl'; online?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  if (!frame) return <Avatar member={member} size={size} online={online} />;
  const px = size === 'xl' ? 96 : size === 'lg' ? 64 : 44;
  const box = px * 1.5;
  const rarity = frame.rarity as Rarity;
  const metal = METALS[rarity];
  const m = `url(#fm${uid})`;
  const parts = ornaments(frame.theme ?? 'iron', m, metal.lo, metal.hi, metal.enamel);
  const grad =
    rarity === 'mythic' ? (
      <linearGradient id={`fm${uid}`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#fbcfe8" />
        <stop offset="0.33" stopColor="#c4b5fd" />
        <stop offset="0.66" stopColor="#a5f3fc" />
        <stop offset="1" stopColor="#fde68a" />
      </linearGradient>
    ) : (
      <linearGradient id={`fm${uid}`} x1="0.1" y1="0" x2="0.9" y2="1">
        <stop offset="0" stopColor={metal.hi} />
        <stop offset="0.45" stopColor={metal.mid} />
        <stop offset="0.75" stopColor={metal.lo} />
        <stop offset="1" stopColor={metal.mid} />
      </linearGradient>
    );
  return (
    <span className={`fr fr-${frame.theme ?? 'iron'} rar-${rarity}`} style={{ width: box, height: box, ['--rar' as string]: metal.mid } as CSSProperties}>
      <span className="fr-rays" aria-hidden />
      <svg className="fr-back" viewBox="0 0 120 120" width={box} height={box} aria-hidden>
        <defs>{grad}</defs>
        {parts.back}
      </svg>
      <span className="fr-face" style={{ width: px, height: px }}>
        <Avatar member={member} size={size} online={online} />
      </span>
      <svg className="fr-front" viewBox="0 0 120 120" width={box} height={box} aria-hidden>
        <defs>
          <linearGradient id={`fr${uid}`} x1="0.1" y1="0" x2="0.9" y2="1">
            <stop offset="0" stopColor={metal.hi} />
            <stop offset="0.5" stopColor={metal.mid} />
            <stop offset="1" stopColor={metal.lo} />
          </linearGradient>
        </defs>
        {/* the ring, in the tier's metal */}
        <circle cx="60" cy="60" r="43.2" fill="none" stroke={rarity === 'mythic' ? m : `url(#fr${uid})`} strokeWidth="6.4" />
        <circle cx="60" cy="60" r="40" fill="none" stroke={metal.lo} strokeWidth="1" />
        <circle cx="60" cy="60" r="46.4" fill="none" stroke={metal.lo} strokeWidth="0.9" />
        <circle cx="60" cy="60" r="43.2" fill="none" stroke={metal.hi} strokeWidth="0.6" strokeDasharray="1 3.5" opacity="0.7" />
        {parts.front}
      </svg>
      {rarity === 'mythic' && (
        <span className="hf-embers" aria-hidden>
          {Array.from({ length: 8 }, (_, i) => (
            <i key={i} style={{ left: `${10 + i * 11}%`, animationDelay: `${i * 0.35}s` }} />
          ))}
        </span>
      )}
    </span>
  );
}

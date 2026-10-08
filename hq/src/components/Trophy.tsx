import { useId } from 'react';
import type { Tier, TrophyDesign } from '../lib/trophies';

/** Metal stops per tier: dark edge → light → highlight → mid → dark edge. */
const METALS: Record<Tier, { stops: string[]; trim: string; ink: string }> = {
  1: { stops: ['#4a2610', '#a8622a', '#f2b67a', '#c47a3a', '#5c3418'], trim: '#3b1d0b', ink: '#2a1407' },
  2: { stops: ['#3c434c', '#9aa3ad', '#ffffff', '#c3cad3', '#4b5563'], trim: '#2b3138', ink: '#1f242a' },
  3: { stops: ['#5c4510', '#b8932a', '#fff2b0', '#e6c35c', '#6e5516'], trim: '#4a370c', ink: '#3a2a08' },
  4: { stops: ['#020202', '#1c1c1f', '#4a4a52', '#242428', '#050505'], trim: '#d4af37', ink: '#d4af37' },
};

const ROMAN = ['', 'I', 'II', 'III', 'IV'];

/** The figure for each design, drawn in a 100×100 box. `m` is the metal fill, `t` the trim colour, `k` the dark detail colour. */
function Figure({ design, m, t, k }: { design: TrophyDesign; m: string; t: string; k: string }) {
  const s = { stroke: t, strokeWidth: 1.6, strokeLinejoin: 'round' as const };
  switch (design) {
    case 'cup':
      return (
        <g>
          <path d="M30 22 C14 22 14 46 32 50" fill="none" stroke={m} strokeWidth="6" strokeLinecap="round" />
          <path d="M70 22 C86 22 86 46 68 50" fill="none" stroke={m} strokeWidth="6" strokeLinecap="round" />
          <path d="M28 14 H72 V30 C72 54 62 64 50 66 C38 64 28 54 28 30 Z" fill={m} {...s} />
          <rect x="45" y="66" width="10" height="14" fill={m} {...s} />
          <path d="M34 80 H66 L71 92 H29 Z" fill={m} {...s} />
          <path d="M40 30 L44 38 L52 39 L46 44 L48 52 L40 48 L33 52 L35 44 L29 39 L37 38 Z" transform="translate(10 -6)" fill={k} opacity="0.55" />
        </g>
      );
    case 'leaf':
      return (
        <g>
          <path transform="translate(14 2) scale(0.1406)" d="M256 0c5.3 0 10.3 2.7 13.3 7.1c15.8 23.5 36.7 63.7 49.2 109c7.2 26.4 11.8 55.2 10.4 84c11.5-8.8 23.7-16.7 35.8-23.6c41-23.3 84.4-36.9 112.2-42.5c5.2-1 10.7 .6 14.4 4.4s5.4 9.2 4.4 14.5c-5.6 27.7-19.3 70.9-42.7 111.7c-9.1 15.9-19.9 31.7-32.4 46.3c27.8 6.6 52.4 17.3 67.2 25.5c5.1 2.8 8.2 8.2 8.2 14s-3.2 11.2-8.2 14c-15.2 8.4-40.9 19.5-69.8 26.1c-20.2 4.6-42.9 7.2-65.2 4.6l8.3 33.1c1.5 6.1-.6 12.4-5.5 16.4s-11.6 4.6-17.2 1.9L280 417.2V488c0 13.3-10.7 24-24 24s-24-10.7-24-24V417.2l-58.5 29.1c-5.6 2.8-12.3 2.1-17.2-1.9s-7-10.3-5.5-16.4l8.3-33.1c-22.2 2.6-45 0-65.2-4.6c-28.9-6.6-54.6-17.6-69.8-26.1c-5.1-2.8-8.2-8.2-8.2-14s3.2-11.2 8.2-14c14.8-8.2 39.4-18.8 67.2-25.5C78.9 296.3 68.1 280.5 59 264.6c-23.4-40.8-37.1-84-42.7-111.7c-1.1-5.2 .6-10.7 4.4-14.5s9.2-5.4 14.4-4.4c27.9 5.5 71.2 19.2 112.2 42.5c12.1 6.9 24.3 14.7 35.8 23.6c-1.4-28.7 3.1-57.6 10.4-84c12.5-45.3 33.4-85.5 49.2-109c3-4.4 8-7.1 13.3-7.1z" fill={m} stroke={t} strokeWidth="8" />
          <rect x="46" y="74" width="8" height="10" fill={m} {...s} />
          <path d="M34 84 H66 L70 92 H30 Z" fill={m} {...s} />
        </g>
      );
    case 'brick':
      return (
        <g>
          <polygon points="50,14 82,28 50,42 18,28" fill={m} {...s} />
          <polygon points="18,28 50,42 50,82 18,68" fill={m} {...s} />
          <polygon points="18,28 50,42 50,82 18,68" fill="#000" opacity="0.28" />
          <polygon points="82,28 50,42 50,82 82,68" fill={m} {...s} />
          <polygon points="82,28 50,42 50,82 82,68" fill="#000" opacity="0.12" />
          <text x="66" y="60" fontSize="14" fontWeight="900" fill={k} opacity="0.55" textAnchor="middle" fontFamily="Cinzel, serif" transform="skewY(-24) translate(0 30)">
            C
          </text>
          <path d="M30 84 H70 L73 92 H27 Z" fill={m} {...s} />
        </g>
      );
    case 'beaker':
      return (
        <g>
          <path d="M40 8 H60 V32 L80 72 A7 7 0 0 1 74 82 H26 A7 7 0 0 1 20 72 L40 32 Z" fill={m} {...s} />
          <path d="M28 64 H72 L78 74 A5 5 0 0 1 74 79 H26 A5 5 0 0 1 22 74 Z" fill={k} opacity="0.35" />
          <circle cx="42" cy="56" r="3.5" fill={k} opacity="0.35" />
          <circle cx="55" cy="48" r="2.5" fill={k} opacity="0.35" />
          <circle cx="50" cy="38" r="2" fill={k} opacity="0.35" />
          <rect x="36" y="4" width="28" height="6" rx="2" fill={m} {...s} />
          <path d="M32 84 H68 L71 92 H29 Z" fill={m} {...s} />
        </g>
      );
    case 'snowflake':
      return (
        <g>
          {[0, 60, 120].map((r) => (
            <g key={r} transform={`rotate(${r} 50 44)`}>
              <line x1="50" y1="8" x2="50" y2="80" stroke={t} strokeWidth="9" strokeLinecap="round" />
              <line x1="50" y1="8" x2="50" y2="80" stroke={m} strokeWidth="6.5" strokeLinecap="round" />
              {[18, 70].map((y) => (
                <g key={y}>
                  <path d={`M50 ${y} L${y < 44 ? 41 : 41} ${y < 44 ? y - 8 : y + 8} M50 ${y} L59 ${y < 44 ? y - 8 : y + 8}`} stroke={m} strokeWidth="4.5" strokeLinecap="round" />
                </g>
              ))}
            </g>
          ))}
          <polygon points="50,34 59,39 59,49 50,54 41,49 41,39" fill={m} {...s} />
          <path d="M40 84 H60 L63 92 H37 Z" fill={m} {...s} />
        </g>
      );
    case 'moneybag':
      return (
        <g>
          <path d="M38 20 L62 20 L56 32 C78 40 84 62 77 74 C72 82 61 86 50 86 C39 86 28 82 23 74 C16 62 22 40 44 32 Z" fill={m} {...s} />
          <path d="M40 30 Q50 36 60 30" fill="none" stroke={t} strokeWidth="3" />
          <path d="M36 16 Q50 26 64 16" fill="none" stroke={m} strokeWidth="5" strokeLinecap="round" />
          <text x="50" y="72" fontSize="30" fontWeight="900" textAnchor="middle" fill={k} opacity="0.6" fontFamily="Cinzel, serif">
            $
          </text>
        </g>
      );
    case 'coins':
      return (
        <g>
          {[0, 1, 2, 3, 4].map((i) => {
            const y = 76 - i * 11;
            const x = i % 2 ? 3 : -2;
            return (
              <g key={i} transform={`translate(${x} 0)`}>
                <path d={`M24 ${y} V${y + 8} A26 7 0 0 0 76 ${y + 8} V${y}`} fill={m} {...s} />
                <ellipse cx="50" cy={y} rx="26" ry="7" fill={m} {...s} />
                <ellipse cx="50" cy={y} rx="16" ry="3.5" fill="none" stroke={k} strokeWidth="1" opacity="0.4" />
              </g>
            );
          })}
        </g>
      );
    case 'mask':
      return (
        <g>
          <path d="M12 38 C12 22 36 22 50 31 C64 22 88 22 88 38 C88 56 66 60 50 49 C34 60 12 56 12 38 Z" fill={m} {...s} />
          <ellipse cx="33" cy="38" rx="9" ry="6" fill={k} opacity="0.85" />
          <ellipse cx="67" cy="38" rx="9" ry="6" fill={k} opacity="0.85" />
          <path d="M84 34 C94 36 96 46 90 54" fill="none" stroke={m} strokeWidth="3" strokeLinecap="round" />
          <rect x="46" y="54" width="8" height="26" fill={m} {...s} />
          <path d="M32 80 H68 L72 92 H28 Z" fill={m} {...s} />
        </g>
      );
    case 'crest':
    case 'shield':
      return (
        <g>
          <path d="M50 6 L82 18 V42 C82 64 68 78 50 88 C32 78 18 64 18 42 V18 Z" fill={m} {...s} />
          <path d="M50 14 L74 23 V42 C74 59 63 70 50 78 C37 70 26 59 26 42 V23 Z" fill="none" stroke={k} strokeWidth="1.4" opacity="0.5" />
          {design === 'crest' ? (
            <text x="50" y="58" fontSize="30" fontWeight="900" textAnchor="middle" fill={k} opacity="0.65" fontFamily="Cinzel, serif">
              C
            </text>
          ) : (
            <path d="M34 34 L50 44 L66 34 M34 46 L50 56 L66 46 M34 58 L50 68 L66 58" fill="none" stroke={k} strokeWidth="4" strokeLinejoin="round" opacity="0.55" />
          )}
        </g>
      );
    case 'crown':
      return (
        <g>
          <path d="M16 68 L20 26 L35 46 L50 16 L65 46 L80 26 L84 68 Z" fill={m} {...s} />
          <rect x="14" y="66" width="72" height="12" rx="2" fill={m} {...s} />
          {[20, 50, 80].map((x, i) => (
            <circle key={x} cx={x} cy={[24, 14, 24][i]} r="4" fill={m} {...s} />
          ))}
          {[30, 50, 70].map((x) => (
            <circle key={x} cx={x} cy="72" r="3" fill={k} opacity="0.7" />
          ))}
          <path d="M22 80 Q50 92 78 80 L80 88 Q50 98 20 88 Z" fill="#7a1020" opacity="0.85" />
        </g>
      );
    case 'skull':
      return (
        <g>
          <path d="M50 8 C28 8 18 24 18 42 C18 54 24 60 30 62 V74 H70 V62 C76 60 82 54 82 42 C82 24 72 8 50 8 Z" fill={m} {...s} />
          <ellipse cx="37" cy="42" rx="9" ry="10" fill={k} opacity="0.85" />
          <ellipse cx="63" cy="42" rx="9" ry="10" fill={k} opacity="0.85" />
          <path d="M50 52 L45 60 H55 Z" fill={k} opacity="0.8" />
          {[38, 46, 54, 62].map((x) => (
            <line key={x} x1={x} y1="66" x2={x} y2="74" stroke={k} strokeWidth="1.5" opacity="0.6" />
          ))}
          <path d="M34 80 H66 L70 92 H30 Z" fill={m} {...s} />
        </g>
      );
    case 'star':
      return (
        <g>
          <path d="M36 52 L24 92 L36 84 L42 94 L50 58 Z" fill="#7a1020" />
          <path d="M64 52 L76 92 L64 84 L58 94 L50 58 Z" fill="#5a0c18" />
          <circle cx="50" cy="40" r="32" fill={m} {...s} />
          <path d="M50 14 L57 32 L76 33 L61 45 L66 64 L50 53 L34 64 L39 45 L24 33 L43 32 Z" fill={k} opacity="0.45" />
        </g>
      );
    case 'laurel':
      return (
        <g>
          {[-1, 1].map((side) =>
            Array.from({ length: 7 }, (_, i) => {
              const a = (-200 + i * 26) * (Math.PI / 180);
              const x = 50 + side * Math.cos(a) * 34;
              const y = 46 + Math.sin(a) * -34;
              return <ellipse key={`${side}${i}`} cx={x} cy={y} rx="9" ry="4.2" transform={`rotate(${side * (i * 26 - 40)} ${x} ${y})`} fill={m} {...s} />;
            }),
          )}
          <circle cx="50" cy="44" r="15" fill={m} {...s} />
          <path d="M50 33 L53 41 L61 41 L55 46 L57 54 L50 49 L43 54 L45 46 L39 41 L47 41 Z" fill={k} opacity="0.55" />
          <path d="M38 84 H62 L66 92 H34 Z" fill={m} {...s} />
        </g>
      );
    case 'crosshair':
      return (
        <g>
          <circle cx="50" cy="42" r="34" fill="none" stroke={t} strokeWidth="9" />
          <circle cx="50" cy="42" r="34" fill="none" stroke={m} strokeWidth="6.5" />
          <circle cx="50" cy="42" r="18" fill="none" stroke={m} strokeWidth="5" />
          <circle cx="50" cy="42" r="5" fill={m} {...s} />
          <path d="M50 2 V22 M50 62 V82 M10 42 H30 M70 42 H90" stroke={m} strokeWidth="5" strokeLinecap="round" />
          <path d="M40 84 H60 L63 92 H37 Z" fill={m} {...s} />
        </g>
      );
    case 'revolver':
      return (
        <g>
          <g transform="rotate(-14 50 44)">
            <rect x="10" y="30" width="46" height="9" rx="2" fill={m} {...s} />
            <rect x="12" y="26.5" width="40" height="4.5" rx="1" fill={m} {...s} />
            <rect x="12" y="22.5" width="3.5" height="5" fill={m} {...s} />
            <path d="M54 25 H74 L79 35 V47 H54 Z" fill={m} {...s} />
            <rect x="47" y="28" width="18" height="16" rx="5" fill={m} {...s} />
            {[51, 56, 61].map((x) => (
              <line key={x} x1={x} y1="29.5" x2={x} y2="42.5" stroke={k} strokeWidth="1.2" opacity="0.55" />
            ))}
            <path d="M73 25 L82 18 L85 22 L78 30 Z" fill={m} {...s} />
            <path d="M58 47 Q57 60 67 60 L69 52" fill="none" stroke={m} strokeWidth="3" />
            <path d="M63 47 L64 55" stroke={k} strokeWidth="2" strokeLinecap="round" />
            <path d="M68 46 H80 L89 72 Q83 79 74 75 L66 52 Z" fill={m} {...s} />
            <path d="M71 52 L82 70 M75 50 L85 68 M70 58 L78 72" stroke={k} strokeWidth="1" opacity="0.5" />
            <circle cx="77" cy="58" r="2" fill={k} opacity="0.6" />
          </g>
          <rect x="44" y="72" width="12" height="12" fill={m} {...s} />
          <path d="M30 84 H70 L74 92 H26 Z" fill={m} {...s} />
        </g>
      );
    case 'ledger':
      return (
        <g>
          <path d="M28 14 H72 Q78 14 78 20 V80 H34 Q28 80 28 74 Z" fill={m} {...s} />
          <rect x="72" y="18" width="7" height="60" fill="#f4ecd8" stroke={t} strokeWidth="1" />
          {[24, 30, 36, 42, 48, 54, 60, 66, 72].map((y) => (
            <line key={y} x1="72.5" y1={y} x2="78.5" y2={y} stroke="#b9ab88" strokeWidth="0.6" />
          ))}
          <rect x="22" y="14" width="11" height="66" rx="3" fill={m} {...s} />
          {[24, 40, 56, 70].map((y) => (
            <rect key={y} x="22" y={y} width="11" height="2.4" fill={k} opacity="0.45" />
          ))}
          <rect x="40" y="26" width="30" height="22" rx="2" fill="none" stroke={k} strokeWidth="1.4" opacity="0.6" />
          <text x="55" y="43" fontSize="17" fontWeight="900" textAnchor="middle" fill={k} opacity="0.65" fontFamily="Cinzel, serif">
            $
          </text>
          <rect x="28" y="56" width="50" height="6" fill={k} opacity="0.35" />
          <path d="M34 84 H66 L70 92 H30 Z" fill={m} {...s} />
        </g>
      );
    case 'dice':
      return (
        <g>
          <path d="M30 14 H70 L63 60 H37 Z" fill={m} {...s} />
          <ellipse cx="50" cy="14" rx="20" ry="4.5" fill={m} {...s} />
          <ellipse cx="50" cy="14" rx="15" ry="2.6" fill={k} opacity="0.55" />
          <path d="M34 30 H66 M35.5 40 H64.5" stroke={k} strokeWidth="1.2" opacity="0.45" />
          <g transform="rotate(-14 32 72)">
            <rect x="20" y="60" width="22" height="22" rx="4" fill={m} {...s} />
            {[[26, 66], [36, 76], [31, 71]].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="2.1" fill={k} opacity="0.85" />
            ))}
          </g>
          <g transform="rotate(12 66 72)">
            <rect x="55" y="62" width="20" height="20" rx="4" fill={m} {...s} />
            {[[60, 67], [70, 67], [60, 77], [70, 77]].map(([x, y]) => (
              <circle key={`${x}${y}`} cx={x} cy={y} r="1.9" fill={k} opacity="0.85" />
            ))}
          </g>
          <path d="M26 86 H74 L77 92 H23 Z" fill={m} {...s} />
        </g>
      );
    case 'duffel':
      return (
        <g>
          <path d="M32 40 Q32 18 50 18 Q68 18 68 40" fill="none" stroke={t} strokeWidth="7" strokeLinecap="round" />
          <path d="M32 40 Q32 18 50 18 Q68 18 68 40" fill="none" stroke={m} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M12 50 Q12 38 26 38 H74 Q88 38 88 50 V74 Q88 84 76 84 H24 Q12 84 12 74 Z" fill={m} {...s} />
          <ellipse cx="13.5" cy="61" rx="4" ry="12" fill={m} {...s} />
          <ellipse cx="86.5" cy="61" rx="4" ry="12" fill={m} {...s} />
          <path d="M22 44 H78" stroke={k} strokeWidth="2" strokeDasharray="2 1.6" opacity="0.6" />
          <rect x="70" y="41" width="6" height="7" rx="1" fill={k} opacity="0.6" />
          <path d="M26 38 L30 30 H40 L44 38" fill="#2f7d32" stroke={t} strokeWidth="1" />
          <path d="M44 38 L47 28 H57 L58 38" fill="#3c9a40" stroke={t} strokeWidth="1" />
          <text x="50" y="72" fontSize="16" fontWeight="900" textAnchor="middle" fill={k} opacity="0.55" fontFamily="Cinzel, serif">
            $
          </text>
          <path d="M20 84 H80 L84 92 H16 Z" fill={m} {...s} />
        </g>
      );
  }
}

/**
 * A trophy in bronze, silver, gold or onyx on a stepped black-marble plinth with an engraved brass
 * plaque. Lit from the top left, shaded bottom right; gold and onyx catch a passing glint.
 */
export function Trophy({ design, tier, size = 96, title }: { design: TrophyDesign; tier: Tier; size?: number; title?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const metal = METALS[tier];
  const m = `url(#m${id})`;
  return (
    <span className={`tr tr-t${tier}`} style={{ width: size, height: size * 1.2 }}>
      <svg viewBox="0 0 100 120" width={size} height={size * 1.2} role="img" aria-label={title ?? `${design} trophy`}>
        <defs>
          <linearGradient id={`m${id}`} x1="0" y1="0" x2="1" y2="1">
            {metal.stops.map((c, i) => (
              <stop key={i} offset={`${(i / (metal.stops.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>
          <radialGradient id={`hl${id}`} cx="0.3" cy="0.2" r="0.7">
            <stop offset="0" stopColor="#fff" stopOpacity={tier === 4 ? 0.25 : 0.55} />
            <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`sd${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id={`b${id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#34343a" />
            <stop offset="45%" stopColor="#16161a" />
            <stop offset="55%" stopColor="#24242a" />
            <stop offset="100%" stopColor="#08080a" />
          </linearGradient>
          <linearGradient id={`pl${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f4dc94" />
            <stop offset="0.5" stopColor="#b8913a" />
            <stop offset="1" stopColor="#7a5a1c" />
          </linearGradient>
          <linearGradient id={`g${id}`} x1="0" x2="1">
            <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.8" />
            <stop offset="0.65" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id={`fm${id}`}>
            <Figure design={design} m="#fff" t="#fff" k="#fff" />
          </mask>
        </defs>
        {/* soft shadow on the plinth */}
        <ellipse cx="50" cy="92.5" rx="30" ry="3" fill="#000" opacity="0.55" />
        <g className="tr-fig">
          <Figure design={design} m={m} t={metal.trim} k={metal.ink} />
          {/* light from the top left, shade bottom right, only on the metal */}
          <rect x="0" y="0" width="100" height="94" fill={`url(#hl${id})`} mask={`url(#fm${id})`} />
          <rect x="0" y="0" width="100" height="94" fill={`url(#sd${id})`} mask={`url(#fm${id})`} />
          {tier >= 3 && (
            <g mask={`url(#fm${id})`}>
              <rect className="tr-glint" x="-50" y="0" width="45" height="94" fill={`url(#g${id})`} />
            </g>
          )}
        </g>
        {/* stepped marble plinth with an engraved plaque */}
        <path d="M24 93 H76 L78 99 H22 Z" fill={`url(#b${id})`} stroke="#000" strokeWidth="0.8" />
        <path d="M18 99 H82 L85 117 H15 Z" fill={`url(#b${id})`} stroke="#000" strokeWidth="0.8" />
        <path d="M18 99 H82 L82.5 101 H17.5 Z" fill="#45454c" />
        <path d="M30 104 L34 109 M62 112 L70 106" stroke="#fff" strokeOpacity="0.07" strokeWidth="0.6" />
        <rect x="27" y="102.5" width="46" height="11" rx="1.2" fill={`url(#pl${id})`} stroke="#4a3510" strokeWidth="0.7" />
        <circle cx="29.5" cy="108" r="0.9" fill="#4a3510" />
        <circle cx="70.5" cy="108" r="0.9" fill="#4a3510" />
        <text x="50" y="110" textAnchor="middle" fontSize="5.6" fontWeight="800" fill="#3a2508" fontFamily="Cinzel, serif" letterSpacing="1.2">
          {['', 'BRONZE', 'SILVER', 'GOLD', 'ONYX'][tier]} · {ROMAN[tier]}
        </text>
        {tier === 4 &&
          [
            [16, 16],
            [86, 30],
            [80, 6],
          ].map(([x, y], i) => (
            <path key={`${x}${y}`} className="tr-star" style={{ animationDelay: `${i * 0.7}s` }} d={`M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1} Z`} fill="#f8e7a8" />
          ))}
      </svg>
    </span>
  );
}

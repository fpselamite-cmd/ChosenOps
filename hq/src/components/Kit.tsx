import { Backpack, Box, Car, Lock, Shield, Shirt, Swords, TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { gunClassOf, useCatalog } from '../lib/catalog';
import { itemTitle, kindOf, type ItemType } from '../lib/items';
import { KIND_COLOR, KIND_ICON } from '../lib/kindStyle';
import { HOTBAR, useEquippedKit, type GearKit, type KitData, type KitSlot, type KitVehicle } from '../lib/kits';
import { vehicleSrc } from '../lib/vehicles';

type ById = Map<string, ItemType>;

// ---------- mannequin ----------

/** A tailor's mannequin in neon, wearing what the kit has on it. */
export function Mannequin({ kit, byId, className = '' }: { kit: Pick<GearKit, 'vest' | 'plates' | 'bagType' | 'hotbar' | 'outfit'>; byId: ById; className?: string }) {
  const id = useId();
  const guns = kit.hotbar.filter((s): s is KitSlot => !!s && kindOf(byId.get(s.item), byId) === 'gun');
  const long = guns.find((g) => gunClassOf(byId.get(g.item), byId) !== 'pistol');
  const pistol = guns.find((g) => gunClassOf(byId.get(g.item), byId) === 'pistol');
  const melee = kit.hotbar.find((s) => s && kindOf(byId.get(s.item), byId) === 'melee');
  const plates = Math.min(kit.plates ?? 0, 4);
  return (
    <svg viewBox="0 0 200 420" className={`kit-mannequin ${className}`} role="img" aria-label="Kit on a mannequin">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a2540" />
          <stop offset="0.55" stopColor="#14121f" />
          <stop offset="1" stopColor="#0a0910" />
        </linearGradient>
        <linearGradient id={`${id}v`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b3220" />
          <stop offset="1" stopColor="#1a160d" />
        </linearGradient>
      </defs>

      {/* On the back, behind the body */}
      {long && <path d="M26 70 L160 252 L169 245 L35 63 Z M56 104 l12 -9 l9 12 l-12 9 Z M150 230 l14 -4 l6 10 l-12 6 Z" className="kit-gear" />}
      {melee && !long && <path d="M150 84 L62 236 L70 240 L158 88 Z" className="kit-gear" />}

      <g className="kit-body" fill={`url(#${id}b)`}>
        <ellipse cx="100" cy="46" rx="21" ry="26" />
        <path d="M91 68 h18 l2 20 h-22 Z" />
        {/* torso */}
        <path d="M58 92 Q100 80 142 92 Q152 96 150 112 L140 160 Q132 196 134 222 L66 222 Q68 196 60 160 L50 112 Q48 96 58 92 Z" />
        {/* arms */}
        <path d="M54 98 Q42 104 40 128 L30 214 Q28 234 36 246 Q44 248 46 236 L50 214 L62 136 Z" />
        <path d="M146 98 Q158 104 160 128 L170 214 Q172 234 164 246 Q156 248 154 236 L150 214 L138 136 Z" />
        {/* legs */}
        <path d="M66 220 L134 220 Q138 240 132 262 L124 392 Q122 404 110 404 Q104 400 104 390 L102 268 L98 268 L96 390 Q96 400 90 404 Q78 404 76 392 L68 262 Q62 240 66 220 Z" />
      </g>
      {/* mannequin seams */}
      <g fill="none" stroke="#ffe9a8" strokeOpacity="0.18" strokeWidth="1">
        <path d="M60 92 Q100 104 140 92" />
        <path d="M66 222 Q100 230 134 222" />
        <path d="M76 318 h20 M104 318 h20" />
        <path d="M40 170 h14 M146 170 h14" />
      </g>

      {/* Look: a glint on the face when there's an outfit note */}
      {kit.outfit && <path d="M82 40 Q100 30 118 40 Q118 54 100 58 Q82 54 82 40 Z" className="kit-mask" />}

      {/* Vest and its plates */}
      {kit.vest && (
        <g>
          <path d="M62 96 Q100 88 138 96 L134 168 Q100 178 66 168 Z" fill={`url(#${id}v)`} stroke="#d4af37" strokeWidth="1.5" />
          <path d="M80 96 L84 112 M120 96 L116 112" stroke="#d4af37" strokeOpacity="0.6" />
          {Array.from({ length: plates }, (_, i) => (
            <rect key={i} x={i % 2 ? 103 : 75} y={i < 2 ? 116 : 142} width="22" height="22" rx="3" fill="#d4af37" fillOpacity="0.28" stroke="#f6dd8a" strokeWidth="1" />
          ))}
        </g>
      )}

      {/* Bag: a strap across the chest and the bag on the hip */}
      {kit.bagType && (
        <g>
          <path d="M136 94 L72 214" stroke="#c08a3e" strokeWidth="5" strokeLinecap="round" />
          <rect x="44" y="196" width="46" height="34" rx="8" fill="#2b2010" stroke="#c08a3e" strokeWidth="1.5" />
          <path d="M50 206 h34" stroke="#c08a3e" strokeOpacity="0.7" />
        </g>
      )}

      {/* Holster on the right thigh */}
      {pistol && <path d="M132 236 h14 l-2 34 h-12 Z" className="kit-gear" />}
    </svg>
  );
}

// ---------- vehicle ----------

const CAR_SHAPES: Record<string, string> = {
  sedan: 'M8 62 Q12 44 40 42 L66 24 Q100 16 132 24 L156 42 Q184 44 192 60 L192 72 L8 72 Z',
  sports: 'M6 64 Q14 50 44 46 L74 30 Q110 22 140 32 L166 46 Q188 50 194 62 L194 72 L6 72 Z',
  super: 'M4 66 Q20 52 54 48 L86 34 Q120 30 148 40 L178 52 Q194 56 196 66 L196 72 L4 72 Z',
  muscle: 'M6 60 Q10 46 36 44 L62 28 Q100 22 130 28 L150 44 Q186 46 194 58 L194 72 L6 72 Z',
  suv: 'M8 60 Q10 40 30 38 L50 16 Q100 10 150 16 L166 38 Q190 40 192 56 L192 72 L8 72 Z',
  offroad: 'M10 58 Q12 40 32 38 L48 18 Q100 12 148 18 L164 38 Q188 40 190 56 L190 70 L10 70 Z',
  van: 'M8 64 L8 30 Q10 14 34 12 L150 12 Q170 14 182 36 L192 46 L192 72 L8 72 Z',
  bike: 'M40 56 L80 36 L118 36 L150 54 L120 52 L96 44 L70 56 Z',
};

/** The kit's car: its picture from the repo, or a gold outline for its class. */
export function VehicleArt({ v, className = '' }: { v: KitVehicle; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (!broken)
    return <img src={vehicleSrc(v.name)} alt={v.name} className={`kit-car object-contain ${className}`} onError={() => setBroken(true)} />;
  const bike = v.cls === 'bike';
  return (
    <svg viewBox="0 0 200 92" className={`kit-car ${className}`} role="img" aria-label={v.name}>
      <path d={CAR_SHAPES[v.cls] ?? CAR_SHAPES.sedan} fill="#16131f" stroke="#d4af37" strokeWidth="2" strokeLinejoin="round" />
      {!bike && <path d="M70 30 Q100 24 128 30 L142 42 L60 42 Z" fill="#a487f0" fillOpacity="0.25" />}
      {[bike ? 44 : 50, bike ? 150 : 150].map((x) => (
        <g key={x}>
          <circle cx={x} cy="72" r={bike ? 16 : 14} fill="#0a0910" stroke="#d4af37" strokeWidth="2" />
          <circle cx={x} cy="72" r="5" fill="#d4af37" fillOpacity="0.6" />
        </g>
      ))}
    </svg>
  );
}

// ---------- inventory slots (FiveM style) ----------

export const SLOT_DRAG = 'application/x-chosenops-kitslot';

/** One square in the inventory: number top-left, count top-right, name along the bottom. */
export function InvSlot({
  slot,
  num,
  byId,
  missing,
  hot,
  pic,
  onClick,
  onDragStart,
  onDrop,
  small,
}: {
  slot: KitSlot | null;
  num?: number;
  byId: ById;
  missing?: boolean;
  hot?: boolean;
  pic?: string | null;
  onClick?: () => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onDrop?: (e: DragEvent<HTMLElement>) => void;
  small?: boolean;
}) {
  const t = slot ? byId.get(slot.item) : undefined;
  const kind = t ? kindOf(t, byId) : 'other';
  const Icon = KIND_ICON[kind as keyof typeof KIND_ICON] ?? Box;
  const color = KIND_COLOR[kind] ?? KIND_COLOR.other!;
  const parts = Object.values(slot?.parts ?? {}).filter(Boolean).length;
  const [over, setOver] = useState(false);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      draggable={!!slot && !!onDragStart}
      onDragStart={onDragStart}
      onDragOver={onDrop ? (e: DragEvent<HTMLElement>) => (e.preventDefault(), setOver(true)) : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop ? (e: DragEvent<HTMLElement>) => (setOver(false), onDrop(e)) : undefined}
      title={slot ? `${itemTitle(t, byId)}${slot.qty > 1 ? ` × ${slot.qty}` : ''}${missing ? ' (missing)' : ''}` : num ? `Slot ${num}` : 'Empty'}
      className={`ox-slot group ${hot ? 'ox-hot' : ''} ${slot ? 'ox-full' : ''} ${missing ? 'ox-missing' : ''} ${over ? 'ox-over' : ''} ${small ? 'ox-small' : ''}`}
      style={slot ? ({ '--k': color } as React.CSSProperties) : undefined}
    >
      {num != null && <span className="ox-num">{num}</span>}
      {slot && slot.qty > 1 && <span className="ox-qty">×{slot.qty}</span>}
      {slot && (pic ? <img src={pic} alt="" className="ox-pic" /> : <Icon className="ox-icon" style={{ color }} />)}
      {slot && !small && <span className="ox-name">{t ? t.name : 'Unknown'}</span>}
      {parts > 0 && (
        <span className="ox-parts" aria-label={`${parts} attachments`}>
          {Array.from({ length: Math.min(parts, 6) }, (_, i) => (
            <i key={i} />
          ))}
        </span>
      )}
      {missing && <TriangleAlert className="ox-warn" />}
    </Tag>
  );
}

// ---------- the stage ----------

export const EQUIP_ICON = { vest: Shield, bag: Backpack, look: Shirt, car: Car } as const;

/** Starry stage with the mannequin on a turning ring and the car parked by its feet. */
export function KitStage({ kit, byId, children, compact }: { kit: KitData; byId: ById; children?: ReactNode; compact?: boolean }) {
  return (
    <div className={`kit-stage ${compact ? 'kit-compact' : ''}`}>
      <div className="kit-stars" />
      <div className="kit-stars kit-stars-2" />
      <div className="kit-floor" />
      <svg className="kit-ring" viewBox="0 0 300 60" aria-hidden>
        <ellipse cx="150" cy="30" rx="146" ry="26" className="kit-ring-glow" />
        <ellipse cx="150" cy="30" rx="146" ry="26" className="kit-ring-dash" />
      </svg>
      <Mannequin kit={kit} byId={byId} className="kit-fig" />
      {kit.vehicle?.name && (
        <div className="kit-vehicle">
          <VehicleArt v={kit.vehicle} className="w-full" />
          {!compact && <span className="kit-vname">{kit.vehicle.name}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/** The five hotbar squares, the way they show at the bottom of the screen in the city. */
export function HotbarStrip({ kit, byId, missing, small }: { kit: Pick<GearKit, 'hotbar'>; byId: ById; missing?: (s: KitSlot) => boolean; small?: boolean }) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {Array.from({ length: HOTBAR }, (_, i) => {
        const s = kit.hotbar[i] ?? null;
        return <InvSlot key={i} slot={s} num={i + 1} byId={byId} hot small={small} missing={!!s && !!missing?.(s)} />;
      })}
    </div>
  );
}

// ---------- equipped kit, elsewhere in the app ----------

/** A member's equipped kit on their sheet: the mannequin, the hotbar and the rest. */
export function KitCard({ memberId }: { memberId: string }) {
  const { me } = useHub();
  const cat = useCatalog();
  const kit = useEquippedKit(memberId);
  const mine = memberId === me.id;
  const name = (id?: string | null) => (id ? itemTitle(cat.byId.get(id), cat.byId) : null);
  return (
    <div className="hud p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 font-hud font-bold text-gold-200">
          <Swords className="size-5 text-gold-500" /> {kit ? kit.name : 'Kit'}
        </p>
        {mine && (
          <Link to={`/gear?tab=kits${kit ? `&kit=${kit.id}` : ''}`} className="text-xs text-gold-300 hover:underline">
            {kit ? 'Edit' : 'Set up a kit'} →
          </Link>
        )}
      </div>
      {kit === undefined ? null : !kit ? (
        <p className="flex items-center gap-1.5 text-sm text-smoke">{mine ? 'No kit equipped yet.' : <><Lock className="size-3.5" /> Private, or nothing equipped.</>}</p>
      ) : (
        <div className="space-y-3">
          {!kit.public && !mine && <p className="text-xs text-gold-300">Private · you're seeing it as leadership.</p>}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-3">
            <KitStage kit={kit} byId={cat.byId} compact />
            <dl className="space-y-1.5 self-center text-sm">
              {(
                [
                  ['Vest', kit.vest ? `${name(kit.vest)}${kit.plates ? ` · ${kit.plates} plates` : ''}` : null],
                  ['Bag', name(kit.bagType)],
                  ['Look', kit.outfit || null],
                  ['Car', kit.vehicle?.name ?? null],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="label text-[10px]">{k}</dt>
                  <dd className={v ? 'text-gold-100' : 'text-smoke'}>{v ?? '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
          <HotbarStrip kit={kit} byId={cat.byId} />
          {kit.bag.some(Boolean) && (
            <div className="flex flex-wrap gap-1">
              {kit.bag.filter((s): s is KitSlot => !!s).map((s, i) => (
                <span key={i} className="chip bg-raised px-2 py-0.5 text-[11px] text-ash">
                  {name(s.item)}
                  {s.qty > 1 ? ` ×${s.qty}` : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The Dashboard hero's strip: the equipped kit's 5 hotbar slots. */
export function KitStrip({ memberId }: { memberId: string }) {
  const cat = useCatalog();
  const kit = useEquippedKit(memberId);
  if (kit === undefined) return null;
  if (!kit)
    return (
      <Link to="/gear?tab=kits" className="text-xs text-gold-300 hover:underline">
        Set up a kit →
      </Link>
    );
  return (
    <Link to={`/gear?tab=kits&kit=${kit.id}`} className="block">
      <span className="label mb-1 block text-[10px]">Equipped · {kit.name}</span>
      <HotbarStrip kit={kit} byId={cat.byId} small />
    </Link>
  );
}

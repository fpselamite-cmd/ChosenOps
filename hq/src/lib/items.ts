/**
 * The item catalog: guns, attachments, ammo, gear and anything else the family keeps
 * in a stash or a locker. Leadership can paste a whole list in Admin → Item catalog.
 */
export const ITEM_KINDS = [
  { id: 'gun', label: 'Guns', one: 'Gun' },
  { id: 'attachment', label: 'Attachments', one: 'Attachment' },
  { id: 'ammo', label: 'Ammo', one: 'Ammo' },
  { id: 'melee', label: 'Melee', one: 'Melee' },
  { id: 'armor', label: 'Armor', one: 'Armor' },
  { id: 'safety', label: 'Safety equipment', one: 'Safety' },
  { id: 'gear', label: 'Other gear', one: 'Gear' },
  { id: 'tool', label: 'Tools', one: 'Tool' },
  { id: 'consumable', label: 'Consumables', one: 'Consumable' },
  { id: 'other', label: 'Other items', one: 'Other' },
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number]['id'];

export const GUN_CLASSES = [
  { id: 'pistol', label: 'Pistols' },
  { id: 'smg', label: 'SMGs' },
  { id: 'rifle', label: 'Rifles' },
  { id: 'shotgun', label: 'Shotguns' },
  { id: 'sniper', label: 'Sniper rifles' },
] as const;

/** Attachment slots, in loadout-editor order. */
export const SLOTS = [
  { id: 'sight', label: 'Sight' },
  { id: 'magazine', label: 'Magazine' },
  { id: 'barrel', label: 'Barrel' },
  { id: 'muzzle', label: 'Muzzle' },
  { id: 'light', label: 'Light / laser' },
  { id: 'grip', label: 'Grip' },
  { id: 'handguard', label: 'Handguard' },
  { id: 'rail', label: 'Rail' },
  { id: 'stock', label: 'Stock' },
  { id: 'slide', label: 'Slide' },
  { id: 'frame', label: 'Frame' },
  { id: 'cylinder', label: 'Cylinder' },
] as const;
export const slotLabel = (id?: string) => SLOTS.find((s) => s.id === id)?.label ?? id ?? '';

export interface ItemType {
  id: string;
  name: string;
  category: ItemKind;
  /** Guns: pistol, smg, rifle, shotgun, sniper. */
  gunClass?: string;
  /** Guns: a stock GTA gun with no attachments of its own. */
  base?: boolean;
  /** Attachments: the weapon (item id) it fits, and its slot. */
  weapon?: string;
  slot?: string;
  /** Ammo: the caliber, and whether this is the box or the loose rounds. */
  caliber?: string;
  form?: 'box' | 'round';
  /** A member's own named version of another item (e.g. an event Bat): base item and who named it. */
  baseId?: string;
  owner?: string;
  notes?: string;
}

/** "Pumpkin Bat" → "Pumpkin Bat (Bat)" for custom names; attachments get their weapon. */
export function itemTitle(t: ItemType | undefined, byId: Map<string, ItemType>) {
  if (!t) return 'Unknown item';
  if (t.baseId) return `${t.name} (${byId.get(t.baseId)?.name ?? 'custom'})`;
  return t.name;
}
export const itemSub = (t: ItemType, byId: Map<string, ItemType>) =>
  t.category === 'attachment'
    ? `${byId.get(t.weapon ?? '')?.name ?? 'Attachment'} · ${slotLabel(t.slot)}`
    : t.category === 'gun'
      ? (GUN_CLASSES.find((c) => c.id === t.gunClass)?.label.replace(/s$/, '') ?? 'Gun') + (t.base ? '' : ' · custom')
      : t.baseId
        ? 'Custom name'
        : '';
/** The kind an item is shown under: a custom name sits with its base item. */
export const kindOf = (t: ItemType | undefined, byId: Map<string, ItemType>): ItemKind =>
  (t?.baseId ? byId.get(t.baseId)?.category : t?.category) ?? 'other';

/** Turns a typed word into a kind: "rifle" → gun, "scope" → attachment, "rounds" → ammo. */
export function guessKind(word: string): ItemKind {
  const w = word.toLowerCase();
  if (ITEM_KINDS.some((k) => k.id === w)) return w as ItemKind;
  if (/(extinguisher|flare|repair)/.test(w)) return 'safety';
  if (/(melee|knife|axe|hatchet|dagger|machete|knuckle|nightstick|switchblade|\bbat\b)/.test(w)) return 'melee';
  if (/(gun|pistol|rifle|smg|pdw|shotgun|sniper|carbine|revolver|lmg|mg\b|weapon|musket)/.test(w)) return 'gun';
  if (/(attach|optic|scope|sight|suppress|silencer|mag|grip|stock|barrel|flash|laser|muzzle|comp)/.test(w)) return 'attachment';
  if (/(ammo|round|shell|bullet|cartridge|\d+mm)/.test(w)) return 'ammo';
  if (/(armou?r|vest|plate|helmet)/.test(w)) return 'armor';
  if (/(mask|gear|bag|parachute|radio)/.test(w)) return 'gear';
  if (/(tool|lockpick|drill|thermite|cutter|hack|kit|crowbar)/.test(w)) return 'tool';
  if (/(food|drink|bandage|med|heal|pill|consum|water|joint)/.test(w)) return 'consumable';
  return 'other';
}

/**
 * Reads a pasted list: one item per line. Columns can be split by tabs, commas, | or " - ".
 * The first column is the name; a column that names a kind sets it (otherwise it's guessed from the name).
 * Lines like "Guns:" start a section that sets the kind for the lines under it.
 */
export function parseItemList(text: string): Omit<ItemType, 'id'>[] {
  const out: Omit<ItemType, 'id'>[] = [];
  let section: ItemKind | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s*•\-–\d.)]+/, '').trim();
    if (!line) continue;
    const head = line.match(/^([A-Za-z &/]+):\s*$/);
    if (head) {
      section = guessKind(head[1]!);
      continue;
    }
    const cols = line.split(/\t|\s*\|\s*|\s*,\s*|\s+-\s+/).map((c) => c.trim()).filter(Boolean);
    const name = cols[0]!.slice(0, 40);
    const kindCol = cols.slice(1).find((c) => ITEM_KINDS.some((k) => k.id === c.toLowerCase() || k.label.toLowerCase() === c.toLowerCase() || k.one.toLowerCase() === c.toLowerCase()));
    const category = kindCol ? guessKind(ITEM_KINDS.find((k) => [k.id, k.label.toLowerCase(), k.one.toLowerCase()].includes(kindCol.toLowerCase()))!.id) : (section ?? guessKind(name));
    const rest = cols.slice(1).filter((c) => c !== kindCol);
    out.push({ name, category, ...(rest.length ? { notes: rest.join(' · ').slice(0, 120) } : {}) });
  }
  return out;
}

/**
 * The item catalog: guns, attachments, ammo, gear and anything else the family keeps
 * in a stash or a locker. Leadership can paste a whole list in Admin → Item catalog.
 */
export const ITEM_KINDS = [
  { id: 'gun', label: 'Guns', one: 'Gun' },
  { id: 'attachment', label: 'Attachments', one: 'Attachment' },
  { id: 'ammo', label: 'Ammo', one: 'Ammo' },
  { id: 'gear', label: 'Armor & gear', one: 'Armor / gear' },
  { id: 'tool', label: 'Tools', one: 'Tool' },
  { id: 'consumable', label: 'Consumables', one: 'Consumable' },
  { id: 'other', label: 'Other items', one: 'Other' },
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number]['id'];

export interface ItemType {
  id: string;
  name: string;
  category: ItemKind;
  /** Guns: pistol, SMG, rifle, shotgun, sniper… */
  gunClass?: string;
  /** Guns: which ammo it takes. */
  ammo?: string;
  /** Attachments: optic, barrel, magazine, grip, stock… */
  slot?: string;
  notes?: string;
}

/** Turns a typed word into a kind: "rifle" → gun, "scope" → attachment, "rounds" → ammo. */
export function guessKind(word: string): ItemKind {
  const w = word.toLowerCase();
  if (ITEM_KINDS.some((k) => k.id === w)) return w as ItemKind;
  if (/(gun|pistol|rifle|smg|shotgun|sniper|carbine|revolver|lmg|mg\b|weapon|knife|bat|melee)/.test(w)) return 'gun';
  if (/(attach|optic|scope|sight|suppress|silencer|mag|grip|stock|barrel|flash|laser|muzzle|comp)/.test(w)) return 'attachment';
  if (/(ammo|round|shell|bullet|cartridge|\d+mm)/.test(w)) return 'ammo';
  if (/(armou?r|vest|plate|helmet|mask|gear|bag|parachute|radio)/.test(w)) return 'gear';
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

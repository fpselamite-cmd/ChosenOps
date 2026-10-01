import type { Timestamp } from 'firebase/firestore';

export const PERMISSIONS = {
  approveMembers: 'Approve new members',
  manageMembers: 'Manage members (rank, status, chain of command)',
  manageRanks: 'Edit ranks & permissions',
  manageSettings: 'Edit family settings',
  writeLore: 'Write lore, chronicle & ties',
  editAllLore: "Curate lore (edit/remove anyone's, mark canon)",
  postAnnouncements: 'Post announcements',
  resetPins: 'Reset member PINs',
} as const;

export type Permission = keyof typeof PERMISSIONS;
/**
 * Permissions a rank has unless explicitly switched off. Lets ranks created before
 * a permission existed pick it up. Mirrored in firestore.rules (can()).
 */
export const DEFAULT_ON_PERMISSIONS: Permission[] = ['writeLore'];
export type PermissionMap = Partial<Record<Permission, boolean>>;

export interface Rank {
  id: string;
  name: string;
  /** 0 is the top of the family; higher numbers sit lower in the chain of command. */
  order: number;
  color?: string;
  permissions: PermissionMap;
}

export type MemberStatus = 'pending' | 'active' | 'suspended';

export const CHARACTER_STATUSES = ['Active', 'Laying Low', 'Jailed', 'Hospitalized', 'MIA', 'Deceased'] as const;
export type CharacterStatus = (typeof CHARACTER_STATUSES)[number];

export interface Character {
  characterName?: string;
  alias?: string;
  phone?: string;
  specialty?: string;
  characterStatus?: CharacterStatus;
  dob?: string;
  nationality?: string;
  vehicle?: string;
  discord?: string;
  timezone?: string;
  bio?: string;
  /** A line the character is known for. */
  quote?: string;
}

export interface Member {
  id: string;
  username: string;
  usernameLower: string;
  status: MemberStatus;
  rankId: string | null;
  reportsTo?: string | null;
  joinedAt?: Timestamp;
  character?: Character;
  avatar?: string | null;
  /** Sign-in account currently bound to this member; absent means the original one. */
  authUid?: string;
}

export interface LoreEntry {
  id: string;
  title: string;
  category: string;
  summary?: string;
  /** Markdown. Supports [[Article Title]] links and @username mentions. */
  body: string;
  /** Small card image (data URL). The full cover lives in loreCovers/{id}. */
  thumb?: string | null;
  /** Member ids of characters featured in this entry. */
  characters: string[];
  /** Marked as official family canon by a curator. */
  canon: boolean;
  authorId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  updatedBy?: string;
}

export interface ChronicleEvent {
  id: string;
  title: string;
  /** Sortable in-world date, YYYY-MM-DD. */
  when: string;
  /** How the date reads in-world, e.g. "Winter, the Year of the Wolf". */
  whenLabel?: string;
  description?: string;
  loreId?: string | null;
  characters: string[];
  authorId: string;
  createdAt?: Timestamp;
}

export interface JournalEntry {
  id: string;
  authorId: string;
  title: string;
  body: string;
  whenLabel?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

/** Directed types read "a is <forward> of b"; symmetric ones read the same both ways. */
export const RELATIONSHIP_TYPES = {
  parent: { forward: 'Parent of', backward: 'Child of', group: 'Blood' },
  sibling: { forward: 'Sibling', backward: 'Sibling', group: 'Blood' },
  spouse: { forward: 'Spouse', backward: 'Spouse', group: 'Blood' },
  sworn: { forward: 'Sworn kin', backward: 'Sworn kin', group: 'Bond' },
  mentor: { forward: 'Mentor of', backward: 'Protégé of', group: 'Bond' },
  ally: { forward: 'Ally', backward: 'Ally', group: 'Bond' },
  rival: { forward: 'Rival', backward: 'Rival', group: 'Feud' },
  enemy: { forward: 'Sworn enemy', backward: 'Sworn enemy', group: 'Feud' },
} as const;
export type RelationshipType = keyof typeof RELATIONSHIP_TYPES;

export interface Relationship {
  id: string;
  a: string;
  b: string;
  type: RelationshipType;
  note?: string;
  createdBy: string;
  createdAt?: Timestamp;
}

export interface Branding {
  name: string;
  motto: string;
  logo?: string | null;
}

export interface FamilySettings {
  announcement?: string;
  announcementBy?: string;
  announcementAt?: Timestamp;
  loreCategories: string[];
}

export const DEFAULT_LORE_CATEGORIES = ['Family History', 'Legends', 'Places', 'Factions', 'Events', 'Artifacts', 'Customs'];

export const DEFAULT_RANKS: Omit<Rank, 'order'>[] = [
  { id: 'head', name: 'Head of the Family', permissions: allPermissions() },
  { id: 'underboss', name: 'Underboss', permissions: allPermissions() },
  {
    id: 'consigliere',
    name: 'Consigliere',
    permissions: { approveMembers: true, manageMembers: true, resetPins: true, writeLore: true, editAllLore: true, postAnnouncements: true },
  },
  { id: 'lieutenant', name: 'Lieutenant', permissions: { approveMembers: true, writeLore: true, editAllLore: true, postAnnouncements: true } },
  { id: 'enforcer', name: 'Enforcer', permissions: { writeLore: true } },
  { id: 'associate', name: 'Associate', permissions: { writeLore: true } },
  { id: 'prospect', name: 'Prospect', permissions: { writeLore: true } },
];

function allPermissions(): PermissionMap {
  return Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true]));
}

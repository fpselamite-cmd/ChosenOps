import type { Timestamp } from 'firebase/firestore';

/**
 * Gang-wide permissions, granted by rank. The top rank (order 0) always has all of them.
 * Mirrored in firestore.rules (can()).
 */
export const PERMISSIONS = {
  approveMembers: 'Approve new members',
  manageMembers: 'Manage members (rank, status, chain of command)',
  resetPins: 'Reset member PINs',
  manageCrews: 'Create crews and pick crew leaders',
  manageRanks: 'Edit ranks & permissions',
  manageSettings: 'Edit gang settings',
  postAnnouncements: 'Post the Word from the Top',
  confirmRep: 'Confirm petty rep sent to the family',
  manageOps: 'Add and edit stash houses and grows',
  money: 'See and manage all money (Treasurer)',
  awardTrophies: 'Award trophies to anyone',
} as const;
export type Permission = keyof typeof PERMISSIONS;
export type PermissionMap = Partial<Record<Permission, boolean>>;

/** Pages that can be shown or hidden per rank and per crew role. The Dashboard is always open. */
export const PAGES = {
  narcotics: 'Narcotics',
  stash: 'Stash',
  blackmarket: 'BlackMarket',
  blacksites: 'Blacksites',
  gear: 'Gear & Loadouts',
  pettycrime: 'Petty Crime',
  crews: 'Crews',
  family: 'Family',
  map: 'Map',
  calendar: 'Calendar',
} as const;
export type PageId = keyof typeof PAGES;
export type PageMap = Partial<Record<PageId, boolean>>;

/** What everyone below Lieutenant sees unless a crew role unlocks more. */
export const BASIC_PAGES: PageId[] = ['blacksites', 'gear', 'pettycrime', 'crews', 'family'];
const pages = (ids: PageId[]): PageMap => Object.fromEntries(ids.map((p) => [p, true]));
const ALL_PAGES = pages(Object.keys(PAGES) as PageId[]);

export interface Rank {
  id: string;
  name: string;
  /** 0 is the top of the family; higher numbers sit lower in the chain of command. */
  order: number;
  /** "Leadership" ranks sit in the top tier of the Family tree. */
  leadership?: boolean;
  permissions: PermissionMap;
  /** Pages this rank can open. The top rank sees everything. */
  pages?: PageMap;
}

export type MemberStatus = 'pending' | 'active' | 'suspended';

export interface Member {
  id: string;
  name: string;
  nameLower: string;
  status: MemberStatus;
  rankId: string | null;
  /** Member id of whoever this person answers to in the chain of command. */
  reportsTo?: string | null;
  avatar?: string | null;
  /** In-city details. */
  alias?: string;
  phone?: string;
  bio?: string;
  joinedAt?: Timestamp;
  /** Crews they're in (kept in sync from the crews, used to share pins and events by crew). */
  crewIds?: string[];
  /** Character's birthday, "MM-DD". */
  birthday?: string | null;
  /** Sign-in account currently bound to this member; absent means the original one. */
  authUid?: string;
}

export interface Crew {
  id: string;
  name: string;
  /** Hex color used for the crew's chips, cards and ops. */
  color: string;
  /** Short tag shown on chips, e.g. "GRW". */
  tag: string;
  motto?: string;
  emblem?: string | null;
  leaderId: string | null;
  /** Everyone in the crew, leader included. People can be in several crews. */
  memberIds: string[];
  /** Crews work as roles: pages being in this crew unlocks, on top of rank. */
  pages?: PageMap;
  createdAt?: Timestamp;
}

/** A member's own petty crime rep, as it stands in the city. */
export interface PettyRep {
  id: string;
  rep: number;
}

export interface PettyCrime {
  id: string;
  memberId: string;
  crime: string;
  rep: number;
  cash: number;
  notes?: string;
  at?: Timestamp;
}

export type TransferStatus = 'pending' | 'confirmed' | 'rejected';

/** Petty rep a member sends to the family. Lieutenant+ confirms it happened in the city. */
export interface RepTransfer {
  id: string;
  memberId: string;
  amount: number;
  status: TransferStatus;
  at?: Timestamp;
  decidedBy?: string;
  decidedAt?: Timestamp;
}

export interface FamilyRep {
  total: number;
}

export const PETTY_CRIMES = ['Store robbery', 'ATM', 'Car theft', 'Chop shop', 'Mugging', 'House robbery', 'Corner selling', 'Other'];

export interface Presence {
  id: string;
  at?: Timestamp;
  status?: string;
}

export interface GangSettings {
  name: string;
  motto: string;
}

export interface Announcement {
  text: string;
  by?: string;
  at?: Timestamp;
}

export const PRESENCE_STATUSES = ['At the lab', 'Growing', 'Selling', 'On a run', 'At a blacksite', 'Busy', 'AFK'];

export const CREW_COLORS = ['#d4af37', '#c0392b', '#2e86de', '#27ae60', '#8e44ad', '#e67e22', '#16a085', '#e84393', '#95a5a6'];

const all = (): PermissionMap => Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true]));

/** Seeded when the gang is founded. Editable in Admin → Ranks. */
export const DEFAULT_RANKS: Omit<Rank, 'order'>[] = [
  { id: 'boss', name: 'Boss', leadership: true, permissions: all(), pages: ALL_PAGES },
  { id: 'consigliere', name: 'Consigliere', leadership: true, permissions: all(), pages: ALL_PAGES },
  { id: 'underboss', name: 'Underboss', leadership: true, permissions: all(), pages: ALL_PAGES },
  {
    id: 'treasurer',
    name: 'Treasurer',
    leadership: true,
    permissions: { approveMembers: true, postAnnouncements: true, confirmRep: true, money: true, awardTrophies: true },
    pages: ALL_PAGES,
  },
  {
    id: 'caporegime',
    name: 'Caporegime',
    permissions: { approveMembers: true, resetPins: true, postAnnouncements: true, confirmRep: true, manageOps: true },
    pages: ALL_PAGES,
  },
  { id: 'lieutenant', name: 'Lieutenant', permissions: { approveMembers: true, confirmRep: true }, pages: ALL_PAGES },
  { id: 'enforcer', name: 'Enforcer', permissions: {}, pages: pages(BASIC_PAGES) },
  { id: 'soldier', name: 'Soldier', permissions: {}, pages: pages(BASIC_PAGES) },
  { id: 'associate', name: 'Associate', permissions: {}, pages: pages(BASIC_PAGES) },
];

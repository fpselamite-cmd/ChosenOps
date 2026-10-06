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
} as const;
export type Permission = keyof typeof PERMISSIONS;
export type PermissionMap = Partial<Record<Permission, boolean>>;

export interface Rank {
  id: string;
  name: string;
  /** 0 is the top of the family; higher numbers sit lower in the chain of command. */
  order: number;
  /** "Leadership" ranks sit in the top tier of the Family tree. */
  leadership?: boolean;
  permissions: PermissionMap;
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
  createdAt?: Timestamp;
}

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
  { id: 'boss', name: 'Boss', leadership: true, permissions: all() },
  { id: 'consigliere', name: 'Consigliere', leadership: true, permissions: all() },
  { id: 'underboss', name: 'Underboss', leadership: true, permissions: all() },
  {
    id: 'treasurer',
    name: 'Treasurer',
    leadership: true,
    permissions: { approveMembers: true, postAnnouncements: true },
  },
  {
    id: 'caporegime',
    name: 'Caporegime',
    permissions: { approveMembers: true, resetPins: true, postAnnouncements: true },
  },
  { id: 'lieutenant', name: 'Lieutenant', permissions: { approveMembers: true } },
  { id: 'enforcer', name: 'Enforcer', permissions: {} },
  { id: 'soldier', name: 'Soldier', permissions: {} },
  { id: 'associate', name: 'Associate', permissions: {} },
];

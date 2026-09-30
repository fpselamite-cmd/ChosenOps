import type { Timestamp } from 'firebase/firestore';

export const PERMISSIONS = {
  approveMembers: 'Approve new members',
  manageMembers: 'Manage members (rank, status, chain of command)',
  manageRanks: 'Edit ranks & permissions',
  manageSettings: 'Edit family settings',
  viewBudget: 'View budget',
  editBudget: 'Edit budget',
  editInventory: 'Edit inventory',
  postAnnouncements: 'Post announcements',
  resetPins: 'Reset member PINs',
} as const;

export type Permission = keyof typeof PERMISSIONS;
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

export type Currency = 'clean' | 'dirty' | 'rep';

export interface Transaction {
  id: string;
  type: Currency;
  amount: number;
  reason: string;
  category?: string;
  createdBy: string;
  createdAt?: Timestamp;
  linkedItemId?: string | null;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unitCost: number;
  costType: 'clean' | 'dirty';
  location?: string;
  notes?: string;
  addedBy: string;
  updatedAt?: Timestamp;
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
  inventoryCategories: string[];
  transactionCategories: string[];
}

export const DEFAULT_INVENTORY_CATEGORIES = ['Weapons', 'Ammo', 'Drugs', 'Vehicles', 'Tools', 'Materials', 'Misc'];
export const DEFAULT_TRANSACTION_CATEGORIES = ['Job Payout', 'Sale', 'Purchase', 'Laundering', 'Dues', 'Upkeep', 'Tribute', 'Other'];

export const DEFAULT_RANKS: Omit<Rank, 'order'>[] = [
  { id: 'head', name: 'Head of the Family', permissions: allPermissions() },
  { id: 'underboss', name: 'Underboss', permissions: allPermissions() },
  {
    id: 'consigliere',
    name: 'Consigliere',
    permissions: { approveMembers: true, manageMembers: true, resetPins: true, viewBudget: true, editBudget: true, editInventory: true, postAnnouncements: true },
  },
  { id: 'lieutenant', name: 'Lieutenant', permissions: { approveMembers: true, viewBudget: true, editInventory: true, postAnnouncements: true } },
  { id: 'enforcer', name: 'Enforcer', permissions: { viewBudget: true, editInventory: true } },
  { id: 'associate', name: 'Associate', permissions: { viewBudget: true } },
  { id: 'prospect', name: 'Prospect', permissions: {} },
];

function allPermissions(): PermissionMap {
  return Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true]));
}

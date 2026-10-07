import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { PAGES, PERMISSIONS, type PageId, type PageMap, type Permission, type PermissionMap, type Rank } from './types';

/**
 * Roles are jobs anyone can hold on top of their rank (Washer, Rep Keeper…), or honors that only
 * show as a chip (Founder, Cop Killer…). Rank powers and role powers add up. High Table counts as
 * leadership whatever the rank.
 */
export interface Role {
  id: string;
  name: string;
  /** Lower shows first. */
  order: number;
  perms: PermissionMap;
  pages: PageMap;
  /** Leadership powers on every page (High Table). */
  lead?: boolean;
  /** Only a badge: no powers. */
  honor?: boolean;
  note?: string;
}

/**
 * What someone holds, with the powers of those roles worked out ahead of time, so the security
 * rules can check one small file instead of every role.
 */
export interface RoleHolder {
  id: string;
  roles: string[];
  perms: PermissionMap;
  pages: PageMap;
  lead: boolean;
}

const allPerms = (): PermissionMap => Object.fromEntries(Object.keys(PERMISSIONS).map((k) => [k, true]));
const allPages = (): PageMap => Object.fromEntries(Object.keys(PAGES).map((k) => [k, true]));

export const DEFAULT_ROLES: Omit<Role, 'order'>[] = [
  { id: 'high_table', name: 'High Table', lead: true, perms: allPerms(), pages: allPages(), note: 'Leadership powers, whatever their rank.' },
  { id: 'welcome', name: 'Welcome Committee', perms: { approveMembers: true }, pages: {}, note: 'Lets newcomers in and sends welcome notes. Will run the associate section and welcome center.' },
  { id: 'rep_keeper', name: 'Rep Keeper', perms: { confirmRep: true }, pages: { pettycrime: true, blacksites: true }, note: 'Confirms petty and blacksite rep.' },
  { id: 'washer', name: 'Washer', perms: { washMoney: true }, pages: { blackmarket: true }, note: 'Takes and finishes wash requests.' },
  { id: 'event_planner', name: 'Event Planner', perms: { manageEvents: true }, pages: { calendar: true }, note: 'Edits and removes anyone’s gang events.' },
  { id: 'archivist', name: 'Archivist', perms: { hallOfFame: true }, pages: {}, note: 'Keeps the Hall of Fame (lore page and trophy approvals coming).' },
  { id: 'enforcer', name: 'Enforcer', honor: true, perms: {}, pages: {} },
  { id: 'cop_killer', name: 'Cop Killer', honor: true, perms: {}, pages: {} },
  { id: 'founder', name: 'Founder', honor: true, perms: {}, pages: {} },
];

/** Adds up the powers and pages of a set of roles. */
export function powersOf(roleIds: string[], roleById: Map<string, Role>) {
  const perms: PermissionMap = {};
  const pages: PageMap = {};
  let lead = false;
  roleIds.forEach((id) => {
    const r = roleById.get(id);
    if (!r || r.honor) return;
    Object.entries(r.perms ?? {}).forEach(([k, v]) => v && (perms[k as Permission] = true));
    Object.entries(r.pages ?? {}).forEach(([k, v]) => v && (pages[k as PageId] = true));
    if (r.lead) lead = true;
  });
  return { perms, pages, lead };
}

/** Gives or takes roles from one member. */
export function setMemberRoles(memberId: string, roleIds: string[], roleById: Map<string, Role>) {
  const b = writeBatch(db);
  b.set(doc(db, 'roleHolders', memberId), { roles: roleIds, ...powersOf(roleIds, roleById) });
  return b.commit();
}

/** Saves a role and refreshes everyone who holds it, so their powers match. */
export async function saveRole(role: Role, holders: RoleHolder[], roleById: Map<string, Role>) {
  const next = new Map(roleById).set(role.id, role);
  const b = writeBatch(db);
  const { id, ...data } = role;
  b.set(doc(db, 'hqRoles', id), data);
  holders.filter((h) => h.roles.includes(id)).forEach((h) => b.set(doc(db, 'roleHolders', h.id), { roles: h.roles, ...powersOf(h.roles, next) }));
  await b.commit();
}

export async function removeRole(id: string, holders: RoleHolder[], roleById: Map<string, Role>) {
  const next = new Map(roleById);
  next.delete(id);
  const b = writeBatch(db);
  b.delete(doc(db, 'hqRoles', id));
  holders
    .filter((h) => h.roles.includes(id))
    .forEach((h) => {
      const roles = h.roles.filter((r) => r !== id);
      b.set(doc(db, 'roleHolders', h.id), { roles, ...powersOf(roles, next) });
    });
  await b.commit();
}

/** Powers that moved from ranks to roles. Leadership ranks and the top rank keep everything. */
export const MOVED: { perm: Permission; to: string; keepOn?: string[] }[] = [
  { perm: 'confirmRep', to: 'Rep Keeper' },
  { perm: 'approveMembers', to: 'Welcome Committee' },
  { perm: 'money', to: 'Treasurer rank', keepOn: ['treasurer'] },
];

/**
 * One-time setup: adds the starting roles and takes the moved powers off ranks that aren't
 * leadership (the Treasurer rank keeps money). Returns what it changed.
 */
export async function setUpRoles(ranks: Rank[], existing: Role[]) {
  const b = writeBatch(db);
  const have = new Set(existing.map((r) => r.id));
  DEFAULT_ROLES.forEach((r, i) => {
    if (have.has(r.id)) return;
    const { id, ...data } = r;
    b.set(doc(db, 'hqRoles', id), { ...data, order: i });
  });
  const changed: string[] = [];
  ranks.forEach((r) => {
    if (r.order === 0 || r.leadership) return;
    const drop = MOVED.filter((m) => r.permissions?.[m.perm] && !m.keepOn?.includes(r.id)).map((m) => m.perm);
    if (!drop.length) return;
    const permissions = { ...r.permissions };
    drop.forEach((p) => delete permissions[p]);
    b.update(doc(db, 'hqRanks', r.id), { permissions });
    changed.push(`${r.name}: ${drop.map((p) => PERMISSIONS[p]).join(', ')}`);
  });
  await b.commit();
  return changed;
}

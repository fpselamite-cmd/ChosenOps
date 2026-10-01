import { DEFAULT_ON_PERMISSIONS, type Permission, type Rank } from './types';

/** Mirrors `can()` in firestore.rules: the top rank (order 0) holds every permission. */
export function hasPermission(rank: Rank | null | undefined, p: Permission) {
  if (!rank) return false;
  if (rank.order === 0) return true;
  const v = rank.permissions?.[p];
  return v === undefined ? DEFAULT_ON_PERMISSIONS.includes(p) : v === true;
}

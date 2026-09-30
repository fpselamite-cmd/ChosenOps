import type { Permission, Rank } from './types';

/** Mirrors `can()` in firestore.rules: the top rank (order 0) holds every permission. */
export function hasPermission(rank: Rank | null | undefined, p: Permission) {
  if (!rank) return false;
  return rank.order === 0 || rank.permissions?.[p] === true;
}

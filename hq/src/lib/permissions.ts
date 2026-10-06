import type { Crew, Member, Permission, Rank } from './types';

/** The top rank (order 0) always has every permission. */
export function rankCan(rank: Rank | undefined, p: Permission) {
  if (!rank) return false;
  return rank.order === 0 || rank.permissions?.[p] === true;
}

/** Pending members (no rank) sit below everyone. */
export const rankOrder = (rank: Rank | undefined) => rank?.order ?? Number.POSITIVE_INFINITY;

/** Officers can only act on people ranked strictly below them. */
export const outranks = (mine: Rank | undefined, theirs: Rank | undefined) => rankOrder(mine) < rankOrder(theirs);

export const leadsCrew = (crew: Crew, me: Member) => crew.leaderId === me.id;
export const inCrew = (crew: Crew, memberId: string) => crew.memberIds.includes(memberId);

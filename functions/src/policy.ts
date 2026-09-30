// Pure authorization logic for PIN resets, kept separate so it can be unit tested.
// Mirrors the rank model in ../../src/lib/types.ts and firestore.rules.

export const PIN_RE = /^\d{4,8}$/;
/** Must match toPassword() in src/lib/auth.ts. */
export const pinToPassword = (pin: string) => `chosen:${pin}`;

export interface MemberDoc {
  status?: string;
  rankId?: string | null;
}
export interface RankDoc {
  order: number;
  permissions?: Record<string, boolean>;
}

/** Returns null when the reset is allowed, otherwise the reason it isn't. */
export function resetDenial(
  callerId: string,
  caller: MemberDoc | undefined,
  callerRank: RankDoc | undefined,
  targetId: string,
  target: MemberDoc | undefined,
  targetRank: RankDoc | undefined,
): string | null {
  if (!caller || caller.status !== 'active' || !callerRank) return 'You are not an active member.';
  if (callerRank.order !== 0 && callerRank.permissions?.resetPins !== true) return 'Your rank cannot reset PINs.';
  if (!target) return 'That member does not exist.';
  if (callerId === targetId) return 'You cannot reset your own PIN here.';
  // Members without a rank (pending / denied) sit below everyone.
  if (target.rankId && (!targetRank || targetRank.order <= callerRank.order))
    return 'You can only reset PINs for members ranked below you.';
  return null;
}

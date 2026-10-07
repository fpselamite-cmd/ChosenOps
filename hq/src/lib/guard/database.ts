// Vite points 'firebase/database' here: the real SDK, but writes stop while previewing as someone else.
export * from '@firebase/database';
import * as rt from '@firebase/database';
import { blocked, isReadOnly } from './state';

export const set = ((...a: Parameters<typeof rt.set>) => (isReadOnly() ? blocked() : rt.set(...a))) as typeof rt.set;
export const update = ((...a: Parameters<typeof rt.update>) => (isReadOnly() ? blocked() : rt.update(...a))) as typeof rt.update;
export const remove = ((...a: Parameters<typeof rt.remove>) => (isReadOnly() ? blocked() : rt.remove(...a))) as typeof rt.remove;
export const runTransaction = ((...a: Parameters<typeof rt.runTransaction>) => (isReadOnly() ? blocked() : rt.runTransaction(...a))) as typeof rt.runTransaction;
export const push = ((...a: Parameters<typeof rt.push>) => {
  if (!isReadOnly() || a[1] === undefined) return rt.push(...a);
  // push(ref, value) writes; push(ref) only makes a key.
  const p = blocked() as unknown as rt.ThenableReference;
  return p;
}) as typeof rt.push;

// Vite points 'firebase/firestore' here: everything is the real SDK, but writes stop while previewing as someone else.
export * from '@firebase/firestore';
import * as fs from '@firebase/firestore';
import { blocked, isReadOnly } from './state';

export const setDoc = ((...a: Parameters<typeof fs.setDoc>) => (isReadOnly() ? blocked() : (fs.setDoc as (...x: unknown[]) => Promise<void>)(...a))) as typeof fs.setDoc;
export const updateDoc = ((...a: unknown[]) => (isReadOnly() ? blocked() : (fs.updateDoc as (...x: unknown[]) => Promise<void>)(...a))) as typeof fs.updateDoc;
export const addDoc = ((...a: Parameters<typeof fs.addDoc>) => (isReadOnly() ? blocked() : fs.addDoc(...a))) as typeof fs.addDoc;
export const deleteDoc = ((...a: Parameters<typeof fs.deleteDoc>) => (isReadOnly() ? blocked() : fs.deleteDoc(...a))) as typeof fs.deleteDoc;
export const runTransaction = ((...a: Parameters<typeof fs.runTransaction>) => (isReadOnly() ? blocked() : fs.runTransaction(...a))) as typeof fs.runTransaction;
export const writeBatch = ((...a: Parameters<typeof fs.writeBatch>) => {
  const b = fs.writeBatch(...a);
  const commit = b.commit.bind(b);
  b.commit = () => (isReadOnly() ? blocked() : commit());
  return b;
}) as typeof fs.writeBatch;

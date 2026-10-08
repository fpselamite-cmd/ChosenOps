import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useEffect } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import type { Member } from '../lib/types';
import { useWelcomeAccess } from '../pages/welcome/useWelcome';

type Entry = Pick<Member, 'id' | 'name' | 'nameLower' | 'status' | 'rankId' | 'avatar'>;
const entryOf = (m: Member) => ({ name: m.name ?? null, nameLower: m.nameLower ?? null, status: m.status ?? null, rankId: m.rankId ?? null, avatar: m.avatar ?? null });
const same = (a: ReturnType<typeof entryOf>, b: Entry) => (Object.keys(a) as (keyof typeof a)[]).every((k) => (a[k] ?? null) === ((b as Record<string, unknown>)[k] ?? null));

/**
 * Keeps the family directory (all associates get to see of everyone) in step with the member files.
 * Runs on soldiers' and up phones; writes only what changed. The rules only accept exact copies.
 */
export function DirectorySync() {
  const { members, preview } = useHub();
  const { isAssoc } = useWelcomeAccess();
  const dir = useCollection<Entry>('directory', !isAssoc && !preview);
  useEffect(() => {
    if (isAssoc || preview || !dir) return;
    const have = new Map(dir.map((d) => [d.id, d]));
    const t = setTimeout(() => {
      members.forEach((m) => {
        const e = entryOf(m);
        const cur = have.get(m.id);
        if (!cur || !same(e, cur)) void setDoc(doc(db, 'directory', m.id), e).catch(() => {});
      });
      const ids = new Set(members.map((m) => m.id));
      dir.filter((d) => !ids.has(d.id)).forEach((d) => void deleteDoc(doc(db, 'directory', d.id)).catch(() => {}));
    }, 2500 + Math.random() * 4000);
    return () => clearTimeout(t);
  }, [members, dir, isAssoc, preview]);
  return null;
}

import { collection, deleteField, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { movePin, NARCO_PINS, type Pin } from '../lib/pins';

/** Fields of a stock record that aren't drug counts. */
const NOT_DRUGS = new Set(['id', 'items', '_by', '_via', 'owner']);

/**
 * One-time tidy-up from before drugs were split out: the first Narco member (or High Table) to open HQ
 * moves drug counts out of the shared stash records, drug pins into the Narco-only collection, and
 * labels old place records so the database can tell grows from stash houses. Safe to run again.
 */
export function NarcoMove() {
  const { me, narco, isLead, viaFor, preview } = useHub();
  const ran = useRef(false);
  useEffect(() => {
    if (!narco || preview || ran.current) return;
    ran.current = true;
    const via = viaFor('stash') ?? viaFor('narcotics');
    void (async () => {
      // Drug counts out of stock/* into drugStock/*.
      if (via) {
        const stock = await getDocs(collection(db, 'stock')).catch(() => null);
        for (const d of stock?.docs ?? []) {
          const drugs = Object.fromEntries(Object.entries(d.data()).filter(([k]) => !NOT_DRUGS.has(k)));
          if (!Object.keys(drugs).length) continue;
          const sign = { _by: me.id, _via: via };
          try {
            await setDoc(doc(db, 'drugStock', d.id), { ...drugs, ...sign }, { merge: true });
            await updateDoc(doc(db, 'stock', d.id), { ...Object.fromEntries(Object.keys(drugs).map((k) => [k, deleteField()])), ...sign });
          } catch {
            /* someone without take access here; High Table finishes it */
          }
        }
      }
      // Old place records without a kind.
      const locs = await getDocs(collection(db, 'locations')).catch(() => null);
      for (const l of locs?.docs ?? []) if (!l.data().kind) await updateDoc(l.ref, { kind: /^g\d+$/.test(l.id) ? 'grow' : 'stash' }).catch(() => {});
      // Drug pins out of the shared map collection: my own, and (leadership) every one I can see.
      const qs = [query(collection(db, 'pins'), where('owner', '==', me.id)), ...(isLead ? [query(collection(db, 'pins'), where('scope', '==', 'gang')), ...(me.rankId ? [query(collection(db, 'pins'), where('scope', '==', 'limited'), where('ranks', 'array-contains', me.rankId))] : [])] : [])];
      const seen = new Set<string>();
      for (const q of qs) {
        const snap = await getDocs(q).catch(() => null);
        for (const p of snap?.docs ?? []) {
          if (seen.has(p.id) || !NARCO_PINS.has(String(p.data().type))) continue;
          seen.add(p.id);
          await movePin('pins', { id: p.id, ...p.data() } as Pin).catch(() => {});
        }
      }
    })();
  }, [narco, preview, me.id, me.rankId, isLead, viaFor]);
  return null;
}

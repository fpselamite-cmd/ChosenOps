import { doc, writeBatch } from 'firebase/firestore';
import { useEffect, useRef } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import type { ItemType } from '../lib/items';

/**
 * Undoes a bad rename. An old version of the catalog renamed 183 of the family's items (MCX SPEAR became
 * "MKX Spire", MK18 became "MX-18", and so on), and those names were saved to the live catalog. This puts each
 * one back to the name the family entered, but only where the item still carries the bad name, so anything
 * leadership renamed since stays as it is. Runs quietly for whoever can manage the catalog; does nothing once fixed.
 */
export function NameFix() {
  const { can, preview } = useHub();
  const allowed = can('manageOps') && !preview;
  const types = useCollection<ItemType>('itemTypes', allowed);
  const done = useRef(false);
  useEffect(() => {
    if (!allowed || !types || done.current) return;
    done.current = true;
    void Promise.all([import('../data/badNames.json'), import('../data/catalog.json')]).then(async ([b, c]) => {
      const bad = b.default as Record<string, string>;
      const good = new Map((c.default as { id: string; name: string }[]).map((i) => [i.id, i.name]));
      const wrong = types.filter((t) => bad[t.id] !== undefined && t.name === bad[t.id] && good.has(t.id));
      for (let i = 0; i < wrong.length; i += 400) {
        const batch = writeBatch(db);
        wrong.slice(i, i + 400).forEach((t) => batch.update(doc(db, 'itemTypes', t.id), { name: good.get(t.id)! }));
        await batch.commit().catch(() => {});
      }
    });
  }, [allowed, types]);
  return null;
}

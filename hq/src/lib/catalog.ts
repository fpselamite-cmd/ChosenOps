import { useMemo } from 'react';
import { useCollection, useDoc } from '../hooks/useCollection';
import { toCount } from '../noel/data';
import { attachmentsFor, type ItemType } from './items';
import { useLocker } from './locker';

/** The item catalog, and the weapons you can build. */
export function useCatalog() {
  const types = useCollection<ItemType>('itemTypes');
  // Which 3D model each gun shows, as leadership picked in Admin → Gun models.
  const picks = useDoc<GunModels>('settings/gunModels');
  const gunModels = picks?.weapons;
  return useMemo(() => {
    const list = types ?? [];
    const byId = new Map(list.map((t) => [t.id, t]));
    // Weapons you can build: every custom weapon, and base guns that take Black Market parts.
    const weapons = list
      .filter((t) => t.category === 'gun' && !t.baseId && attachmentsFor(t.id, list).length > 0)
      .sort((a, b) => Number(!!a.base) - Number(!!b.base) || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { ready: !!types, types: list, byId, weapons, gunModels: gunModels ?? {} };
  }, [types, gunModels]);
}
export type Catalog = ReturnType<typeof useCatalog>;
/** settings/gunModels: base gun id → model file ('' = the code-built gun). */
export interface GunModels {
  weapons?: Record<string, string>;
}

/** How many of each item I have, across all my storages. */
export function useOwned() {
  const locker = useLocker();
  return useMemo(() => {
    const n = new Map<string, number>();
    locker.stock.forEach((s) => Object.entries(s.items ?? {}).forEach(([k, v]) => n.set(k, (n.get(k) ?? 0) + toCount(v))));
    return n;
  }, [locker.stock]);
}

/** A gun's class, following a member's named copy back to its base gun. */
export const gunClassOf = (t: ItemType | undefined, byId: Map<string, ItemType>) => (t?.baseId ? byId.get(t.baseId)?.gunClass : t?.gunClass) ?? 'rifle';

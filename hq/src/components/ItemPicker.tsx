import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { GUN_CLASSES, ITEM_KINDS, itemSub, itemTitle, kindOf, type ItemKind, type ItemType } from '../lib/items';

/**
 * Searchable item chooser for a catalog of hundreds of guns and attachments.
 * Pick a kind (or search everything); attachments are grouped under their weapon.
 * `only` limits it to a set of item ids (e.g. what a stash actually holds).
 */
export function ItemPicker({
  types,
  value,
  onChange,
  only,
  count,
}: {
  types: ItemType[];
  value: string | null;
  onChange: (id: string) => void;
  only?: Set<string>;
  count?: (id: string) => number;
}) {
  const byId = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const pool = useMemo(() => types.filter((t) => !only || only.has(t.id)), [types, only]);
  const kinds = ITEM_KINDS.filter((k) => pool.some((t) => kindOf(t, byId) === k.id));
  const [kind, setKind] = useState<ItemKind | 'all'>(() => (value ? kindOf(byId.get(value), byId) : (kinds[0]?.id ?? 'all')));
  const [q, setQ] = useState('');

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return pool
      .filter((t) => (q ? true : kind === 'all' || kindOf(t, byId) === kind))
      .filter((t) => {
        if (!words.length) return true;
        const hay = `${t.name} ${itemSub(t, byId)} ${t.caliber ?? ''}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      });
  }, [pool, kind, q, byId]);

  // Group: guns by class, attachments by weapon, the rest by kind.
  const groups = useMemo(() => {
    const g = new Map<string, ItemType[]>();
    const keyOf = (t: ItemType) => {
      const k = kindOf(t, byId);
      if (t.category === 'attachment') return `Attachments · ${byId.get(t.weapon ?? '')?.name ?? 'Other'}`;
      if (k === 'gun' && !t.baseId) return `${GUN_CLASSES.find((c) => c.id === t.gunClass)?.label ?? 'Guns'}${t.base ? '' : ' · custom'}`;
      return ITEM_KINDS.find((x) => x.id === k)?.label ?? 'Other';
    };
    list.forEach((t) => g.set(keyOf(t), [...(g.get(keyOf(t)) ?? []), t]));
    return [...g.entries()].map(([k, v]) => [k, v.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))] as const);
  }, [list, byId]);

  return (
    <div className="border border-line-soft">
      <div className="flex items-center gap-2 border-b border-line-soft px-2">
        <Search className="size-4 text-smoke" />
        <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder={`Search ${pool.length} items…`} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {!q && kinds.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-line-soft p-1.5">
          {kinds.map((k) => (
            <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`chip px-2 py-0.5 text-[11px] ${kind === k.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {k.label}
            </button>
          ))}
        </div>
      )}
      <div className="max-h-64 overflow-y-auto">
        {groups.map(([g, items]) => (
          <div key={g}>
            <p className="label sticky top-0 bg-coal px-2 py-1">{g}</p>
            {items.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange(t.id)}
                className={`flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm ${value === t.id ? 'bg-gold-400/15 text-gold-100' : 'text-ash hover:bg-raised'}`}
              >
                <span className="min-w-0 flex-1 truncate">{itemTitle(t, byId)}</span>
                {t.category === 'attachment' && <span className="text-[11px] text-smoke">{itemSub(t, byId).split(' · ')[1]}</span>}
                {count && <span className="font-mono text-xs text-gold-300">{count(t.id)}</span>}
              </button>
            ))}
          </div>
        ))}
        {!groups.length && <p className="p-4 text-center text-sm text-smoke">Nothing matches.</p>}
      </div>
    </div>
  );
}

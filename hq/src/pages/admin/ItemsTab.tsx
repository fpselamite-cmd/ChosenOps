import { collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Panel } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { ITEM_KINDS, parseItemList, type ItemKind, type ItemType } from '../../lib/items';

const EXAMPLE = `Guns:
Combat Pistol
Carbine Rifle, rifle, 5.56
Attachments:
Suppressor
Ammo:
9mm Rounds`;

/** Item catalog: everything a stash or locker can hold. Paste a whole list at once. */
export default function ItemsTab() {
  const { me, viaFor } = useHub();
  const items = useCollection<ItemType>('itemTypes');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const known = useMemo(() => new Set((items ?? []).map((i) => i.name.toLowerCase())), [items]);
  const parsed = useMemo(() => parseItemList(text), [text]);
  const fresh = parsed.filter((p, i) => !known.has(p.name.toLowerCase()) && parsed.findIndex((q) => q.name.toLowerCase() === p.name.toLowerCase()) === i);

  async function importAll() {
    setBusy(true);
    const via = viaFor('stash') ?? 'rank';
    for (let i = 0; i < fresh.length; i += 400) {
      const b = writeBatch(db);
      fresh.slice(i, i + 400).forEach((p) => b.set(doc(collection(db, 'itemTypes')), { ...p, _by: me.id, _via: via }));
      await b.commit();
    }
    setDone(`Added ${fresh.length} item${fresh.length === 1 ? '' : 's'}.`);
    setText('');
    setBusy(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
      <Panel title="Bulk import">
        <p className="mb-3 text-sm text-smoke">
          Paste one item per line. A line like <b className="text-gold-200">Guns:</b> sets the type for the lines under it. Extra columns (split by comma, tab or |) are
          kept as notes. Names already in the catalog are skipped.
        </p>
        <textarea className="input min-h-56 font-mono text-sm" placeholder={EXAMPLE} value={text} onChange={(e) => (setText(e.target.value), setDone(null))} />
        {parsed.length > 0 && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded border border-line-soft">
            <table className="w-full text-sm">
              <tbody>
                {parsed.map((p, i) => (
                  <tr key={i} className={`border-b border-line-soft last:border-0 ${known.has(p.name.toLowerCase()) ? 'opacity-40' : ''}`}>
                    <td className="px-2 py-1 text-gold-100">{p.name}</td>
                    <td className="px-2 py-1 text-smoke">{ITEM_KINDS.find((k) => k.id === p.category)?.one}</td>
                    <td className="px-2 py-1 text-xs text-ash">{known.has(p.name.toLowerCase()) ? 'already in' : p.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button className="btn-gold" disabled={!fresh.length || busy} onClick={importAll}>
            Add {fresh.length || ''} item{fresh.length === 1 ? '' : 's'}
          </button>
          {done && <span className="text-sm text-gold-300">{done}</span>}
        </div>
      </Panel>

      <Panel title={`Catalog · ${items?.length ?? 0}`}>
        {ITEM_KINDS.map((k) => {
          const list = (items ?? []).filter((i) => (i.category ?? 'other') === k.id).sort((a, b) => a.name.localeCompare(b.name));
          if (!list.length) return null;
          return (
            <div key={k.id} className="mb-4">
              <p className="label mb-1.5">{k.label}</p>
              <ul className="divide-y divide-line-soft">
                {list.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 py-1.5">
                    <span className="flex-1 text-gold-100">
                      {i.name} {i.notes && <span className="text-xs text-ash">· {i.notes}</span>}
                    </span>
                    <select className="input w-36 py-1 text-xs" value={i.category ?? 'other'} onChange={(e) => updateDoc(doc(db, 'itemTypes', i.id), { category: e.target.value as ItemKind })}>
                      {ITEM_KINDS.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.one}
                        </option>
                      ))}
                    </select>
                    <button className="text-ash hover:text-blood" title="Remove from catalog" onClick={() => confirm(`Remove ${i.name} from the catalog?`) && deleteDoc(doc(db, 'itemTypes', i.id))}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </Panel>
    </div>
  );
}

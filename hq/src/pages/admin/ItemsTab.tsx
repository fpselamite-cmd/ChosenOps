import { collection, deleteDoc, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { Check, ChevronRight, Download, Pencil, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { GUN_CLASSES, ITEM_KINDS, itemSub, itemTitle, kindOf, parseItemList, slotLabel, SLOTS, type ItemKind, type ItemType } from '../../lib/items';

const EXAMPLE = `Guns:
Combat Pistol
Carbine Rifle, rifle
Tools:
Lockpick`;

/** The family's own list: guns, attachments, ammo, melee, armor and safety gear (src/data/catalog.json). */
function StandardCatalog({ have }: { have: Set<string> }) {
  const { me, viaFor } = useHub();
  const [list, setList] = useState<ItemType[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  useEffect(() => {
    import('../../data/catalog.json').then((m) => setList(m.default as ItemType[]));
  }, []);
  if (!list) return null;
  const fresh = list.filter((i) => !have.has(i.id));
  const counts = ITEM_KINDS.map((k) => [k.label, list.filter((i) => i.category === k.id).length] as const).filter(([, n]) => n);
  async function load() {
    setBusy(true);
    const via = viaFor('stash') ?? 'rank';
    // Merge, so re-loading after the list changes fixes names and slots without touching custom names.
    for (let i = 0; i < list!.length; i += 400) {
      const b = writeBatch(db);
      list!.slice(i, i + 400).forEach(({ id, ...it }) => b.set(doc(db, 'itemTypes', id), { ...it, _by: me.id, _via: via }, { merge: true }));
      await b.commit();
    }
    setDone(fresh.length ? `Loaded ${fresh.length} new items.` : 'Catalog refreshed.');
    setBusy(false);
  }
  return (
    <Panel title="Standard catalog" className="mb-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ash">
            Your list: <b className="text-gold-100">{list.length} items</b> · {counts.map(([l, n]) => `${n} ${l.toLowerCase()}`).join(' · ')}.
          </p>
          <p className="text-xs text-smoke">
            {fresh.length ? `${fresh.length} not loaded yet.` : 'All loaded.'} Every attachment is tied to its weapon and slot; every caliber has a box and loose rounds.
          </p>
        </div>
        <button className="btn-gold" onClick={load} disabled={busy}>
          {done && !busy ? <Check className="size-4" /> : <Download className="size-4" />} {busy ? 'Loading…' : fresh.length ? `Load ${fresh.length} items` : 'Refresh'}
        </button>
      </div>
      {done && <p className="mt-2 text-sm text-gold-300">{done}</p>}
    </Panel>
  );
}

function Row({ i, byId }: { i: ItemType; byId: Map<string, ItemType> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(i.name);
  return (
    <li className="flex items-center gap-2 py-1.5">
      {editing ? (
        <form
          className="flex flex-1 gap-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (name.trim()) await updateDoc(doc(db, 'itemTypes', i.id), { name: name.trim().slice(0, 40) });
            setEditing(false);
          }}
        >
          <input className="input flex-1 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus />
          <button className="btn-gold btn-sm">Save</button>
        </form>
      ) : (
        <span className="min-w-0 flex-1">
          <span className="text-gold-100">{itemTitle(i, byId)}</span>
          {itemSub(i, byId) && <span className="ml-2 text-xs text-smoke">{itemSub(i, byId)}</span>}
          {i.notes && <span className="ml-2 text-xs text-ash">· {i.notes}</span>}
        </span>
      )}
      {!editing && i.category !== 'attachment' && !i.baseId && (
        <select className="input w-32 py-1 text-xs" value={i.category ?? 'other'} onChange={(e) => updateDoc(doc(db, 'itemTypes', i.id), { category: e.target.value as ItemKind })}>
          {ITEM_KINDS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.one}
            </option>
          ))}
        </select>
      )}
      {!editing && (
        <button className="text-ash hover:text-gold-200" title="Rename" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" />
        </button>
      )}
      <button className="text-ash hover:text-danger" title="Remove from catalog" onClick={() => confirm(`Remove ${i.name} from the catalog?`) && deleteDoc(doc(db, 'itemTypes', i.id))}>
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

/** One custom weapon with its attachments by slot, folded away until opened. */
function WeaponGroup({ w, attachments, byId, open }: { w: ItemType; attachments: ItemType[]; byId: Map<string, ItemType>; open: boolean }) {
  const [shown, setShown] = useState(open);
  useEffect(() => setShown(open), [open]);
  return (
    <div className="border-b border-line-soft">
      <div className="flex items-center gap-1">
        <button className="text-smoke" onClick={() => setShown(!shown)} aria-label="Show attachments">
          <ChevronRight className={`size-4 transition ${shown ? 'rotate-90' : ''}`} />
        </button>
        <ul className="flex-1">
          <Row i={w} byId={byId} />
        </ul>
        <span className="text-xs text-smoke">{attachments.length} attachments</span>
      </div>
      {shown && (
        <div className="mb-2 ml-5 border-l border-line-soft pl-3">
          {SLOTS.map((sl) => {
            const list = attachments.filter((a) => a.slot === sl.id);
            return list.length ? (
              <div key={sl.id}>
                <p className="label mt-1.5">{slotLabel(sl.id)}</p>
                <ul className="divide-y divide-line-soft">
                  {list.map((a) => (
                    <Row key={a.id} i={a} byId={byId} />
                  ))}
                </ul>
              </div>
            ) : null;
          })}
        </div>
      )}
    </div>
  );
}

/** Item catalog: everything a stash or locker can hold. */
export default function ItemsTab() {
  const { me, viaFor } = useHub();
  const items = useCollection<ItemType>('itemTypes');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [kind, setKind] = useState<ItemKind>('gun');
  const [q, setQ] = useState('');

  const all = useMemo(() => items ?? [], [items]);
  const byId = useMemo(() => new Map(all.map((i) => [i.id, i])), [all]);
  const have = useMemo(() => new Set(all.map((i) => i.id)), [all]);
  const known = useMemo(() => new Set(all.map((i) => i.name.toLowerCase())), [all]);
  const parsed = useMemo(() => parseItemList(text), [text]);
  const fresh = parsed.filter((p, i) => !known.has(p.name.toLowerCase()) && parsed.findIndex((x) => x.name.toLowerCase() === p.name.toLowerCase()) === i);

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

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (i: ItemType) => words.every((w) => `${i.name} ${itemSub(i, byId)}`.toLowerCase().includes(w));
  const inKind = all.filter((i) => kindOf(i, byId) === kind || (kind === 'gun' && i.category === 'attachment'));
  const sort = (a: ItemType, b: ItemType) => a.name.localeCompare(b.name, undefined, { numeric: true });

  return (
    <>
      <StandardCatalog have={have} />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Panel title="Add more by pasting">
          <p className="mb-3 text-sm text-smoke">
            One item per line. A line like <b className="text-gold-200">Guns:</b> sets the type for the lines under it. Names already in the catalog are skipped.
          </p>
          <textarea className="input min-h-44 font-mono text-sm" placeholder={EXAMPLE} value={text} onChange={(e) => (setText(e.target.value), setDone(null))} />
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

        <Panel title={`Catalog · ${all.length}`}>
          <div className="mb-2 flex items-center gap-2 border border-line-soft px-2">
            <Search className="size-4 text-smoke" />
            <input className="w-full bg-transparent py-2 text-sm text-gold-50 outline-none placeholder:text-smoke" placeholder="Search the catalog" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-1">
            {ITEM_KINDS.filter((k) => k.id !== 'attachment').map((k) => {
              const n = all.filter((i) => kindOf(i, byId) === k.id || (k.id === 'gun' && i.category === 'attachment')).length;
              return (
                <button key={k.id} onClick={() => setKind(k.id)} className={`chip px-2.5 py-1 text-xs ${kind === k.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                  {k.id === 'gun' ? 'Guns & attachments' : k.label} {n ? `· ${n}` : ''}
                </button>
              );
            })}
          </div>
          <div className="max-h-[60dvh] overflow-y-auto pr-1">
            {kind === 'gun' ? (
              GUN_CLASSES.map((c) => {
                const guns = inKind.filter((i) => i.category === 'gun' && i.gunClass === c.id && !i.baseId).sort(sort);
                const custom = guns.filter((g) => !g.base && (match(g) || all.some((a) => a.weapon === g.id && match(a))));
                const base = guns.filter((g) => g.base && match(g));
                if (!custom.length && !base.length) return null;
                return (
                  <div key={c.id} className="mb-4">
                    <p className="label mb-1">{c.label}</p>
                    {custom.map((w) => (
                      <WeaponGroup key={w.id} w={w} byId={byId} open={!!words.length} attachments={all.filter((a) => a.weapon === w.id && (match(w) || match(a))).sort(sort)} />
                    ))}
                    {base.length > 0 && (
                      <ul className="divide-y divide-line-soft">
                        {base.map((g) => (
                          <Row key={g.id} i={g} byId={byId} />
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })
            ) : (
              <ul className="divide-y divide-line-soft">
                {inKind
                  .filter(match)
                  .sort(sort)
                  .map((i) => (
                    <Row key={i.id} i={i} byId={byId} />
                  ))}
              </ul>
            )}
            {kind === 'gun' && inKind.filter((i) => i.category === 'gun' && !i.gunClass).length > 0 && (
              <div>
                <p className="label mb-1">Other guns</p>
                <ul className="divide-y divide-line-soft">
                  {inKind
                    .filter((i) => i.category === 'gun' && !i.gunClass && match(i))
                    .map((i) => (
                      <Row key={i.id} i={i} byId={byId} />
                    ))}
                </ul>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </>
  );
}

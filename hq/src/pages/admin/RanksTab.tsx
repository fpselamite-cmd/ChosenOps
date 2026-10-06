import { ArrowDown, ArrowUp, Crown, Plus, Trash2 } from 'lucide-react';
import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { outranks } from '../../lib/permissions';
import { PAGES, PERMISSIONS, type PageId, type Permission, type Rank } from '../../lib/types';

export default function RanksTab() {
  const { ranks, myRank, roster } = useHub();
  const [newName, setNewName] = useState('');

  const editable = (r: Rank) => outranks(myRank, r);

  async function swap(a: Rank, b: Rank) {
    const batch = writeBatch(db);
    batch.update(doc(db, 'hqRanks', a.id), { order: b.order });
    batch.update(doc(db, 'hqRanks', b.id), { order: a.order });
    await batch.commit();
  }

  async function addRank() {
    const name = newName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `rank-${Date.now()}`;
    const order = (ranks[ranks.length - 1]?.order ?? 0) + 1;
    await setDoc(doc(db, 'hqRanks', id), { name, order, permissions: {} });
    setNewName('');
  }

  return (
    <div className="space-y-4">
      {ranks.map((r, i) => {
        const can = editable(r);
        const count = roster.filter((m) => m.rankId === r.id).length;
        const next = ranks[i + 1];
        const prev = ranks[i - 1];
        return (
          <section key={r.id} className={`hud p-4 ${can ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-smoke">#{r.order}</span>
              <input
                className="input max-w-56 font-hud text-base font-bold"
                defaultValue={r.name}
                disabled={!can}
                onBlur={(e) => e.target.value.trim() && e.target.value !== r.name && updateDoc(doc(db, 'hqRanks', r.id), { name: e.target.value.trim() })}
              />
              <label className="flex items-center gap-1.5 text-sm text-ash">
                <input
                  type="checkbox"
                  checked={!!r.leadership}
                  disabled={!can}
                  onChange={(e) => updateDoc(doc(db, 'hqRanks', r.id), { leadership: e.target.checked })}
                  className="accent-gold-400"
                />
                <Crown className="size-3.5 text-gold-400" /> Leadership
              </label>
              <span className="text-sm text-smoke">
                {count} {count === 1 ? 'person' : 'people'}
              </span>
              <span className="ml-auto flex gap-1">
                <button
                  className="btn-ghost btn-sm"
                  disabled={!can || !prev || !editable(prev)}
                  onClick={() => prev && swap(r, prev)}
                  title="Move up"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button className="btn-ghost btn-sm" disabled={!can || !next} onClick={() => next && swap(r, next)} title="Move down">
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  className="btn-danger btn-sm"
                  disabled={!can || count > 0}
                  title={count ? 'Move everyone off this rank first' : 'Delete rank'}
                  onClick={() => confirm(`Delete the ${r.name} rank?`) && deleteDoc(doc(db, 'hqRanks', r.id))}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </div>
            {r.order === 0 ? (
              <p className="mt-3 text-sm text-smoke">The top rank always has every permission and sees every page.</p>
            ) : (
              <>
              <p className="label mt-4 mb-1.5">Pages</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-4">
                {(Object.keys(PAGES) as PageId[]).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ash">
                    <input
                      type="checkbox"
                      className="accent-gold-400"
                      checked={r.pages?.[p] === true}
                      disabled={!can}
                      onChange={(e) => updateDoc(doc(db, 'hqRanks', r.id), { [`pages.${p}`]: e.target.checked })}
                    />
                    {PAGES[p]}
                  </label>
                ))}
              </div>
              <p className="label mt-4 mb-1.5">Powers</p>
              <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
                  <label key={p} className="flex items-center gap-2 text-sm text-ash">
                    <input
                      type="checkbox"
                      className="accent-gold-400"
                      checked={r.permissions?.[p] === true}
                      disabled={!can}
                      onChange={(e) => updateDoc(doc(db, 'hqRanks', r.id), { [`permissions.${p}`]: e.target.checked })}
                    />
                    {PERMISSIONS[p]}
                  </label>
                ))}
              </div>
              </>
            )}
          </section>
        );
      })}
      <div className="flex gap-2">
        <input className="input max-w-64" placeholder="New rank name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn-gold" onClick={addRank} disabled={!newName.trim()}>
          <Plus className="size-4" /> Add rank at the bottom
        </button>
      </div>
    </div>
  );
}

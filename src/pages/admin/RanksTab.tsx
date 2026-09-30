import { deleteDoc, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { useState } from 'react';
import { RankBadge } from '../../components/RankBadge';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { PERMISSIONS, type Permission, type Rank } from '../../lib/types';

export default function RanksTab() {
  const { ranks, myRank, members } = useHub();
  const [error, setError] = useState('');

  const move = async (i: number, dir: -1 | 1) => {
    const a = ranks[i];
    const b = ranks[i + dir];
    if (!a || !b) return;
    setError('');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'ranks', a.id), { order: b.order });
      batch.update(doc(db, 'ranks', b.id), { order: a.order });
      await batch.commit();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const add = async () => {
    const name = prompt('Name of the new rank?')?.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    try {
      await setDoc(doc(db, 'ranks', id), { name, order: Math.max(...ranks.map((r) => r.order)) + 1, permissions: {} });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-smoke">
        Top of the list is the top of the family. The highest rank always has every permission. You can edit, reorder and delete ranks
        below your own ({myRank?.name}).
      </p>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="space-y-3">
        {ranks.map((r, i) => {
          const below = !!myRank && r.order > myRank.order;
          return (
            <RankRow
              key={r.id}
              rank={r}
              editable={below}
              renameOnly={r.id === myRank?.id}
              memberCount={members.filter((m) => m.rankId === r.id && m.status !== 'pending').length}
              canUp={below && i > 0 && ranks[i - 1].order > (myRank?.order ?? 0)}
              canDown={below && i < ranks.length - 1}
              onMove={(d) => move(i, d)}
            />
          );
        })}
      </div>
      <button className="btn-ghost" onClick={add}>
        + Add rank
      </button>
    </div>
  );
}

function RankRow({
  rank,
  editable,
  renameOnly,
  memberCount,
  canUp,
  canDown,
  onMove,
}: {
  rank: Rank;
  editable: boolean;
  renameOnly: boolean;
  memberCount: number;
  canUp: boolean;
  canDown: boolean;
  onMove: (dir: -1 | 1) => void;
}) {
  const [name, setName] = useState(rank.name);
  const [color, setColor] = useState(rank.color || '#d4af37');
  const [perms, setPerms] = useState(rank.permissions ?? {});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const canEditName = editable || renameOnly;
  const dirty = name !== rank.name || color !== (rank.color || '#d4af37') || JSON.stringify(perms) !== JSON.stringify(rank.permissions ?? {});

  const save = async () => {
    setError('');
    try {
      await updateDoc(doc(db, 'ranks', rank.id), editable ? { name: name.trim(), color, permissions: perms } : { name: name.trim(), color });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className={`panel p-4 ${!canEditName ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <button className="text-xs text-smoke hover:text-gold-200 disabled:opacity-20" disabled={!canUp} onClick={() => onMove(-1)} aria-label="Move up">
            ▲
          </button>
          <button className="text-xs text-smoke hover:text-gold-200 disabled:opacity-20" disabled={!canDown} onClick={() => onMove(1)} aria-label="Move down">
            ▼
          </button>
        </div>
        {canEditName ? (
          <>
            <input className="input w-56" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-10 cursor-pointer rounded border border-edge bg-coal" title="Rank colour" />
          </>
        ) : (
          <RankBadge rank={rank} />
        )}
        <span className="text-xs text-smoke">
          {memberCount} member{memberCount === 1 ? '' : 's'}
        </span>
        <div className="flex-1" />
        {canEditName && (
          <button className="btn-gold px-3 py-1.5 text-xs" disabled={!dirty || !name.trim()} onClick={save}>
            {saved ? 'Saved ✓' : 'Save'}
          </button>
        )}
        {editable && (
          <button
            className="btn-danger px-3 py-1.5 text-xs"
            disabled={memberCount > 0}
            title={memberCount > 0 ? 'Move members out of this rank first' : 'Delete rank'}
            onClick={() => confirm(`Delete the ${rank.name} rank?`) && deleteDoc(doc(db, 'ranks', rank.id)).catch((e) => setError(e.message))}
          >
            Delete
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <div className="mt-3 grid gap-x-6 gap-y-1.5 pl-7 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(PERMISSIONS) as Permission[]).map((p) => (
          <label key={p} className={`flex items-center gap-2 text-xs ${editable ? 'cursor-pointer' : 'text-smoke'}`}>
            <input
              type="checkbox"
              className="accent-gold-400"
              disabled={!editable}
              checked={rank.order === 0 || !!perms[p]}
              onChange={(e) => setPerms((prev) => ({ ...prev, [p]: e.target.checked }))}
            />
            {PERMISSIONS[p]}
          </label>
        ))}
      </div>
    </div>
  );
}

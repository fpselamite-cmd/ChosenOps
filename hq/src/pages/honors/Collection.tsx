import { Gift, Lock, Undo2 } from 'lucide-react';
import { Badge, HonorPic, RarityChip } from '../../components/HonorArt';
import { Modal } from '../../components/Modal';
import { useHub } from '../../hooks/useHub';
import { fmtDate } from '../../lib/format';
import { CHIPS_FOR, groupOf, HIGH_TIER, KINDS, RARITIES, revoke, SETS, setMembers, STATS, type Honor, type Owned } from '../../lib/honors';
import type { Member } from '../../lib/types';
import { useHonors, useMyHonorStats } from './useHonors';

const statLabel = (id?: string | null) => STATS.find((s) => s.id === id)?.label ?? id ?? '';
const rank = (h: Honor) => RARITIES.findIndex((r) => r.id === h.rarity);

/** What it takes, unless it's a secret (or high tier) the viewer hasn't earned themselves. */
function howText(h: Honor, o: Owned | undefined, viewerHas: boolean) {
  const hidden = !viewerHas && (h.secret || HIGH_TIER.includes(h.rarity));
  if (hidden && !o) return 'Earn it to find out.';
  if (h.source === 'honor') return h.description || 'Given by High Table.';
  return o ? h.description : `${statLabel(h.stat)}: ${(h.goal ?? 0).toLocaleString()}`;
}

/** A big look at one piece: turning slowly, with its story, when it was earned and its number. */
export function Inspect({ h, m, onClose, onGive }: { h: Honor; m: Member; onClose: () => void; onGive?: () => void }) {
  const { me, isLead } = useHub();
  const { ownedBy, has, serialOf, honors } = useHonors();
  const o = ownedBy(m.id).find((x) => x.honorId === h.id);
  const viewerHas = has(me.id, h.id);
  const nameHidden = h.secret && !o && !viewerHas;
  const serial = o ? serialOf(m.id, h.id) : null;
  const set = SETS.find((st) => setMembers(honors, st.group).some((x) => x.id === h.id));
  const setPieces = set ? setMembers(honors, set.group) : [];
  return (
    <Modal title={nameHidden ? '???' : h.name} onClose={onClose}>
      <div className="space-y-4 text-center">
        <div className={`inspect-stage rar-${h.rarity} ${o ? '' : 'locked'}`}>
          <div className="inspect-spin">{h.kind === 'badge' ? <Badge h={h} size={170} ribbon locked={!o} /> : <HonorPic h={h} locked={!o && nameHidden} member={m} />}</div>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <RarityChip r={h.rarity} />
          <span className="label text-[10px] text-smoke">{KINDS.find((k) => k.id === h.kind)?.label}</span>
          {h.season && <span className="text-[10px] tracking-widest text-sky-300 uppercase">{h.season}</span>}
        </div>
        <p className="text-sm text-ash">{howText(h, o, viewerHas)}</p>
        {o ? (
          <div className="inspect-plate">
            {serial && (
              <b className="font-display text-xl text-gold-100">
                No. {serial.n} <span className="text-sm text-smoke">of {serial.of}</span>
              </b>
            )}
            <span className="block text-xs text-smoke">
              {o.by === 'milestone' ? 'Earned' : o.by === 'shop' ? 'Bought at the chip shop' : `From ${o.byName}`} · {o.at ? fmtDate(o.at) : 'just now'}
              {o.note ? ` · “${o.note}”` : ''}
            </span>
          </div>
        ) : (
          <p className="flex items-center justify-center gap-1.5 text-xs text-smoke">
            <Lock className="size-3.5" /> Not in {m.id === me.id ? 'your' : `${m.name}'s`} collection yet
          </p>
        )}
        {set && (
          <p className="text-xs text-smoke">
            Part of the <b className="text-gold-200">{set.label}</b> set · {setPieces.filter((x) => has(m.id, x.id)).length} of {setPieces.length} collected
          </p>
        )}
        <p className="text-[11px] text-smoke">Worth {(h.chips ?? CHIPS_FOR[h.rarity]).toLocaleString()} chips when unlocked</p>
        {isLead && onGive && h.source === 'honor' && !o && h.status === 'active' && m.id !== me.id && (
          <button className="btn-gold btn-sm" onClick={onGive}>
            <Gift className="size-3.5" /> Give it to {m.name}
          </button>
        )}
        {isLead && o && o.by !== 'milestone' && o.by !== 'shop' && (
          <button className="text-xs text-smoke hover:text-red-300" onClick={() => confirm(`Take ${h.name} back from ${m.name}?`) && revoke(m.id, h.id).then(onClose)}>
            <Undo2 className="inline size-3" /> Revoke
          </button>
        )}
      </div>
    </Modal>
  );
}

/** The Honorwall as a display case: one tray per set, plus High Table's honors and the chip shop's. */
export function DisplayCase({ m, onOpen }: { m: Member; onOpen: (h: Honor) => void }) {
  const { me } = useHub();
  const { honors, has, ownedBy, serialOf } = useHonors();
  const stats = useMyHonorStats();
  const mine = m.id === me.id;
  const owned = new Map(ownedBy(m.id).map((o) => [o.honorId, o]));
  const live = honors.filter((h) => h.status === 'active' || owned.has(h.id));
  const setMedal = (id: string) => live.find((h) => h.id === `set-${id}`);
  const trays = [
    ...SETS.map((st) => ({ key: st.id, title: st.label, pieces: setMembers(live, st.group), medal: setMedal(st.id) })).filter((t) => t.pieces.length),
    { key: 'feats', title: 'Feats & seasons', pieces: live.filter((h) => h.source === 'milestone' && (groupOf(h.stat) === 'Feats' || !!h.season) && !h.id.startsWith('set-')), medal: undefined },
    { key: 'given', title: 'Given by High Table', pieces: live.filter((h) => h.source === 'honor' && !h.price && !h.id.startsWith('set-')), medal: undefined },
    { key: 'shop', title: 'From the chip shop', pieces: live.filter((h) => h.source === 'honor' && (h.price ?? 0) > 0), medal: undefined },
  ].filter((t) => t.pieces.length);
  const piece = (h: Honor) => {
    const o = owned.get(h.id);
    const viewerHas = has(me.id, h.id);
    const nameHidden = h.secret && !o && !viewerHas;
    const serial = o ? serialOf(m.id, h.id) : null;
    const progress = mine && !o && h.source === 'milestone' && h.stat && stats && !(h.secret || HIGH_TIER.includes(h.rarity)) ? Math.min(1, (stats[h.stat] ?? 0) / (h.goal || 1)) : null;
    return (
      <button key={h.id} type="button" className={`case-slot rar-${h.rarity} ${o ? 'owned' : 'empty'}`} onClick={() => onOpen(h)} title={nameHidden ? '???' : h.name}>
        <span className="case-well">
          <HonorPic h={h} locked={!o} member={m} />
        </span>
        <span className="case-name">{nameHidden ? '???' : h.name}</span>
        {serial ? <span className="case-serial">No. {serial.n}/{serial.of}</span> : progress !== null ? <span className="case-progress"><i style={{ width: `${progress * 100}%` }} /></span> : <span className="case-serial dim">—</span>}
      </button>
    );
  };
  return (
    <div className="space-y-6">
      {trays.map((t) => {
        const got = t.pieces.filter((h) => owned.has(h.id)).length;
        const done = got === t.pieces.length;
        const pieces = [...t.pieces].sort((a, b) => rank(a) - rank(b) || (a.goal ?? 0) - (b.goal ?? 0) || a.name.localeCompare(b.name));
        return (
          <section key={t.key} className={`case ${done ? 'case-done' : ''}`}>
            <header className="case-head">
              <span className="min-w-0 flex-1">
                <b className="font-display text-lg text-gold-100">{t.title}</b>
                <span className="block text-xs text-smoke">
                  {got} of {t.pieces.length} collected{done && t.medal ? ' · set complete' : ''}
                </span>
              </span>
              {t.medal && (
                <button type="button" className={`case-set ${owned.has(t.medal.id) ? 'owned' : ''}`} onClick={() => onOpen(t.medal!)} title={t.medal.name}>
                  <Badge h={t.medal} size={48} locked={!owned.has(t.medal.id)} />
                  <span className="text-[10px] text-smoke">{owned.has(t.medal.id) ? 'Full Set' : `+${(t.medal.chips ?? 0).toLocaleString()} chips`}</span>
                </button>
              )}
            </header>
            <span className="case-bar">
              <i style={{ width: `${(got / t.pieces.length) * 100}%` }} />
            </span>
            <div className="case-velvet">{pieces.map(piece)}</div>
          </section>
        );
      })}
      <p className="text-center text-[11px] text-smoke">Tap any piece for a closer look.</p>
    </div>
  );
}

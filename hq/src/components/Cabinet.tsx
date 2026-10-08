import '@fortawesome/fontawesome-free/css/all.min.css';
import { Award, Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { awardTrophy, useCabinet, useMyAchievementStats } from '../lib/cabinet';
import { fmtDate } from '../lib/format';
import { squareImage } from '../lib/image';
import { itemTitle, kindOf, type ItemType } from '../lib/items';
import { thingsIn, useLocker } from '../lib/locker';
import { achievementsFor, AWARD_DESIGNS, TIERS, tierFor, type Pedestal, type Tier, type TrophyDesign, type TrophyDoc } from '../lib/trophies';
import type { Member } from '../lib/types';
import { ErrorText, Field } from './Field';
import { Modal } from './Modal';
import { Panel } from './Page';
import { Trophy } from './Trophy';

const KIND_ICON: Record<string, string> = {
  gun: 'fa-gun',
  attachment: 'fa-crosshairs',
  ammo: 'fa-boxes-stacked',
  melee: 'fa-baseball-bat-ball',
  armor: 'fa-shield-halved',
  safety: 'fa-fire-extinguisher',
  throwable: 'fa-bomb',
  gear: 'fa-suitcase',
  tool: 'fa-screwdriver-wrench',
  consumable: 'fa-flask-vial',
  other: 'fa-gem',
};

function useItemTypes() {
  const types = useCollection<ItemType>('itemTypes') ?? [];
  return new Map(types.map((t) => [t.id, t]));
}

/** What stands on one pedestal. */
function Showpiece({ p, trophy, items }: { p: Pedestal; trophy?: TrophyDoc; items: Map<string, ItemType> }) {
  if (p.kind === 'trophy' && trophy) return <Trophy design={trophy.design} tier={trophy.tier} size={86} title={trophy.title} />;
  if (p.kind === 'keepsake' && p.image) return <img src={p.image} alt={p.name} className="keepsake-photo mb-2" />;
  if (p.kind === 'item') {
    const t = p.itemTypeId ? items.get(p.itemTypeId) : undefined;
    const drug = p.itemTypeId?.startsWith('drug:') ? p.itemTypeId.slice(5) : null;
    if (drug) return <img src={`/noel/logos/${drug}.png`} alt="" className="mb-2 size-24 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)]" />;
    return (
      <i
        className={`fa-solid ${KIND_ICON[kindOf(t, items)] ?? KIND_ICON.other} mb-3 text-6xl`}
        style={{ background: 'linear-gradient(160deg,#fff2b0,#d4af37 45%,#6e5516)', WebkitBackgroundClip: 'text', color: 'transparent', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.7))' }}
      />
    );
  }
  return (
    <span className="mb-3 text-5xl" aria-hidden>
      ✦
    </span>
  );
}

function captionFor(p: Pedestal, trophy: TrophyDoc | undefined, items: Map<string, ItemType>) {
  if (p.kind === 'trophy') return trophy?.title ?? 'Trophy';
  if (p.kind === 'item') return p.name ?? (p.itemTypeId ? items.get(p.itemTypeId)?.name : '') ?? 'Item';
  return p.name ?? 'Keepsake';
}

function PedestalEditor({ memberId, index, current, trophies, onClose }: { memberId: string; index: number; current?: Pedestal; trophies: TrophyDoc[]; onClose: () => void }) {
  const cab = useCabinet(memberId);
  const locker = useLocker();
  const items = useItemTypes();
  const [kind, setKind] = useState<Pedestal['kind']>(current?.kind ?? (trophies.length ? 'trophy' : 'item'));
  const [trophyId, setTrophyId] = useState(current?.trophyId ?? trophies[0]?.id ?? '');
  const owned = locker.storages.flatMap((s) => thingsIn(locker.stock.get(s.id), (id) => itemTitle(items.get(id), items)));
  const { narco } = useHub();
  const ownedOptions = [...new Map(owned.filter((t) => narco || t.item).map((t) => [t.item ?? `drug:${t.strain ?? t.field}`, t.item ? t.label : t.label.replace(/ (bricks?|trimmed|untrimmed)$/, '')])).entries()];
  const [itemId, setItemId] = useState(current?.itemTypeId ?? ownedOptions[0]?.[0] ?? '');
  const [name, setName] = useState(current?.name ?? '');
  const [image, setImage] = useState<string | null>(current?.image ?? null);
  const [label, setLabel] = useState(current?.label ?? '');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    let p: Pedestal;
    if (kind === 'trophy') {
      if (!trophyId) return setError('No trophies yet. Earn one or get one from leadership.');
      p = { kind, trophyId };
    } else if (kind === 'item') {
      if (!itemId) return setError('Nothing in your locker to show yet.');
      p = { kind, itemTypeId: itemId, name: ownedOptions.find(([k]) => k === itemId)?.[1] ?? name };
    } else {
      if (!name.trim()) return setError('Give your keepsake a name.');
      p = { kind, name: name.trim().slice(0, 40), image };
    }
    if (label.trim()) p.label = label.trim().slice(0, 40);
    await cab.setSlot(index, p);
    onClose();
  }

  return (
    <Modal title={`Pedestal ${index + 1}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['trophy', 'A trophy'],
              ['item', 'Something from my locker'],
              ['keepsake', 'A keepsake'],
            ] as const
          ).map(([id, l]) => (
            <button key={id} type="button" onClick={() => setKind(id)} className={`chip px-3 py-1.5 text-xs ${kind === id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
              {l}
            </button>
          ))}
        </div>
        {kind === 'trophy' &&
          (trophies.length ? (
            <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
              {trophies.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTrophyId(t.id)}
                  className={`flex flex-col items-center rounded border p-1 text-center ${trophyId === t.id ? 'border-gold-400 bg-gold-400/10' : 'border-line-soft'}`}
                >
                  <Trophy design={t.design} tier={t.tier} size={56} />
                  <span className="mt-1 line-clamp-2 text-[10px] text-ash">{t.title}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-smoke">No trophies yet. Achievements award them as you work, and leadership can award one.</p>
          ))}
        {kind === 'item' && (
          <Field label="From your locker" hint="It stays in your locker (and on your loadout). This just shows it off.">
            {ownedOptions.length ? (
              <select className="input" value={itemId} onChange={(e) => setItemId(e.target.value)}>
                {ownedOptions.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-smoke">Your locker is empty.</p>
            )}
          </Field>
        )}
        {kind === 'keepsake' && (
          <>
            <Field label="Name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. First blacksite, the docks" />
            </Field>
            <Field label="Photo" hint="A screenshot from the city works great.">
              <div className="flex items-center gap-3">
                {image && <img src={image} alt="" className="size-16 object-cover ring-2 ring-gold-500" />}
                <input type="file" accept="image/*" onChange={async (e) => e.target.files?.[0] && setImage(await squareImage(e.target.files[0], 240, 0.78))} className="text-sm text-ash" />
              </div>
            </Field>
          </>
        )}
        <Field label="Label" hint="Engraved on the brass plaque.">
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="e.g. Never forget" />
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-between gap-2">
          {current ? (
            <button
              type="button"
              className="btn-danger"
              onClick={async () => {
                await cab.setSlot(index, null);
                onClose();
              }}
            >
              Clear pedestal
            </button>
          ) : (
            <span />
          )}
          <span className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold">Put on display</button>
          </span>
        </div>
      </form>
    </Modal>
  );
}

export function AwardDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const { me } = useHub();
  const [design, setDesign] = useState<TrophyDesign>('crown');
  const [tier, setTier] = useState<Tier>(3);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title={`Award ${member.name} a trophy`} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return setError('Give the trophy a title.');
          try {
            await awardTrophy(member.id, { id: me.id, name: me.name }, { design, tier, title, note });
            onClose();
          } catch {
            setError('Only ranks with Award trophies can do that.');
          }
        }}
      >
        <div className="grid grid-cols-[auto_1fr] items-center gap-5">
          <div className="flex flex-col items-center">
            <Trophy design={design} tier={tier} size={120} />
          </div>
          <div className="space-y-3">
            <Field label="Title">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Blacksite MVP · Oct 2026" autoFocus />
            </Field>
            <Field label="Why">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Optional" />
            </Field>
            <div className="flex flex-wrap gap-1">
              {TIERS.map((t) => (
                <button key={t.tier} type="button" onClick={() => setTier(t.tier)} className={`chip px-3 py-1.5 text-xs ${tier === t.tier ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-5 gap-1 sm:grid-cols-8">
          {AWARD_DESIGNS.map((d) => (
            <button
              key={d.design}
              type="button"
              title={d.name}
              onClick={() => setDesign(d.design)}
              className={`flex justify-center rounded border p-1 ${design === d.design ? 'border-gold-400 bg-gold-400/10' : 'border-line-soft hover:border-gold-700'}`}
            >
              <Trophy design={d.design} tier={tier} size={44} />
            </button>
          ))}
        </div>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">
            <Award className="size-4" /> Award
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Progress toward the next tier of every achievement (your own profile only). */
function Progress() {
  const { narco } = useHub();
  const stats = useMyAchievementStats();
  if (!stats) return null;
  return (
    <Panel title="Achievements">
      <ul className="grid gap-3 sm:grid-cols-2">
        {achievementsFor(narco).map((a) => {
          const v = stats[a.stat];
          const t: number = tierFor(a, v);
          const next = t < 4 ? (a.at as readonly number[])[t]! : null;
          const prev = t ? a.at[t - 1]! : 0;
          const pct = next ? Math.min(100, ((v - prev) / (next - prev)) * 100) : 100;
          return (
            <li key={a.id} className="flex items-center gap-3">
              <div className={t ? '' : 'opacity-30 grayscale'}>
                <Trophy design={a.design} tier={(t || 1) as Tier} size={40} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex justify-between text-sm">
                  <b className="text-gold-100">
                    {a.name} {t ? TIERS[t - 1]!.roman : ''}
                  </b>
                  <span className="font-mono text-xs text-smoke">
                    {v.toLocaleString()}
                    {next ? ` / ${next.toLocaleString()}` : ' · maxed'}
                  </span>
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-raised">
                  <div className="h-full bg-gradient-to-r from-gold-600 to-gold-300" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-0.5 text-[11px] text-smoke">{next ? `${(next - v).toLocaleString()} more ${a.unit} to ${(TIERS as readonly { name: string }[])[t]!.name}` : `Top tier for ${a.unit}`}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** The keepsake cabinet on a member's profile. */
export function Cabinet({ member }: { member: Member }) {
  const { me, can, narco } = useHub();
  const { cabinet, trophies, save, ready } = useCabinet(member.id);
  const items = useItemTypes();
  const [editing, setEditing] = useState<number | null>(null);
  const [awarding, setAwarding] = useState(false);
  const mine = member.id === me.id;
  if (!ready) return null;
  const byId = new Map(trophies.map((t) => [t.id, t]));
  const placed = new Set(Object.values(cabinet.slots).map((s) => s.trophyId).filter(Boolean));
  const unplaced = trophies.filter((t) => !placed.has(t.id));
  const n = Math.max(1, Math.min(24, cabinet.pedestals));
  const per = 4;
  const shelves = Array.from({ length: Math.ceil(n / per) }, (_, s) => Array.from({ length: Math.min(per, n - s * per) }, (_, i) => s * per + i));
  const firstEmpty = Array.from({ length: n }, (_, i) => i).find((i) => !cabinet.slots[String(i)]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="foil font-display text-2xl font-bold">Trophy Wall</h2>
        <div className="flex flex-wrap items-center gap-2">
          {mine && (
            <span className="flex items-center gap-1 text-sm text-smoke">
              Pedestals
              <button className="btn-ghost btn-sm px-2" onClick={() => save({ pedestals: Math.max(1, n - 1) })} disabled={n <= 1} aria-label="Fewer pedestals">
                <Minus className="size-3" />
              </button>
              <span className="w-6 text-center font-mono text-gold-100">{n}</span>
              <button className="btn-ghost btn-sm px-2" onClick={() => save({ pedestals: Math.min(24, n + 1) })} disabled={n >= 24} aria-label="More pedestals">
                <Plus className="size-3" />
              </button>
            </span>
          )}
          {!mine && can('awardTrophies') && (
            <button className="btn-gold btn-sm" onClick={() => setAwarding(true)}>
              <Award className="size-3.5" /> Award a trophy
            </button>
          )}
        </div>
      </div>

      <div className="cabinet">
        <div className="cabinet-inner">
          {shelves.map((row, si) => (
            <div key={si} className="shelf" style={{ ['--per' as string]: per }}>
              {row.map((i) => {
                const raw = cabinet.slots[String(i)];
                // Drugs on a pedestal, or a narcotics trophy, stay hidden from anyone without the Narco role.
                const p = raw && !narco && ((raw.kind === 'item' && raw.itemTypeId?.startsWith('drug:')) || (raw.kind === 'trophy' && !trophies.some((t) => t.id === raw.trophyId))) ? undefined : raw;
                const trophy = p?.trophyId ? byId.get(p.trophyId) : undefined;
                return (
                  <div
                    key={i}
                    className={`pedestal ${mine ? 'editable' : ''}`}
                    onClick={() => mine && setEditing(i)}
                    title={trophy?.note ?? p?.label}
                    role={mine ? 'button' : undefined}
                  >
                    <div className="stage">{p ? <Showpiece p={p} trophy={trophy} items={items} /> : mine ? <div className="empty-slot">+</div> : null}</div>
                    <div className="plinth">{p?.label ? <span className="plaque">{p.label}</span> : null}</div>
                    <div className="caption">
                      {p ? (
                        <>
                          <b>{captionFor(p, trophy, items)}</b>
                          {trophy?.kind === 'award' && <span>from {trophy.byName}</span>}
                          {trophy?.kind === 'achievement' && <span>{trophy.note}</span>}
                        </>
                      ) : (
                        <span className="opacity-40">{mine ? 'Empty' : ''}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {unplaced.length > 0 && (
        <Panel title={mine ? `Trophies not on display · ${unplaced.length}` : `More trophies · ${unplaced.length}`}>
          <div className="flex flex-wrap gap-3">
            {unplaced.map((t) => (
              <button
                key={t.id}
                className={`flex w-24 flex-col items-center text-center ${mine && firstEmpty !== undefined ? 'cursor-pointer hover:opacity-90' : 'cursor-default'}`}
                title={mine ? 'Put it on the first empty pedestal' : t.note}
                onClick={() => {
                  if (!mine || firstEmpty === undefined) return;
                  save({ slots: { ...cabinet.slots, [String(firstEmpty)]: { kind: 'trophy', trophyId: t.id } } });
                }}
              >
                <Trophy design={t.design} tier={t.tier} size={56} />
                <span className="mt-1 text-[11px] leading-tight text-ash">{t.title}</span>
                <span className="text-[10px] text-smoke">{t.kind === 'award' ? `from ${t.byName}` : fmtDate(t.at)}</span>
              </button>
            ))}
          </div>
          {mine && <p className="mt-3 text-xs text-smoke">Tap one to put it on the first empty pedestal, or tap a pedestal to choose.</p>}
        </Panel>
      )}

      {mine && <Progress />}
      {editing !== null && <PedestalEditor memberId={member.id} index={editing} current={cabinet.slots[String(editing)]} trophies={trophies} onClose={() => setEditing(null)} />}
      {awarding && <AwardDialog member={member} onClose={() => setAwarding(false)} />}
    </div>
  );
}

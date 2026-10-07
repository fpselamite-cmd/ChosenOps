import { collection, query, Timestamp, where } from 'firebase/firestore';
import { ImagePlus, Send, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { addEvent, blankLore, blankNote, LORE_KINDS, removeLore, removeNote, saveLore, saveNote, SPINES, submitStory, type DinnerNote, type Lore, type LoreKind } from '../../lib/archives';
import type { DuesPay, DuesWeek } from '../../lib/books';
import { db } from '../../lib/firebase';
import { shrinkImage } from '../../lib/image';
import type { Rival } from '../../lib/rivals';
import type { RepTransfer } from '../../lib/types';
import { useWelcomeAccess } from '../welcome/useWelcome';

type Att = 'present' | 'excused' | 'absent';
const NEXT: Record<Att | 'none', Att | 'none'> = { none: 'present', present: 'excused', excused: 'absent', absent: 'none' };

/** Who was at a dinner, worked out from that night's dues: paid = at the table. */
function useAutoAttendance(date: string) {
  const week = useDoc<DuesWeek>(`duesWeeks/${date}`);
  const payQ = useMemo(() => query(collection(db, 'duesPay'), where('week', '==', date)), [date]);
  const pays = useCollection<DuesPay>(payQ) ?? [];
  const repQ = useMemo(() => query(collection(db, 'repTransfers'), where('dues', '==', date)), [date]);
  const reps = useCollection<RepTransfer & { dues?: string }>(repQ) ?? [];
  return useMemo(() => {
    if (!week) return null;
    const paid = new Set([...pays.filter((p) => p.status !== 'rejected').map((p) => p.memberId), ...reps.filter((r) => r.status !== 'rejected').map((r) => r.memberId)]);
    const excused = Object.entries(week.excused ?? {}).filter(([, v]) => v).map(([k]) => k);
    const expected = Object.keys(week.owe ?? {});
    const present = expected.filter((id) => paid.has(id) && !excused.includes(id));
    return { present, excused, absent: expected.filter((id) => !present.includes(id) && !excused.includes(id)) };
  }, [week, pays, reps]);
}

/** Promotions and blood-ins in the week up to the dinner, from the family news. */
function useWeekRanks(date: string) {
  const { memberById, rankById } = useHub();
  const end = new Date(`${date}T23:59:59Z`).getTime() + 86400e3;
  const q = useMemo(() => query(collection(db, 'news'), where('at', '>=', Timestamp.fromMillis(end - 8 * 86400e3))), [end]);
  const news = useCollection<{ id: string; kind: 'joined' | 'promoted'; memberId: string; rankId: string; at?: Timestamp }>(q) ?? [];
  return news
    .filter((n) => (n.at?.toMillis() ?? 0) <= end)
    .map((n) => ({ memberId: n.memberId, name: memberById.get(n.memberId)?.name ?? 'Someone', rankName: rankById.get(n.rankId)?.name ?? n.rankId, kind: n.kind }));
}

export function NoteEditor({ note, onClose }: { note: DinnerNote | null; onClose: () => void }) {
  const { me, roster } = useHub();
  const { assocRank } = useWelcomeAccess();
  const lastWeek = useCollection<DuesWeek>('duesWeeks') ?? [];
  const latest = lastWeek.map((w) => w.id).sort().pop() ?? new Date().toISOString().slice(0, 10);
  const [n, setN] = useState<Omit<DinnerNote, 'id' | 'by' | 'byName' | 'at'>>(note ?? blankNote(latest));
  const [touched, setTouched] = useState(!!note);
  const auto = useAutoAttendance(n.date);
  const ranks = useWeekRanks(n.date);
  // A new note starts from the dues table and the week's rank changes, until edited by hand.
  useEffect(() => {
    if (touched || !auto) return;
    setN((x) => ({ ...x, ...auto }));
  }, [auto, touched]);
  useEffect(() => {
    if (note || !lastWeek.length || touched) return;
    setN((x) => (x.date === latest ? x : { ...x, date: latest }));
  }, [latest, note, lastWeek.length, touched]);
  const ranksKey = JSON.stringify(ranks);
  useEffect(() => {
    if (!note) setN((x) => ({ ...x, ranks: JSON.parse(ranksKey) }));
  }, [ranksKey, note]);
  const people = roster.filter((m) => !(assocRank && m.rankId === assocRank.id));
  const stateOf = (id: string): Att | 'none' => (n.present.includes(id) ? 'present' : n.excused.includes(id) ? 'excused' : n.absent.includes(id) ? 'absent' : 'none');
  const cycle = (id: string) => {
    setTouched(true);
    const to = NEXT[stateOf(id)];
    const strip = (l: string[]) => l.filter((x) => x !== id);
    setN({ ...n, present: to === 'present' ? [...strip(n.present), id] : strip(n.present), excused: to === 'excused' ? [...strip(n.excused), id] : strip(n.excused), absent: to === 'absent' ? [...strip(n.absent), id] : strip(n.absent) });
  };
  const area = (k: 'topics' | 'decisions' | 'announcements' | 'minutes', label: string, ph: string, rows = 4) => (
    <Field label={label}>
      <textarea className="input text-sm" rows={rows} value={n[k]} maxLength={8000} placeholder={ph} onChange={(e) => setN({ ...n, [k]: e.target.value })} />
    </Field>
  );
  const go = async (publish: boolean) => {
    await saveNote(me, n, publish);
    onClose();
  };
  return (
    <Modal title={note ? 'Edit dinner notes' : 'Dinner notes'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
          <Field label="Dinner date">
            <input type="date" className="input" value={n.date} disabled={!!note} onChange={(e) => (setTouched(false), setN({ ...n, date: e.target.value }))} />
          </Field>
          <Field label="Title">
            <input className="input" value={n.title} maxLength={80} onChange={(e) => setN({ ...n, title: e.target.value })} />
          </Field>
        </div>
        <Field label="At the table (tap: present → excused → absent)" hint={auto ? 'Filled in from that night’s dues. Change anything.' : 'No dues table for this date; tick people by hand.'}>
          <div className="flex flex-wrap gap-1.5">
            {people.map((m) => {
              const s = stateOf(m.id);
              return (
                <button type="button" key={m.id} onClick={() => cycle(m.id)} className={`chip px-2.5 py-1 text-xs ${s === 'present' ? 'border-ok bg-ok/15 text-ok' : s === 'excused' ? 'border-sky-400 text-sky-300' : s === 'absent' ? 'border-red-400/70 text-red-300 line-through' : 'text-smoke'}`}>
                  {m.name}
                </button>
              );
            })}
          </div>
        </Field>
        <div className="grid gap-4 lg:grid-cols-2">
          {area('topics', 'What was said', 'The Don opened with the matter of the Ballas…')}
          {area('decisions', 'Decided', 'War on the Ballas.\n\nDues rise for soldiers.')}
          {area('announcements', 'Announced', 'Blacksite Friday 9PM…', 3)}
          <div className="space-y-2">
            <Field label="Quote of the night">
              <input className="input text-sm" value={n.quote} maxLength={200} onChange={(e) => setN({ ...n, quote: e.target.value })} />
            </Field>
            <Field label="Said by">
              <input className="input text-sm" value={n.quoteBy} maxLength={40} onChange={(e) => setN({ ...n, quoteBy: e.target.value })} />
            </Field>
          </div>
        </div>
        {area('minutes', 'The minutes (free write, optional)', 'Anything else, in your own words…', 6)}
        {!!n.ranks.length && (
          <Field label="Blooded in & promoted that week">
            <ul className="flex flex-wrap gap-1.5">
              {n.ranks.map((r, i) => (
                <li key={i} className="chip flex items-center gap-1 px-2 py-0.5 text-xs">
                  {r.name} → {r.rankName}
                  <button onClick={() => setN({ ...n, ranks: n.ranks.filter((_, k) => k !== i) })} aria-label="Remove">
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </Field>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {note && (
            <button className="mr-auto text-xs text-smoke hover:text-red-300" onClick={() => confirm('Delete these dinner notes?') && removeNote(note.id).then(onClose)}>
              Delete
            </button>
          )}
          <button className="btn-ghost" onClick={() => go(false)}>
            Save draft
          </button>
          <button className="btn-gold" onClick={() => go(true)}>
            {note?.status === 'published' ? 'Save' : 'Publish to the Archives'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Photos({ images, set }: { images: string[]; set: (i: string[]) => void }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {images.map((src, i) => (
        <div key={i} className="relative">
          <img src={src} alt="" className="h-20 w-28 border border-line object-cover" />
          <button className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5 text-white" onClick={() => set(images.filter((_, k) => k !== i))} aria-label="Remove">
            <X className="size-3" />
          </button>
        </div>
      ))}
      {images.length < 4 && (
        <button type="button" className="grid h-20 w-28 place-items-center border border-dashed border-line text-smoke hover:text-gold-200" onClick={() => file.current?.click()}>
          <ImagePlus className="size-5" />
        </button>
      )}
      <input ref={file} type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && set([...images, await shrinkImage(e.target.files[0], 900, 0.7)])} />
    </div>
  );
}

export function LoreEditor({ lore, kind = 'chapter', memberId, gangId, onClose }: { lore: Lore | null; kind?: LoreKind; memberId?: string; gangId?: string; onClose: () => void }) {
  const { me, roster } = useHub();
  const gangs = useCollection<Rival>('rivals') ?? [];
  const [l, setL] = useState<Omit<Lore, 'id' | 'by' | 'byName' | 'at'>>(lore ?? { ...blankLore(kind), memberId: memberId ?? null, gangId: gangId ?? null });
  const go = async (publish: boolean) => {
    if (!l.title.trim()) return;
    await saveLore(me, lore?.id ?? null, l, publish);
    onClose();
  };
  return (
    <Modal title={lore ? `Edit · ${lore.title}` : 'Write for the Archives'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What it is">
            <select className="input" value={l.kind} onChange={(e) => setL({ ...l, kind: e.target.value as LoreKind })}>
              {LORE_KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </Field>
          {l.kind === 'chapter' && (
            <Field label="Chapter number">
              <input className="input w-24 font-mono" inputMode="numeric" value={l.order || ''} onChange={(e) => setL({ ...l, order: Number(e.target.value.replace(/\D/g, '')) || 0 })} />
            </Field>
          )}
          {l.kind === 'character' && (
            <Field label="Whose page">
              <select className="input" value={l.memberId ?? ''} onChange={(e) => setL({ ...l, memberId: e.target.value || null })}>
                <option value="">Pick…</option>
                {roster.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {l.kind === 'war' && (
            <Field label="Which gang">
              <select className="input" value={l.gangId ?? ''} onChange={(e) => setL({ ...l, gangId: e.target.value || null })}>
                <option value="">Pick…</option>
                {gangs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {l.kind === 'story' && (
            <Field label="As told by">
              <input className="input" value={l.credit ?? ''} maxLength={40} onChange={(e) => setL({ ...l, credit: e.target.value })} />
            </Field>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Title">
            <input className="input" value={l.title} maxLength={80} onChange={(e) => setL({ ...l, title: e.target.value })} autoFocus />
          </Field>
          <Field label="Era / subtitle">
            <input className="input" value={l.era} maxLength={80} placeholder="The early days · 2025" onChange={(e) => setL({ ...l, era: e.target.value })} />
          </Field>
          <Field label="Spine">
            <div className="flex gap-1">
              {SPINES.map((c) => (
                <button key={c} type="button" onClick={() => setL({ ...l, color: c })} className={`h-9 w-4 rounded-sm ${l.color === c ? 'ring-2 ring-gold-300' : ''}`} style={{ background: c }} aria-label="Spine color" />
              ))}
            </div>
          </Field>
        </div>
        <Field label="The writing (blank line between paragraphs)">
          <textarea className="input min-h-72 font-serif text-[15px] leading-relaxed" value={l.body} maxLength={40000} onChange={(e) => setL({ ...l, body: e.target.value })} />
        </Field>
        <Field label="Photos (up to 4)">
          <Photos images={l.images} set={(images) => setL({ ...l, images })} />
        </Field>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {lore && (
            <button className="mr-auto flex items-center gap-1 text-xs text-smoke hover:text-red-300" onClick={() => confirm('Remove this from the Archives?') && removeLore(lore.id).then(onClose)}>
              <Trash2 className="size-3" /> Delete
            </button>
          )}
          <button className="btn-ghost" onClick={() => go(false)} disabled={!l.title.trim()}>
            Save draft
          </button>
          <button className="btn-gold" onClick={() => go(true)} disabled={!l.title.trim()}>
            {lore?.status === 'published' ? 'Save' : 'Publish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function SubmitStory({ onClose }: { onClose: () => void }) {
  const { me } = useHub();
  const [s, setS] = useState({ title: '', body: '', images: [] as string[] });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Send a story to the Archivist" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!s.title.trim() || !s.body.trim()) return;
          setBusy(true);
          await submitStory(me, { title: s.title.trim(), body: s.body.trim(), images: s.images });
          onClose();
        }}
      >
        <p className="text-sm text-ash">A night worth remembering, how something started, a legend about someone. The Archivist reads it and, if it fits, it goes in the book as told by you.</p>
        <Field label="Title">
          <input className="input" value={s.title} maxLength={80} onChange={(e) => setS({ ...s, title: e.target.value })} autoFocus required />
        </Field>
        <Field label="The story">
          <textarea className="input min-h-60 font-serif text-[15px] leading-relaxed" value={s.body} maxLength={40000} onChange={(e) => setS({ ...s, body: e.target.value })} required />
        </Field>
        <Field label="Photos (optional, up to 4)">
          <Photos images={s.images} set={(images) => setS({ ...s, images })} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            <Send className="size-4" /> Send it in
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function EventEditor({ onClose }: { onClose: () => void }) {
  const { me } = useHub();
  const [e, setE] = useState({ date: new Date().toISOString().slice(0, 10), title: '', note: '' });
  return (
    <Modal title="Add to the timeline" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (ev) => {
          ev.preventDefault();
          if (!e.title.trim()) return;
          await addEvent(me, e);
          onClose();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
          <Field label="Date">
            <input type="date" className="input" value={e.date} onChange={(x) => setE({ ...e, date: x.target.value })} required />
          </Field>
          <Field label="What happened">
            <input className="input" value={e.title} maxLength={80} onChange={(x) => setE({ ...e, title: x.target.value })} autoFocus required />
          </Field>
        </div>
        <Field label="A line more (optional)">
          <input className="input" value={e.note} maxLength={300} onChange={(x) => setE({ ...e, note: x.target.value })} />
        </Field>
        <div className="flex justify-end">
          <button className="btn-gold">Add it</button>
        </div>
      </form>
    </Modal>
  );
}

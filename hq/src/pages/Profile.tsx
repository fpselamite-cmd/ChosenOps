import { collection, query, where } from 'firebase/firestore';
import { toPng } from 'html-to-image';
import {
  ArrowLeft,
  Camera,
  Crosshair,
  Crown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Lock,
  Music,
  NotebookPen,
  Feather,
  Pencil,
  Plane,
  Plus,
  Printer,
  Save,
  Share2,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { CrewChip, RankBadge } from '../components/Badges';
import { Cabinet } from '../components/Cabinet';
import { FamilyCard, MiniFamilyCard } from '../components/FamilyCard';
import { ErrorText, Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { Panel, Tabs } from '../components/Page';
import { useCollection, useDoc } from '../hooks/useCollection';
import { VouchBar } from './welcome/VouchBar';
import { Badge, FancyName, Framed, TitleTag } from '../components/HonorArt';
import { useHonors } from './honors/useHonors';
import { Vault } from './honors/Vault';
import { useHub } from '../hooks/useHub';
import { AuthError, changePin } from '../lib/auth';
import { records, type Blacksite } from '../lib/blacksites';
import { monthKey, ranked, useBoards } from '../lib/boards';
import { useCabinet } from '../lib/cabinet';
import { db } from '../lib/firebase';
import { ago, fmtDate } from '../lib/format';
import { squareImage } from '../lib/image';
import { setPresenceStatus, updateProfile } from '../lib/members';
import { NOELOPS_URL, noelStatKey, useNoel, type NoelCrewMember } from '../lib/noelops';
import {
  addEntry,
  addNote,
  BASICS,
  CITY,
  editEntry,
  LONG_STORY,
  LOOKS,
  NOTE_KINDS,
  react,
  REACTIONS,
  RELATION_KINDS,
  removeEntry,
  removeNote,
  saveSheet,
  SKILL_GROUPS,
  songEmbed,
  STORY,
  type JournalEntry,
  type LeaderNote,
  type NoteKind,
  type Relation,
  type Sheet,
} from '../lib/sheet';
import { keyOf } from '../lib/calendar';
import { setLoa, useStreak } from '../lib/streak';
import { markPast, PAST_KINDS, restoreMember, type Past, type PastKind } from '../lib/hall';
import { PRESENCE_STATUSES, type Member, type RepTransfer } from '../lib/types';
import { KitCard } from '../components/Kit';
import { RoleChips } from '../components/RoleChips';
import type { DuesPay } from '../lib/books';
import { lifetime } from './money/duesCalc';

const BMONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;

// ---------- small pieces ----------

/** 0–5 gold stars, tap to set when editing. */
function Stars({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(value === i ? i - 1 : i)}
          className={onChange ? 'cursor-pointer' : 'cursor-default'}
          aria-label={`${i} star${i === 1 ? '' : 's'}`}
        >
          <Star className={`size-4 ${i <= value ? 'fill-gold-300 text-gold-300 drop-shadow-[0_0_4px_rgb(var(--acc-hi)/0.7)]' : 'text-gold-800'}`} />
        </button>
      ))}
    </span>
  );
}

/** One labelled line on the sheet: text when reading, an input when editing. */
function Line({ label, value, edit, onChange, long, mono, max = 80 }: { label: string; value?: string; edit: boolean; onChange: (v: string) => void; long?: boolean; mono?: boolean; max?: number }) {
  if (edit)
    return (
      <label className={`block ${long ? 'sm:col-span-2' : ''}`}>
        <span className="label">{label}</span>
        {long ? (
          <textarea className="input mt-1 min-h-24" value={value ?? ''} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <input className={`input mt-1 ${mono ? 'font-mono' : ''}`} value={value ?? ''} maxLength={max} onChange={(e) => onChange(e.target.value)} />
        )}
      </label>
    );
  return (
    <div className={long ? 'sm:col-span-2' : ''}>
      <dt className="label">{label}</dt>
      <dd className={`mt-0.5 ${long ? 'whitespace-pre-line text-ash' : 'text-gold-100'} ${mono ? 'font-mono' : ''}`}>{value?.trim() ? value : <span className="text-smoke">—</span>}</dd>
    </div>
  );
}

function Box({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <Panel title={title} right={right}>
      {children}
    </Panel>
  );
}

// ---------- the locked stat block ----------

function useStats(m: Member) {
  const boards = useBoards();
  const sites = useCollection<Blacksite>('blacksites');
  const petty = useDoc<{ rep?: number }>(`petty/${m.id}`);
  const tq = useMemo(() => query(collection(db, 'repTransfers'), where('memberId', '==', m.id)), [m.id]);
  const transfers = useCollection<{ amount: number; status: string }>(tq);
  const { trophies } = useCabinet(m.id);
  return useMemo(() => {
    let sales = 0;
    let bricks = 0;
    let best = 0;
    boards.months.forEach((b) => {
      sales += b.sales?.[m.id] ?? 0;
      bricks += b.bricks?.[m.id] ?? 0;
      (['sales', 'bricks'] as const).forEach((k) => {
        const place = ranked(b, k).find((r) => r.memberId === m.id)?.place;
        if (place && (!best || place < best)) best = place;
      });
    });
    const month = boards.byId.get(monthKey())?.sales?.[m.id] ?? 0;
    const r = records(sites ?? []).get(m.id);
    const sent = (transfers ?? []).filter((t) => t.status === 'confirmed').reduce((s, t) => s + (t.amount ?? 0), 0);
    const days = m.joinedAt ? Math.max(0, Math.floor((Date.now() - m.joinedAt.toMillis()) / 86400e3)) : 0;
    return {
      Money: [
        ['Lifetime sales', money(sales)],
        ['This month', money(month)],
        ['Bricks pressed', bricks.toLocaleString('en-US')],
      ],
      War: [
        ['Blacksites', r?.fights ?? 0],
        ['Wins', r?.wins ?? 0],
        ['Kills', r?.kills ?? 0],
        ['Downs', r?.downs ?? 0],
        ['K/D', r ? (r.kills / Math.max(1, r.downs)).toFixed(1) : '—'],
        ['MVPs', r?.mvps ?? 0],
      ],
      Street: [
        ['Petty rep', (petty?.rep ?? 0).toLocaleString('en-US')],
        ['Rep sent to family', sent.toLocaleString('en-US')],
      ],
      Standing: [
        ['Days in the family', days],
        ['Trophies', trophies.length],
        ['Best finish', best ? `#${best}` : '—'],
      ],
    } as Record<string, [string, string | number][]>;
  }, [boards, sites, petty, transfers, trophies, m.id, m.joinedAt]);
}

function StatBlock({ m }: { m: Member }) {
  const stats = { ...useStats(m), NoelOps: useNoelOpsStats(m.name) };
  const links: Record<string, ReactNode> = {
    War: (
      <Link to="/blacksites" className="text-smoke hover:text-gold-300" title="Blacksites">
        <Crosshair className="size-3" />
      </Link>
    ),
    NoelOps: (
      <a href={NOELOPS_URL} target="_blank" rel="noopener" className="text-smoke hover:text-gold-300" title="Open NoelOps">
        <ExternalLink className="size-3" />
      </a>
    ),
  };
  return (
    <Box
      title={
        <span className="inline-flex items-center gap-1.5">
          <Lock className="size-3.5" /> Record
        </span>
      }
      right={<span className="text-[10px] text-smoke">kept by the HQ</span>}
    >
      <div className="space-y-3">
        {Object.entries(stats).map(([group, rows]) => (
          <div key={group}>
            <p className="label mb-1 flex items-center gap-1.5 text-gold-500">
              {group} {links[group]}
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {rows.map(([l, v]) => (
                <div key={l} className="flex items-baseline justify-between gap-2 border-b border-line-soft py-0.5 text-sm">
                  <span className="text-smoke">{l}</span>
                  <span className="font-mono text-gold-100">{v}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Box>
  );
}

/** The headline numbers, for the strip under the name. */
function Glance({ m }: { m: Member }) {
  const st = useStats(m);
  const v = (g: string, l: string) => st[g]?.find(([x]) => x === l)?.[1] ?? 0;
  // Lifetime giving to the family: dinner dues cash, and all rep sent in.
  const pays = useCollection<DuesPay>('duesPay') ?? [];
  const transfers = useCollection<RepTransfer>('repTransfers') ?? [];
  const given = lifetime(m.id, transfers, pays);
  const tiles: [string, string | number][] = [
    ['This month', v('Money', 'This month')],
    ['Lifetime sales', v('Money', 'Lifetime sales')],
    ['Bricks', v('Money', 'Bricks pressed')],
    ['Blacksites', `${v('War', 'Wins')}W · ${v('War', 'Blacksites')}`],
    ['Kills', v('War', 'Kills')],
    ['Petty rep', v('Street', 'Petty rep')],
    ['Days in', v('Standing', 'Days in the family')],
    ['Trophies', v('Standing', 'Trophies')],
    ['Given', `${money(given.clean + given.dirty)} · ${given.rep.toLocaleString()}r`],
  ];
  return (
    <div className="grid grid-cols-3 gap-px border-t border-line-soft bg-line-soft sm:grid-cols-9">
      {tiles.map(([l, x]) => (
        <div key={l} className="bg-panel px-2 py-2.5 text-center">
          <p className="truncate font-mono text-sm text-gold-100 sm:text-base">{x}</p>
          <p className="label truncate text-[9px]">{l}</p>
        </div>
      ))}
    </div>
  );
}

// ---------- header ----------

function WantedPoster({ m, w }: { m: Member; w: NonNullable<Sheet['wanted']> }) {
  return (
    <div className="wanted w-44 shrink-0 rotate-[-2deg] p-3 text-center">
      <p className="font-display text-3xl font-black tracking-widest">WANTED</p>
      <p className="text-[10px] font-bold tracking-[0.3em]">DEAD OR ALIVE</p>
      <div className="my-2 overflow-hidden border-2 border-[#3b2a14]">
        {m.avatar ? <img src={m.avatar} alt={m.name} className="aspect-square w-full object-cover sepia" /> : <div className="grid aspect-square place-items-center text-4xl">?</div>}
      </div>
      <p className="truncate font-display text-lg font-bold">{m.name}</p>
      {w.crime && <p className="text-[11px] leading-tight italic">for {w.crime}</p>}
      <p className="mt-1 font-display text-xl font-black">{money(w.bounty || 0)}</p>
      <p className="text-[10px] font-bold tracking-[0.3em]">REWARD</p>
    </div>
  );
}

function SongButton({ url }: { url?: string }) {
  const [open, setOpen] = useState(false);
  const e = songEmbed(url);
  if (!url) return null;
  if (!e)
    return (
      <a href={url} target="_blank" rel="noopener" className="btn-ghost btn-sm">
        <Music className="size-3.5" /> Theme song
      </a>
    );
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(!open)}>
        <Music className="size-3.5" /> {open ? 'Stop' : 'Theme song'}
      </button>
      {open && (
        <div className="fixed right-4 bottom-24 z-40 w-80 border border-line bg-coal p-1 shadow-2xl lg:bottom-6">
          <iframe title="Theme song" src={e.src} className="w-full" height={e.kind === 'spotify' ? 152 : 180} allow="autoplay; encrypted-media; clipboard-write" loading="lazy" />
        </div>
      )}
    </>
  );
}

function ShareMenu({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const flash = (t: string) => {
    setMsg(t);
    setTimeout(() => setMsg(''), 2000);
  };
  const item = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ash hover:bg-white/5 hover:text-gold-200';
  return (
    <div className="no-print relative">
      <button className="btn-ghost btn-sm" onClick={() => setOpen(!open)}>
        <Share2 className="size-3.5" /> {msg || 'Share'}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-48 border border-line bg-coal py-1 shadow-xl" onMouseLeave={() => setOpen(false)}>
          <button
            className={item}
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href).then(() => flash('Link copied'));
              setOpen(false);
            }}
          >
            <Link2 className="size-4" /> Copy link
          </button>
          <button
            className={item}
            onClick={async () => {
              setOpen(false);
              if (!target.current) return;
              flash('Saving…');
              const url = await toPng(target.current, {
                pixelRatio: 2,
                backgroundColor: '#070605',
                filter: (n) => !(n instanceof HTMLElement && n.classList.contains('no-print')),
              });
              const a = document.createElement('a');
              a.href = url;
              a.download = 'character-sheet.png';
              a.click();
            }}
          >
            <Download className="size-4" /> Save as image
          </button>
          <button
            className={item}
            onClick={() => {
              setOpen(false);
              setTimeout(() => window.print(), 50);
            }}
          >
            <Printer className="size-4" /> Print
          </button>
        </div>
      )}
    </div>
  );
}

export function MoodPicker({ id, status }: { id: string; status?: string }) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  return (
    <span className="no-print relative">
      <button className="text-xs text-gold-300 hover:underline" onClick={() => setOpen(!open)}>
        {status ? 'change mood' : 'set your mood'}
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 border border-line bg-coal p-3 text-left shadow-xl">
          <div className="flex flex-wrap gap-1.5">
            {PRESENCE_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => (setPresenceStatus(id, s === status ? '' : s), setOpen(false))}
                className={`chip px-2.5 py-1 text-xs ${s === status ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPresenceStatus(id, custom.trim().slice(0, 24));
              setCustom('');
              setOpen(false);
            }}
          >
            <input className="input py-1 text-sm" placeholder="😎 Or type your own" maxLength={24} value={custom} onChange={(e) => setCustom(e.target.value)} />
            <button className="btn-ghost btn-sm">Set</button>
          </form>
        </div>
      )}
    </span>
  );
}

// ---------- journal ----------

function EntryForm({ memberId, entry, onClose }: { memberId: string; entry?: JournalEntry; onClose: () => void }) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [text, setText] = useState(entry?.text ?? '');
  const [pub, setPub] = useState(entry?.public ?? false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const d = { title: title.trim().slice(0, 80), text: text.trim().slice(0, 4000), public: pub };
    if (entry) await editEntry(entry.id, d);
    else await addEntry(memberId, d);
    onClose();
  }
  return (
    <Modal title={entry ? 'Edit entry' : 'New journal entry'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="e.g. The night at the docks" autoFocus />
        </Field>
        <Field label="Entry">
          <textarea className="input min-h-48" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} />
        </Field>
        <button type="button" onClick={() => setPub(!pub)} className={`chip px-3 py-1.5 text-xs ${pub ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
          {pub ? <Eye className="mr-1 inline size-3.5" /> : <EyeOff className="mr-1 inline size-3.5" />}
          {pub ? 'Shared with the family' : 'Private (only you)'}
        </button>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function Journal({ m, mine }: { m: Member; mine: boolean }) {
  const { me, memberById } = useHub();
  const q = useMemo(
    () => (mine ? query(collection(db, 'journal'), where('memberId', '==', m.id)) : query(collection(db, 'journal'), where('memberId', '==', m.id), where('public', '==', true))),
    [m.id, mine],
  );
  const entries = (useCollection<JournalEntry>(q) ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const [form, setForm] = useState<{ entry?: JournalEntry } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Box
      title={
        <span className="inline-flex items-center gap-1.5">
          <NotebookPen className="size-3.5" /> Journal
        </span>
      }
      right={
        mine && (
          <button className="btn-ghost btn-sm no-print" onClick={() => setForm({})}>
            <Plus className="size-3.5" /> New entry
          </button>
        )
      }
    >
      {!entries.length ? (
        <p className="text-sm text-smoke">{mine ? 'Nothing written yet. Entries are private unless you share them.' : 'No shared entries yet.'}</p>
      ) : (
        <ul className="space-y-4">
          {entries.map((e) => {
            const counts = Object.values(e.reactions ?? {}).reduce<Record<string, number>>((c, x) => ((c[x] = (c[x] ?? 0) + 1), c), {});
            const myR = e.reactions?.[me.id];
            const long = e.text.length > 280 && open !== e.id;
            return (
              <li key={e.id} className="border-l-2 border-gold-600/50 pl-3">
                <div className="flex flex-wrap items-baseline gap-2">
                  <p className="font-hud font-bold text-gold-100">{e.title || 'Untitled'}</p>
                  <span className="text-xs text-smoke">{e.at ? fmtDate(e.at) : 'just now'}</span>
                  {mine && <span className={`text-[10px] ${e.public ? 'text-gold-300' : 'text-smoke'}`}>{e.public ? '● shared' : '○ private'}</span>}
                  {mine && (
                    <span className="no-print ml-auto flex gap-1">
                      <button className="p-1 text-smoke hover:text-gold-200" onClick={() => setForm({ entry: e })} aria-label="Edit">
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="p-1 text-smoke hover:text-red-300" onClick={() => confirm('Delete this entry?') && removeEntry(e.id)} aria-label="Delete">
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm whitespace-pre-line text-ash">{long ? `${e.text.slice(0, 280)}…` : e.text}</p>
                {long && (
                  <button className="text-xs text-gold-300 hover:underline" onClick={() => setOpen(e.id)}>
                    Read more
                  </button>
                )}
                {e.public && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {REACTIONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => react(e.id, me.id, myR === r ? null : r)}
                        title={Object.entries(e.reactions ?? {})
                          .filter(([, x]) => x === r)
                          .map(([id]) => memberById.get(id)?.name ?? 'Someone')
                          .join(', ')}
                        className={`rounded-full border px-1.5 py-0.5 text-xs transition ${myR === r ? 'border-gold-400 bg-gold-400/15' : counts[r] ? 'border-line' : 'no-print border-transparent opacity-40 hover:opacity-100'}`}
                      >
                        {r}
                        {counts[r] ? <span className="ml-0.5 font-mono text-[10px] text-gold-200">{counts[r]}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {form && <EntryForm memberId={m.id} entry={form.entry} onClose={() => setForm(null)} />}
    </Box>
  );
}

// ---------- leadership notes ----------

function LeaderNotes({ m, mine }: { m: Member; mine: boolean }) {
  const { me, can } = useHub();
  const lead = can('manageMembers');
  const q = useMemo(() => query(collection(db, 'leaderNotes'), where('memberId', '==', m.id)), [m.id]);
  const notes = (useCollection<LeaderNote>(q, mine || lead) ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const [kind, setKind] = useState<NoteKind>('commendation');
  const [text, setText] = useState('');
  if (!mine && !lead) return null;
  return (
    <Box title="Leadership notes" right={<span className="text-[10px] text-smoke">{mine ? 'only leadership writes these' : `${m.name} can read these`}</span>}>
      {notes.length ? (
        <ul className="space-y-2">
          {notes.map((n) => {
            const k = NOTE_KINDS.find((x) => x.id === n.kind);
            return (
              <li key={n.id} className="flex gap-2 text-sm">
                <span className="mt-0.5 shrink-0 border px-1.5 py-0.5 text-[10px] font-bold uppercase" style={{ color: k?.color, borderColor: `${k?.color}66` }}>
                  {k?.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ash">{n.text}</span>
                  <span className="block text-xs text-smoke">
                    {n.byName} · {n.at ? fmtDate(n.at) : 'just now'}
                  </span>
                </span>
                {lead && !mine && (
                  <button className="no-print self-start p-1 text-smoke hover:text-red-300" onClick={() => confirm('Remove this note?') && removeNote(n.id)} aria-label="Remove">
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-smoke">Nothing on file.</p>
      )}
      {lead && !mine && (
        <form
          className="no-print mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addNote(m.id, me, kind, text.trim()).then(() => setText(''));
          }}
        >
          <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as NoteKind)}>
            {NOTE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <input className="input min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="What for?" />
          <button className="btn-gold btn-sm">Add</button>
        </form>
      )}
    </Box>
  );
}

// ---------- relationships ----------

function Relations({ relations, edit, onChange }: { relations: Relation[]; edit: boolean; onChange: (r: Relation[]) => void }) {
  const { roster, memberById } = useHub();
  const upd = (i: number, patch: Partial<Relation>) => onChange(relations.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <Box
      title={
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" /> Relationships
        </span>
      }
    >
      {edit ? (
        <div className="space-y-3">
          {relations.map((r, i) => (
            <div key={i} className="grid gap-2 border-b border-line-soft pb-3 sm:grid-cols-[1fr_140px_auto]">
              <select
                className="input"
                value={r.memberId ?? ''}
                onChange={(e) => upd(i, { memberId: e.target.value || null, name: e.target.value ? (memberById.get(e.target.value)?.name ?? '') : '' })}
              >
                <option value="">Someone outside the family…</option>
                {roster.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <select className="input" value={r.kind} onChange={(e) => upd(i, { kind: e.target.value })}>
                {RELATION_KINDS.map((k) => (
                  <option key={k}>{k}</option>
                ))}
              </select>
              <button onClick={() => onChange(relations.filter((_, j) => j !== i))} aria-label="Remove" className="justify-self-end">
                <X className="size-4 text-smoke" />
              </button>
              {!r.memberId && <input className="input sm:col-span-3" placeholder="Their name" maxLength={40} value={r.name} onChange={(e) => upd(i, { name: e.target.value })} />}
              <input className="input sm:col-span-3" placeholder="A note (optional)" maxLength={140} value={r.note} onChange={(e) => upd(i, { note: e.target.value })} />
            </div>
          ))}
          <button className="text-xs text-gold-300 hover:underline" onClick={() => onChange([...relations, { memberId: null, name: '', kind: RELATION_KINDS[0]!, note: '' }])}>
            + Add someone
          </button>
        </div>
      ) : relations.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {relations.map((r, i) => {
            const mem = r.memberId ? memberById.get(r.memberId) : undefined;
            const inner = (
              <>
                {mem ? <Avatar member={mem} size="sm" /> : <span className="grid size-8 shrink-0 place-items-center rounded-full border border-line text-[10px] text-smoke">NPC</span>}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-gold-100">{mem?.name ?? r.name}</span>
                  <span className="text-xs text-gold-500">{r.kind}</span>
                  {r.note && <span className="block text-xs text-smoke">{r.note}</span>}
                </span>
              </>
            );
            return (
              <li key={i}>
                {mem ? (
                  <Link to={`/members/${mem.id}`} className="flex items-center gap-2 border border-line-soft p-2 hover:bg-white/[0.02]">
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 border border-line-soft p-2">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-smoke">—</p>
      )}
    </Box>
  );
}

// ---------- the rest ----------

function ChangePin({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pin !== pin2) return setError("The new PINs don't match.");
    try {
      await changePin(cur, pin);
      setDone(true);
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not change your PIN.');
    }
  }
  const pinInput = (v: string, set: (s: string) => void, auto: string) => (
    <input className="input font-mono tracking-[0.4em]" type="password" inputMode="numeric" value={v} onChange={(e) => set(e.target.value.replace(/\D/g, ''))} autoComplete={auto} required />
  );
  return (
    <Modal title="Change PIN" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-ash">Done. Use your new PIN next time you sign in.</p>
          <button className="btn-gold" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Current PIN">{pinInput(cur, setCur, 'current-password')}</Field>
          <Field label="New PIN" hint="4 to 8 digits">
            {pinInput(pin, setPin, 'new-password')}
          </Field>
          <Field label="New PIN again">{pinInput(pin2, setPin2, 'new-password')}</Field>
          <ErrorText error={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold">Change PIN</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** What they've done in NoelOps (grows, cooks, runs), matched by name. Read live from NoelOps. */
function useNoelOpsStats(name: string) {
  const crew = useNoel<Record<string, NoelCrewMember>>('crew');
  const key = crew.data === undefined ? '' : noelStatKey(name, crew.data);
  const stats = useNoel<Record<string, unknown>>(`stats/${key}`, !!key);
  const titles = useNoel<Record<string, unknown>>(`titles/${key}`, !!key);
  const n = (f: string) => Math.max(0, Math.floor(Number(stats.data?.[f]) || 0));
  const rows: [string, string | number][] = [
    ['Harvests', n('harvests').toLocaleString('en-US')],
    ['Bud', n('bud').toLocaleString('en-US')],
    ['Bricks', n('bricks').toLocaleString('en-US')],
    ['Meth cooks', n('cooks').toLocaleString('en-US')],
    ['Coke runs', n('runs').toLocaleString('en-US')],
    ['Titles', titles.data ? Object.keys(titles.data).length : 0],
  ];
  return rows;
}

/** Admin: a leave of absence, so the days away don't break the member's login streak. */
function LoaDialog({ m, onClose }: { m: Member; onClose: () => void }) {
  const s = useStreak(m.id);
  const [from, setFrom] = useState(s?.loaFrom ?? keyOf(Date.now()));
  const [until, setUntil] = useState(s?.loaUntil ?? '');
  return (
    <Modal title={`Leave of absence · ${m.name}`} onClose={onClose} portal>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!from || !until || until < from) return;
          await setLoa(m.id, from, until);
          onClose();
        }}
      >
        <p className="text-sm text-ash">Days missed between these dates won’t break {m.name}’s login streak.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="Until">
            <input type="date" className="input" value={until} onChange={(e) => setUntil(e.target.value)} />
          </Field>
        </div>
        <div className="flex justify-between gap-2">
          {s?.loaUntil ? (
            <button type="button" className="btn-ghost" onClick={() => setLoa(m.id, null, null).then(onClose)}>
              End leave
            </button>
          ) : (
            <span />
          )}
          <button className="btn-gold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

/** Leadership: mark someone as a past member (deceased, retired, moved on, exiled). */
function PastDialog({ m, past, onClose }: { m: Member; past?: Past | null; onClose: () => void }) {
  const [kind, setKind] = useState<PastKind>(past?.kind ?? 'retired');
  const [day, setDay] = useState(past?.day ?? keyOf(Date.now()));
  const [epitaph, setEpitaph] = useState(past?.epitaph ?? '');
  return (
    <Modal title={`${m.name} · past member`} onClose={onClose} portal>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await markPast(m, { kind, day, epitaph: epitaph.trim() });
          onClose();
        }}
      >
        <p className="text-sm text-ash">They leave the roster and can’t sign in, but their sheet and records stay. They show in the Hall of Fame’s In Memoriam & Retired (exiled only to leadership).</p>
        <div className="grid grid-cols-2 gap-2">
          {PAST_KINDS.map((k) => (
            <button key={k.id} type="button" onClick={() => setKind(k.id)} className={`border p-2 text-left text-sm ${kind === k.id ? 'border-gold-400 bg-gold-400/10 text-gold-100' : 'border-line text-ash'}`}>
              {k.label}
              <span className="block text-[11px] text-smoke">{k.hint}</span>
            </button>
          ))}
        </div>
        <Field label="Date">
          <input type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
        </Field>
        <Field label="Epitaph" hint="A line for their plaque. Optional.">
          <input className="input" value={epitaph} onChange={(e) => setEpitaph(e.target.value)} maxLength={200} placeholder="e.g. Never left a man behind." />
        </Field>
        <div className="flex justify-between gap-2">
          {past ? (
            <button type="button" className="btn-ghost" onClick={() => restoreMember(m).then(onClose)}>
              Bring them back
            </button>
          ) : (
            <span />
          )}
          <button className="btn-gold">Save</button>
        </div>
      </form>
    </Modal>
  );
}

type Draft = Omit<Sheet, 'id'> & { alias: string; phone: string; bMonth: number; bDay: number };

export default function Profile() {
  const { id = '' } = useParams();
  const { memberById, rankById, crewsOf, me, isOnline, presence, roster, isAdmin, can } = useHub();
  const m = memberById.get(id);
  const sheet = useDoc<Sheet>(`sheets/${id}`);
  const past = useDoc<Past>(`pastMembers/${id}`);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [loaOpen, setLoaOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [traitInput, setTraitInput] = useState('');
  const [params, setParams] = useSearchParams();
  const { equipped } = useHonors();
  const worn = equipped(id);

  if (!m) return <Navigate to="/family" replace />;
  const mine = m.id === me.id;
  const crews = crewsOf(m.id);
  const boss = m.reportsTo ? memberById.get(m.reportsTo) : undefined;
  const reports = roster.filter((x) => x.reportsTo === m.id);
  const on = isOnline(m.id);
  const status = presence.get(m.id)?.status;
  const edit = !!draft;
  const asked = params.get('view');
  const view = edit ? 'sheet' : asked === 'trophies' || asked === 'journal' || asked === 'honors' ? asked : 'sheet';
  const s: Omit<Sheet, 'id'> = draft ?? sheet ?? {};
  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const setIn = (k: 'basics' | 'looks' | 'city' | 'story', key: string, v: string) => setDraft((d) => (d ? { ...d, [k]: { ...(d[k] ?? {}), [key]: v } } : d));

  function startEdit() {
    const { id: _ignore, ...rest } = sheet ?? { id: '' };
    void _ignore;
    setError(null);
    setDraft({
      ...rest,
      story: { ...(rest.story ?? {}), backstory: rest.story?.backstory || m!.bio || '' },
      alias: m!.alias ?? '',
      phone: m!.phone ?? '',
      bMonth: m!.birthday ? +m!.birthday.slice(0, 2) : 0,
      bDay: m!.birthday ? +m!.birthday.slice(3) : 0,
    });
  }
  async function save() {
    if (!draft) return;
    setSaving(true);
    const { alias, phone, bMonth, bDay, ...rest } = draft;
    const clean = JSON.parse(JSON.stringify(rest)) as Omit<Sheet, 'id'>;
    clean.traits = (clean.traits ?? []).filter(Boolean).slice(0, 16);
    clean.relations = (clean.relations ?? []).filter((r) => r.name.trim()).slice(0, 24);
    clean.customFields = (clean.customFields ?? []).filter((f) => f.label.trim()).slice(0, 16);
    clean.customSkills = (clean.customSkills ?? []).filter((f) => f.name.trim()).slice(0, 12);
    const birthday = bMonth && bDay ? `${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}` : null;
    try {
      await Promise.all([saveSheet(m!.id, clean), updateProfile(m!.id, { alias: alias.trim(), phone: phone.trim(), birthday })]);
      setDraft(null);
    } catch {
      setError('Couldn’t save the sheet. Check nothing is too long and try again.');
    } finally {
      setSaving(false);
    }
  }
  async function onAvatar(file?: File) {
    if (file) await updateProfile(m!.id, { avatar: await squareImage(file) });
  }
  const story: Record<string, string | undefined> = { ...(s.story ?? {}), backstory: s.story?.backstory || (!edit ? m.bio : '') || '' };
  const wanted = s.wanted;

  return (
    <>
      <div className="no-print mb-4">
        <Link to="/family" className="label inline-flex items-center gap-1.5 hover:text-gold-300">
          <ArrowLeft className="size-3.5" /> Family
        </Link>
      </div>
      <VouchBar m={m} />

      <div ref={sheetRef} className="space-y-6">
        {/* ---------- sheet header ---------- */}
        <section className="hud" style={worn.backdropHue ? { background: `radial-gradient(ellipse at 15% 20%, color-mix(in oklab, ${worn.backdropHue} 32%, transparent), transparent 65%), radial-gradient(ellipse at 90% 100%, color-mix(in oklab, ${worn.backdropHue} 16%, transparent), transparent 60%)` } : undefined}>
          <div className="scanlines flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:items-start sm:text-left">
            {wanted?.on && !edit ? (
              <WantedPoster m={m} w={wanted} />
            ) : (
              <div className="relative shrink-0">
                <Framed member={m} frame={worn.frame} size="xl" online={on} />
                {mine && (
                  <>
                    <button onClick={() => fileRef.current?.click()} className="no-print absolute right-0 bottom-0 rounded-full bg-gold-400 p-1.5 text-void shadow" title="Change picture">
                      <Camera className="size-4" />
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
                  </>
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="label text-gold-500">Character sheet</p>
              {past && (
                <p className="mb-1 text-xs tracking-widest text-smoke uppercase">
                  {past.kind === 'deceased' ? 'In memoriam' : past.kind === 'retired' ? 'Retired' : past.kind === 'moved' ? 'Moved on' : 'Exiled'} · {past.day}
                </p>
              )}
              <h1 className="font-display text-3xl font-bold sm:text-4xl">{worn.nameHue || worn.effect ? <FancyName name={m.name} hue={worn.nameHue} effect={worn.effect?.effect} /> : <span className="foil">{m.name}</span>}</h1>
              {worn.title && <TitleTag h={worn.title} className="mt-1" />}
              {!!worn.showcase.length && (
                <button className="mt-2 flex justify-center gap-1.5 sm:justify-start" onClick={() => setParams({ view: 'honors' }, { replace: true })} title="Vault of Honors">
                  {worn.showcase.map((h) => (
                    <Badge key={h.id} h={h} size={36} />
                  ))}
                </button>
              )}
              {edit ? (
                <input className="input mt-1 max-w-xs" placeholder="Alias / street name" value={draft!.alias} maxLength={30} onChange={(e) => set({ alias: e.target.value })} />
              ) : (
                m.alias && <p className="text-ash italic">“{m.alias}”</p>
              )}
              {s.story?.quote && !edit && <p className="mt-2 font-display text-lg text-gold-200 italic">“{s.story.quote}”</p>}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                <RankBadge rank={rankById.get(m.rankId ?? '')} />
                <RoleChips memberId={m.id} />
                {crews.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1">
                    {c.leaderId === m.id && <Crown className="size-3.5" style={{ color: c.color }} />}
                    <CrewChip crew={c} full />
                  </span>
                ))}
              </div>
              <p className="mt-2 text-sm text-smoke">
                {on ? <span className="text-ok">● {status || 'Online now'}</span> : status ? <>Mood: {status} · last seen {ago(presence.get(m.id)?.at)}</> : `Last seen ${ago(presence.get(m.id)?.at)}`}
                {mine && (
                  <>
                    {' '}
                    · <MoodPicker id={m.id} status={status} />
                  </>
                )}
                {m.joinedAt && <> · Joined {fmtDate(m.joinedAt)}</>}
              </p>
              {edit && (
                <div className="mt-4 grid gap-3 text-left sm:grid-cols-2">
                  <Field label="Theme song" hint="A YouTube or Spotify link">
                    <input className="input" value={draft!.song ?? ''} maxLength={300} onChange={(e) => set({ song: e.target.value })} placeholder="https://…" />
                  </Field>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 pt-5 text-sm text-ash">
                      <input type="checkbox" className="accent-gold-400" checked={!!draft!.wanted?.on} onChange={(e) => set({ wanted: { bounty: 0, crime: '', ...draft!.wanted, on: e.target.checked } })} />
                      Show my picture as a WANTED poster
                    </label>
                    {draft!.wanted?.on && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="input font-mono"
                          inputMode="numeric"
                          placeholder="Bounty $"
                          value={draft!.wanted.bounty || ''}
                          onChange={(e) => set({ wanted: { ...draft!.wanted!, bounty: Math.min(1e9, Math.round(+e.target.value.replace(/\D/g, '') || 0)) } })}
                        />
                        <input className="input" placeholder="Wanted for…" maxLength={60} value={draft!.wanted.crime} onChange={(e) => set({ wanted: { ...draft!.wanted!, crime: e.target.value } })} />
                      </div>
                    )}
                  </div>
                </div>
              )}
              <ErrorText error={error} />
            </div>
            {!edit && (
              <div className="no-print shrink-0 self-center">
                <MiniFamilyCard
                  member={m}
                  onOpen={() => {
                    setParams({}, { replace: true });
                    setTimeout(() => document.getElementById('family-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
                  }}
                />
              </div>
            )}
            <div className="no-print flex flex-wrap justify-center gap-2 sm:flex-col sm:items-end">
              {mine &&
                (edit ? (
                  <div className="flex gap-2">
                    <button className="btn-ghost btn-sm" onClick={() => setDraft(null)}>
                      Cancel
                    </button>
                    <button className="btn-gold btn-sm" onClick={save} disabled={saving}>
                      <Save className="size-3.5" /> {saving ? 'Saving…' : 'Save sheet'}
                    </button>
                  </div>
                ) : (
                  <button className="btn-gold btn-sm" onClick={startEdit}>
                    <Pencil className="size-3.5" /> Edit sheet
                  </button>
                ))}
              {!edit && <SongButton url={s.song} />}
              {!edit && <ShareMenu target={sheetRef} />}
              {mine && !edit && (
                <button className="btn-ghost btn-sm" onClick={() => setPinOpen(true)}>
                  <KeyRound className="size-3.5" /> PIN
                </button>
              )}
              {can('manageMembers') && !mine && (
                <button className="btn-ghost btn-sm" onClick={() => setPastOpen(true)} title="Deceased, retired, moved on or exiled">
                  <Feather className="size-3.5" /> {past ? 'Past member' : 'Mark as past'}
                </button>
              )}
              {isAdmin && !mine && (
                <button className="btn-ghost btn-sm" onClick={() => setLoaOpen(true)} title="Leave of absence: protects their login streak">
                  <Plane className="size-3.5" /> LOA
                </button>
              )}
            </div>
          </div>
          {!edit && <Glance m={m} />}
        </section>

        {/* ---------- tabs: the sheet, the trophy wall, the journal ---------- */}
        {!edit && (
          <div className="no-print">
            <Tabs
              value={view}
              onChange={(v) => setParams(v === 'sheet' ? {} : { view: v }, { replace: true })}
              tabs={[
                { id: 'sheet', label: 'Sheet' },
                { id: 'honors', label: 'Vault of Honors' },
                { id: 'trophies', label: 'Trophy Wall' },
                { id: 'journal', label: 'Journal' },
              ]}
            />
          </div>
        )}
        {view === 'trophies' && (
          <div className="no-print">
            <Cabinet member={m} />
          </div>
        )}
        {view === 'journal' && <Journal m={m} mine={mine} />}
        {view === 'honors' && (
          <div className="no-print">
            <Vault m={m} />
          </div>
        )}

        {/* ---------- the sheet: who they are · their story · their numbers ---------- */}
        {view === 'sheet' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,330px)]">
          <div className="space-y-6 xl:contents">
          <div className="space-y-6 xl:order-1">
            <div id="family-card">
              <FamilyCard member={m} />
            </div>
            <Box title="Vitals">
              <dl className="grid gap-3 sm:grid-cols-2">
                {BASICS.map(([k, label]) => (
                  <Line key={k} label={label} value={s.basics?.[k]} edit={edit} onChange={(v) => setIn('basics', k, v)} max={40} />
                ))}
                {edit ? (
                  <label className="block sm:col-span-2">
                    <span className="label">Birthday · shows on the calendar</span>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      <select className="input" value={draft!.bMonth} onChange={(e) => set({ bMonth: +e.target.value })}>
                        <option value={0}>Month</option>
                        {BMONTHS.map((n, i) => (
                          <option key={n} value={i + 1}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <select className="input" value={draft!.bDay} onChange={(e) => set({ bDay: +e.target.value })}>
                        <option value={0}>Day</option>
                        {Array.from({ length: 31 }, (_, i) => (
                          <option key={i} value={i + 1}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                ) : (
                  <Line label="Birthday" value={m.birthday ? `${BMONTHS[+m.birthday.slice(0, 2) - 1]} ${+m.birthday.slice(3)}` : ''} edit={false} onChange={() => {}} />
                )}
              </dl>
            </Box>
            <Box title="Looks">
              <dl className="grid gap-3 sm:grid-cols-2">
                {LOOKS.map(([k, label]) => (
                  <Line key={k} label={label} value={s.looks?.[k]} edit={edit} onChange={(v) => setIn('looks', k, v)} />
                ))}
              </dl>
            </Box>
            <Box title="City life">
              <dl className="grid gap-3 sm:grid-cols-2">
                <Line label="In-city phone" value={edit ? draft!.phone : m.phone} edit={edit} onChange={(v) => set({ phone: v })} mono max={20} />
                {CITY.map(([k, label]) => (
                  <Line key={k} label={label} value={s.city?.[k]} edit={edit} onChange={(v) => setIn('city', k, v)} />
                ))}
                {!edit && (
                  <>
                    <div>
                      <dt className="label">Answers to</dt>
                      <dd className="mt-0.5">
                        {boss ? (
                          <Link to={`/members/${boss.id}`} className="text-gold-100 hover:underline">
                            {boss.name}
                          </Link>
                        ) : (
                          <span className="text-smoke">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="label">Runs</dt>
                      <dd className="mt-0.5 flex flex-wrap gap-2">
                        {reports.length ? (
                          reports.map((r) => (
                            <Link key={r.id} to={`/members/${r.id}`} className="flex items-center gap-1 hover:underline">
                              <Avatar member={r} size="xs" /> {r.name}
                            </Link>
                          ))
                        ) : (
                          <span className="text-smoke">—</span>
                        )}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
            </Box>
          </div>
          <div className="space-y-6 xl:order-3">
            <KitCard memberId={m.id} />
            <StatBlock m={m} />
            <LeaderNotes m={m} mine={mine} />
          </div>
          </div>

          <div className="space-y-6 xl:order-2">
            <Box title="Story">
              <dl className="grid gap-4 sm:grid-cols-2">
                {STORY.filter(([k]) => edit || k !== 'quote').map(([k, label]) => (
                  <Line key={k} label={label} value={story[k]} edit={edit} onChange={(v) => setIn('story', k, v)} long={LONG_STORY.includes(k)} max={LONG_STORY.includes(k) ? 3000 : 200} />
                ))}
              </dl>
            </Box>

            <Box title="Traits">
              <div className="flex flex-wrap gap-2">
                {(s.traits ?? []).map((t, i) => (
                  <span key={i} className="seal inline-flex items-center gap-1 px-3 py-1 text-sm">
                    {t}
                    {edit && (
                      <button onClick={() => set({ traits: (draft!.traits ?? []).filter((_, j) => j !== i) })} aria-label={`Remove ${t}`}>
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
                {!edit && !(s.traits ?? []).length && <p className="text-sm text-smoke">—</p>}
              </div>
              {edit && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const t = traitInput.trim().slice(0, 24);
                    if (t) set({ traits: [...(draft!.traits ?? []), t] });
                    setTraitInput('');
                  }}
                >
                  <input className="input" value={traitInput} onChange={(e) => setTraitInput(e.target.value)} placeholder="e.g. Hot-headed, Loyal, Night owl" maxLength={24} />
                  <button className="btn-ghost">Add</button>
                </form>
              )}
            </Box>

            <Box title="Skills" right={<span className="text-[10px] text-smoke">self-rated</span>}>
              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {SKILL_GROUPS.map((g) => (
                  <div key={g.name}>
                    <p className="label mb-1 text-gold-500">{g.name}</p>
                    {g.skills.map((k) => (
                      <div key={k} className="flex items-center justify-between py-0.5 text-sm">
                        <span className="text-ash">{k}</span>
                        <Stars value={s.skills?.[k] ?? 0} onChange={edit ? (v) => set({ skills: { ...(draft!.skills ?? {}), [k]: v } }) : undefined} />
                      </div>
                    ))}
                  </div>
                ))}
                {(edit || (s.customSkills ?? []).length > 0) && (
                  <div>
                    <p className="label mb-1 text-gold-500">Own skills</p>
                    {(s.customSkills ?? []).map((c, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 py-0.5 text-sm">
                        {edit ? (
                          <input
                            className="input py-1 text-sm"
                            value={c.name}
                            maxLength={24}
                            placeholder="Skill"
                            onChange={(e) => set({ customSkills: draft!.customSkills!.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })}
                          />
                        ) : (
                          <span className="text-ash">{c.name}</span>
                        )}
                        <Stars value={c.value} onChange={edit ? (v) => set({ customSkills: draft!.customSkills!.map((x, j) => (j === i ? { ...x, value: v } : x)) }) : undefined} />
                        {edit && (
                          <button onClick={() => set({ customSkills: draft!.customSkills!.filter((_, j) => j !== i) })} aria-label="Remove">
                            <X className="size-3.5 text-smoke" />
                          </button>
                        )}
                      </div>
                    ))}
                    {edit && (
                      <button className="mt-1 text-xs text-gold-300 hover:underline" onClick={() => set({ customSkills: [...(draft!.customSkills ?? []), { name: '', value: 0 }] })}>
                        + Add a skill
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Box>

            {(edit || (s.customFields ?? []).length > 0) && (
              <Box title="More about me">
                {edit ? (
                  <div className="space-y-2">
                    {(draft!.customFields ?? []).map((f, i) => (
                      <div key={i} className="flex gap-2">
                        <input className="input w-40" placeholder="Label" maxLength={30} value={f.label} onChange={(e) => set({ customFields: draft!.customFields!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                        <input className="input flex-1" placeholder="Value" maxLength={200} value={f.value} onChange={(e) => set({ customFields: draft!.customFields!.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
                        <button onClick={() => set({ customFields: draft!.customFields!.filter((_, j) => j !== i) })} aria-label="Remove">
                          <X className="size-4 text-smoke" />
                        </button>
                      </div>
                    ))}
                    <button className="text-xs text-gold-300 hover:underline" onClick={() => set({ customFields: [...(draft!.customFields ?? []), { label: '', value: '' }] })}>
                      + Add a field
                    </button>
                  </div>
                ) : (
                  <dl className="grid gap-3 sm:grid-cols-2">
                    {(s.customFields ?? []).map((f, i) => (
                      <Line key={i} label={f.label} value={f.value} edit={false} onChange={() => {}} />
                    ))}
                  </dl>
                )}
              </Box>
            )}

            <Relations relations={s.relations ?? []} edit={edit} onChange={(relations) => set({ relations })} />
          </div>
          </div>
        )}
      </div>

      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
      {loaOpen && <LoaDialog m={m} onClose={() => setLoaOpen(false)} />}
      {pastOpen && <PastDialog m={m} past={past} onClose={() => setPastOpen(false)} />}
    </>
  );
}

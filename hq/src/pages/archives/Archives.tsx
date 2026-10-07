import { Feather, Library, Plus, ScrollText, Search, Send, Swords } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Empty } from '../../components/Field';
import { PageHeader, Panel, Tabs } from '../../components/Page';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { removeEvent, reviewStory, type DinnerNote, type Lore } from '../../lib/archives';
import { PAST_KINDS, usePastMembers } from '../../lib/hall';
import { relationOf, type Rival } from '../../lib/rivals';
import { BASICS, CITY, STORY, type Sheet } from '../../lib/sheet';
import type { Graduation } from '../../lib/welcome';
import type { Blacksite } from '../../lib/blacksites';
import { recordVs } from '../rivals/common';
import { useWelcomeAccess } from '../welcome/useWelcome';
import { EventEditor, LoreEditor, NoteEditor, SubmitStory } from './Editors';
import { LorePages, NotePages, Orn, Prose, Sec, Tome } from './Tome';
import { byChapter, roman, shortDate, useArchiveAccess, useArchives, type ArchiveData } from './useArchives';

type View = 'library' | 'timeline' | 'characters' | 'wars' | 'fallen' | 'desk';
type Dialog = { kind: 'note'; note: DinnerNote | null } | { kind: 'lore'; lore: Lore | null; preset?: Partial<Pick<Lore, 'kind' | 'memberId' | 'gangId'>> } | { kind: 'story' } | { kind: 'event' } | null;

// ---------- the shelves ----------

function Spine({ label, sub, color, faded, onClick, w = 46, h = 180 }: { label: string; sub?: string; color: string; faded?: boolean; onClick: () => void; w?: number; h?: number }) {
  return (
    <button className={`arch-spine ${faded ? 'faded' : ''}`} style={{ background: color, width: w, height: h }} onClick={onClick} title={sub ? `${label} · ${sub}` : label}>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}
const NOTE_COLORS = ['#3a0f0c', '#2a1a0c', '#14202a', '#1a2a14'];

function Shelves({ d, open, q }: { d: ArchiveData; open: (key: string) => void; q: string }) {
  const chapters = d.lore.filter((l) => l.kind === 'chapter' && l.status !== 'submitted' && l.status !== 'rejected').sort(byChapter);
  const stories = d.lore.filter((l) => l.kind === 'story' && (l.status === 'published' || l.status === 'draft'));
  const years = [...new Set(d.notes.map((n) => n.date.slice(0, 4)))];
  if (q.trim()) {
    const s = q.trim().toLowerCase();
    const hit = (t: string) => t.toLowerCase().includes(s);
    const notes = d.notes.filter((n) => [n.title, n.topics, n.decisions, n.announcements, n.minutes, n.quote].some(hit));
    const lore = d.lore.filter((l) => l.status === 'published' && [l.title, l.era, l.body].some(hit));
    const snippet = (t: string) => {
      const i = t.toLowerCase().indexOf(s);
      return i < 0 ? t.slice(0, 120) : `${i > 40 ? '…' : ''}${t.slice(Math.max(0, i - 40), i + 80)}…`;
    };
    return (
      <Panel title={`Found · ${notes.length + lore.length}`}>
        <ul className="divide-y divide-line-soft">
          {notes.map((n) => (
            <li key={n.id}>
              <button className="w-full py-2.5 text-left hover:text-gold-200" onClick={() => open(`note:${n.id}`)}>
                <span className="label text-[9px] text-gold-500">Dinner · {shortDate(n.date)}</span>
                <span className="block font-display text-gold-100">{n.title}</span>
                <span className="block text-xs text-smoke">{snippet([n.topics, n.decisions, n.minutes, n.announcements].find(hit) ?? n.topics)}</span>
              </button>
            </li>
          ))}
          {lore.map((l) => (
            <li key={l.id}>
              <button className="w-full py-2.5 text-left hover:text-gold-200" onClick={() => open(`lore:${l.id}`)}>
                <span className="label text-[9px] text-gold-500">{l.kind === 'chapter' ? `Chapter ${roman(l.order || 1)}` : l.kind}</span>
                <span className="block font-display text-gold-100">{l.title}</span>
                <span className="block text-xs text-smoke">{snippet(l.body)}</span>
              </button>
            </li>
          ))}
          {!notes.length && !lore.length && <li className="py-3 text-sm text-smoke">Nothing in the Archives mentions that.</li>}
        </ul>
      </Panel>
    );
  }
  return (
    <div className="arch-shelves">
      {(years.length ? years : [String(new Date().getFullYear())]).map((y) => {
        const list = d.notes.filter((n) => n.date.startsWith(y));
        return (
          <div key={y}>
            <p className="arch-shelf-label">Dinner notes · {y}</p>
            <div className="arch-row">
              {list.map((n, i) => (
                <Spine key={n.id} label={shortDate(n.date)} sub={n.status === 'draft' ? 'draft' : undefined} color={NOTE_COLORS[i % NOTE_COLORS.length]!} faded={n.status === 'draft'} h={168 + ((i * 13) % 22)} onClick={() => open(`note:${n.id}`)} />
              ))}
              {!list.length && <p className="arch-empty">No dinners written up yet.</p>}
            </div>
          </div>
        );
      })}
      <div>
        <p className="arch-shelf-label">The lore book</p>
        <div className="arch-row">
          {chapters.map((l, i) => (
            <Spine key={l.id} label={l.title} sub={`${roman(l.order || i + 1)}${l.status === 'draft' ? ' · draft' : ''}`} color={l.color} faded={l.status === 'draft'} w={58 + (l.title.length % 3) * 6} h={186 + ((i * 7) % 18)} onClick={() => open(`lore:${l.id}`)} />
          ))}
          {!chapters.length && <p className="arch-empty">The first chapter hasn’t been written.</p>}
        </div>
      </div>
      <div>
        <p className="arch-shelf-label">Stories from the family</p>
        <div className="arch-row">
          {stories.map((l, i) => (
            <Spine key={l.id} label={l.title} sub={l.credit ? `as told by ${l.credit}` : undefined} color={l.color} faded={l.status === 'draft'} w={50} h={160 + ((i * 11) % 30)} onClick={() => open(`lore:${l.id}`)} />
          ))}
          {!stories.length && <p className="arch-empty">No stories yet. Send one in.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------- the other sections ----------

function Timeline({ d, isArchivist, onAdd }: { d: ArchiveData; isArchivist: boolean; onAdd: () => void }) {
  const grads = useCollection<Graduation>('graduations') ?? [];
  const gangs = useCollection<Rival>('rivals') ?? [];
  const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const items = [
    ...d.timeline.map((e) => ({ key: e.id, date: e.date, title: e.title, note: e.note, kind: 'event', id: e.id })),
    ...d.notes.filter((n) => n.status === 'published').map((n) => ({ key: `n${n.id}`, date: n.date, title: n.title || 'Family Dinner', note: n.decisions.split('\n')[0] ?? '', kind: 'dinner', id: '' })),
    ...grads.filter((g) => g.at).map((g) => ({ key: `g${g.id}`, date: day(g.at!.toMillis()), title: `${g.name} blooded in`, note: `as ${g.rankName}`, kind: 'blood', id: '' })),
    ...gangs.flatMap((g) =>
      (g.relationLog ?? [])
        .filter((r) => ['war', 'truce', 'allied'].includes(r.rel))
        .map((r, i) => ({ key: `r${g.id}${i}`, date: day(r.at), title: r.rel === 'war' ? `War with the ${g.name}` : `${relationOf(r.rel).label} with the ${g.name}`, note: r.note, kind: r.rel === 'war' ? 'war' : 'peace', id: '' })),
    ),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="mx-auto max-w-3xl">
      {isArchivist && (
        <div className="mb-4 flex justify-end">
          <button className="btn-ghost btn-sm" onClick={onAdd}>
            <Plus className="size-3.5" /> Add a date
          </button>
        </div>
      )}
      {items.length ? (
        <ol className="arch-timeline">
          {items.map((e, i) => {
            const year = e.date.slice(0, 4);
            const newYear = i === 0 || items[i - 1]!.date.slice(0, 4) !== year;
            return (
              <li key={e.key}>
                {newYear && <p className="arch-year">{year}</p>}
                <div className={`arch-event ${e.kind}`}>
                  <span className="arch-event-date">{shortDate(e.date)}</span>
                  <b>{e.title}</b>
                  {e.note && <span className="block text-sm text-ash">{e.note}</span>}
                  {e.id && isArchivist && (
                    <button className="ml-2 text-[11px] text-smoke hover:text-red-300" onClick={() => removeEvent(e.id)}>
                      remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <Empty title="Nothing on the timeline yet" />
      )}
    </div>
  );
}

function Characters({ d, open }: { d: ArchiveData; open: (k: string) => void }) {
  const { roster } = useHub();
  const { assocRank } = useWelcomeAccess();
  const people = roster.filter((m) => !(assocRank && m.rankId === assocRank.id));
  const written = new Set(d.lore.filter((l) => l.kind === 'character' && l.status === 'published').map((l) => l.memberId));
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {people.map((m) => (
        <button key={m.id} className="arch-card" onClick={() => open(`char:${m.id}`)}>
          <Avatar member={m} size="lg" />
          <b>{m.name}</b>
          <small>{written.has(m.id) ? 'A page in the book' : 'From their sheet'}</small>
        </button>
      ))}
    </div>
  );
}

function Wars({ open }: { open: (k: string) => void }) {
  const gangs = (useCollection<Rival>('rivals') ?? []).sort((a, b) => a.name.localeCompare(b.name));
  const fights = useCollection<Blacksite>('blacksites') ?? [];
  if (!gangs.length) return <Empty title="No rivals on file">Wars come from the Rivals page’s case files.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {gangs.map((g) => {
        const rec = recordVs(g.name, fights);
        const rel = relationOf(g.relation);
        return (
          <button key={g.id} className="arch-card items-start text-left" onClick={() => open(`war:${g.id}`)}>
            <span className="flex w-full items-center gap-2">
              <Swords className="size-4" style={{ color: g.color }} />
              <b className="flex-1 truncate" style={{ color: g.color }}>
                {g.name}
              </b>
              <span className="chip px-2 py-0.5 text-[10px] font-bold text-void" style={{ background: rel.color }}>
                {rel.label}
              </span>
            </span>
            <small>
              {rec.w}W · {rec.l}L · {(g.relationLog ?? []).length} turns in the story
            </small>
          </button>
        );
      })}
    </div>
  );
}

function Fallen({ open }: { open: (k: string) => void }) {
  const { members } = useHub();
  const past = usePastMembers(false);
  const list = members.filter((m) => past.has(m.id));
  if (!list.length) return <Empty title="Nobody has left the family">Those who’ve passed or moved on are remembered here.</Empty>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((m) => {
        const p = past.get(m.id)!;
        return (
          <button key={m.id} className="arch-plaque" onClick={() => open(`char:${m.id}`)}>
            <Avatar member={m} size="lg" />
            <span className="min-w-0 text-left">
              <b>{m.name}</b>
              <small>
                {PAST_KINDS.find((k) => k.id === p.kind)?.label} · {p.day}
              </small>
              {p.epitaph && <i>“{p.epitaph}”</i>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Desk({ d, edit }: { d: ArchiveData; edit: (x: Dialog) => void }) {
  const [note, setNote] = useState<Record<string, string>>({});
  const drafts = [...d.notes.filter((n) => n.status === 'draft').map((n) => ({ key: n.id, title: `${n.title} · ${shortDate(n.date)}`, go: () => edit({ kind: 'note', note: n }) })), ...d.lore.filter((l) => l.status === 'draft').map((l) => ({ key: l.id, title: l.title, go: () => edit({ kind: 'lore', lore: l }) }))];
  const subs = d.lore.filter((l) => l.status === 'submitted');
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title={`Sent in by the family · ${subs.length}`}>
        {subs.length ? (
          <ul className="space-y-4">
            {subs.map((l) => (
              <li key={l.id} className="border border-line-soft p-3">
                <p className="font-display text-lg text-gold-100">{l.title}</p>
                <p className="text-xs text-smoke">from {l.byName}</p>
                <p className="mt-2 line-clamp-4 font-serif text-sm whitespace-pre-wrap text-ash">{l.body}</p>
                {!!l.images.length && <p className="mt-1 text-xs text-smoke">{l.images.length} photo(s)</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-gold btn-sm" onClick={() => reviewStory(l.id, true)}>
                    Put it in the book
                  </button>
                  <button className="btn-ghost btn-sm" onClick={() => edit({ kind: 'lore', lore: l })}>
                    Edit first
                  </button>
                  <input className="input w-48 py-1 text-xs" placeholder="Why not (optional)" value={note[l.id] ?? ''} onChange={(e) => setNote({ ...note, [l.id]: e.target.value })} />
                  <button className="btn-ghost btn-sm" onClick={() => reviewStory(l.id, false, note[l.id] ?? '')}>
                    Turn down
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-smoke">Nothing waiting.</p>
        )}
      </Panel>
      <Panel title={`Your drafts · ${drafts.length}`}>
        {drafts.length ? (
          <ul className="divide-y divide-line-soft">
            {drafts.map((x) => (
              <li key={x.key}>
                <button className="w-full py-2 text-left text-gold-100 hover:text-gold-300" onClick={x.go}>
                  {x.title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-smoke">No drafts.</p>
        )}
      </Panel>
    </div>
  );
}

function MyStories({ d }: { d: ArchiveData }) {
  const { me } = useHub();
  const mine = d.lore.filter((l) => l.by === me.id && (l.status === 'submitted' || l.status === 'rejected'));
  if (!mine.length) return null;
  return (
    <Panel title="Your stories">
      <ul className="space-y-1.5 text-sm">
        {mine.map((l) => (
          <li key={l.id} className="flex flex-wrap gap-2">
            <span className="text-gold-100">{l.title}</span>
            <span className={l.status === 'rejected' ? 'text-red-300' : 'text-yellow-200'}>{l.status === 'rejected' ? `Turned down${l.reviewNote ? `: ${l.reviewNote}` : ''}` : 'With the Archivist'}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

// ---------- reading ----------

function CharacterPages({ id, d }: { id: string; d: ArchiveData }) {
  const { memberById, rankById } = useHub();
  const m = memberById.get(id);
  const sheet = useDoc<Sheet>(`sheets/${id}`);
  const pages = d.lore.filter((l) => l.kind === 'character' && l.memberId === id && l.status === 'published');
  const facts = [...BASICS.map(([k, label]) => [label, sheet?.basics?.[k]]), ...CITY.map(([k, label]) => [label, sheet?.city?.[k]])].filter(([, v]) => v) as [string, string][];
  return (
    <>
      <h2 className="tome-title">{m?.name ?? 'Unknown'}</h2>
      <p className="tome-sub">
        {[m?.alias && `“${m.alias}”`, rankById.get(m?.rankId ?? '')?.name].filter(Boolean).join(' · ')}
      </p>
      {sheet?.story?.quote && <p className="tome-quote">“{sheet.story.quote}”</p>}
      {!!facts.length && (
        <Sec title="From their sheet">
          <dl className="tome-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Sec>
      )}
      {STORY.filter(([k]) => k !== 'quote' && sheet?.story?.[k]).map(([k, label]) => (
        <Sec key={k} title={label}>
          <Prose text={sheet!.story![k]!} />
        </Sec>
      ))}
      {pages.map((l) => (
        <div key={l.id} className="tome-sec">
          <Orn />
          <p className="tome-label text-center">{l.title}</p>
          <Prose text={l.body} drop />
        </div>
      ))}
      {!facts.length && !pages.length && !sheet?.story && <p className="tome-p text-center italic">The Archivist hasn’t written of them yet.</p>}
    </>
  );
}

function WarPages({ id, d }: { id: string; d: ArchiveData }) {
  const g = useDoc<Rival>(`rivals/${id}`);
  const fights = useCollection<Blacksite>('blacksites') ?? [];
  const pages = d.lore.filter((l) => l.kind === 'war' && l.gangId === id && l.status === 'published');
  if (!g) return <p className="tome-p">…</p>;
  const rec = recordVs(g.name, fights);
  return (
    <>
      <h2 className="tome-title" style={{ color: g.color }}>
        The {g.name}
      </h2>
      <p className="tome-sub">
        {relationOf(g.relation).label} · {rec.w} won, {rec.l} lost at the blacksites
      </p>
      {g.notes && <Prose text={g.notes} drop />}
      <Sec title="How it went">
        {[...(g.relationLog ?? [])]
          .sort((a, b) => a.at - b.at)
          .map((r, i) => (
            <p key={i} className="tome-p">
              <b>{shortDate(new Date(r.at).toISOString().slice(0, 10))}, {new Date(r.at).getFullYear()}</b>: {relationOf(r.rel).label}. {r.note}
            </p>
          ))}
      </Sec>
      {pages.map((l) => (
        <div key={l.id} className="tome-sec">
          <Orn />
          <p className="tome-label text-center">{l.title}</p>
          <Prose text={l.body} drop />
        </div>
      ))}
    </>
  );
}

function Reader({ k, d, setK, edit, isArchivist }: { k: string; d: ArchiveData; setK: (k: string | null) => void; edit: (x: Dialog) => void; isArchivist: boolean }) {
  const [kind, id] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
  const shelfOf = (l?: Lore) => (l ? d.lore.filter((x) => x.kind === l.kind && (x.status === 'published' || (isArchivist && x.status === 'draft'))).sort(l.kind === 'chapter' ? byChapter : (a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0)) : []);
  const nav = <T extends { id: string }>(list: T[], prefix: string) => {
    const i = list.findIndex((x) => x.id === id);
    return { prev: i > 0 ? () => setK(`${prefix}:${list[i - 1]!.id}`) : undefined, next: i >= 0 && i < list.length - 1 ? () => setK(`${prefix}:${list[i + 1]!.id}`) : undefined };
  };
  if (kind === 'note') {
    const n = d.notes.find((x) => x.id === id);
    if (!n) return <Empty title="Not found" />;
    const list = [...d.notes].sort((a, b) => a.date.localeCompare(b.date));
    return (
      <Tome id={k} long={[n.topics, n.decisions, n.announcements, n.minutes].join('').length > 700} onBack={() => setK(null)} {...nav(list, 'note')} reacts={d.reacts} onEdit={isArchivist ? () => edit({ kind: 'note', note: n }) : undefined}>
        <NotePages n={n} />
      </Tome>
    );
  }
  if (kind === 'lore') {
    const l = d.lore.find((x) => x.id === id);
    if (!l) return <Empty title="Not found" />;
    return (
      <Tome id={k} long={l.body.length > 1400 || l.images.length > 1} onBack={() => setK(null)} {...nav(shelfOf(l), 'lore')} reacts={l.status === 'published' ? d.reacts : undefined} onEdit={isArchivist ? () => edit({ kind: 'lore', lore: l }) : undefined}>
        <LorePages l={l} chapter={l.kind === 'chapter' ? `Chapter ${roman(l.order || 1)}` : l.kind === 'story' ? 'From the family' : undefined} />
      </Tome>
    );
  }
  const pagesFor = (f: (l: Lore) => boolean) => d.lore.filter((l) => f(l) && l.status === 'published').reduce((t, l) => t + l.body.length, 0);
  if (kind === 'char')
    return (
      <Tome id={k} long={pagesFor((l) => l.kind === 'character' && l.memberId === id) > 1200} onBack={() => setK(null)} back="Back" reacts={d.reacts} onEdit={isArchivist ? () => edit({ kind: 'lore', lore: d.lore.find((l) => l.kind === 'character' && l.memberId === id) ?? null, preset: { kind: 'character', memberId: id } }) : undefined}>
        <CharacterPages id={id} d={d} />
      </Tome>
    );
  return (
    <Tome id={k} long={pagesFor((l) => l.kind === 'war' && l.gangId === id) > 900} onBack={() => setK(null)} back="Back" reacts={d.reacts} onEdit={isArchivist ? () => edit({ kind: 'lore', lore: d.lore.find((l) => l.kind === 'war' && l.gangId === id) ?? null, preset: { kind: 'war', gangId: id } }) : undefined}>
      <WarPages id={id} d={d} />
    </Tome>
  );
}

// ---------- page ----------

export default function Archives() {
  const { blooded, isArchivist } = useArchiveAccess();
  const d = useArchives();
  const [params, setParams] = useSearchParams();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [q, setQ] = useState('');
  if (!blooded) return <Empty title="The Archives are for the family">Once you’re blooded in, the family’s history is yours to read.</Empty>;
  const waiting = d.lore.filter((l) => l.status === 'submitted').length;
  const tabs: { id: View; label: string }[] = [
    { id: 'library', label: 'The library' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'characters', label: 'Characters' },
    { id: 'wars', label: 'Wars' },
    { id: 'fallen', label: 'The fallen' },
    ...(isArchivist ? [{ id: 'desk' as View, label: `Archivist’s desk${waiting ? ` · ${waiting}` : ''}` }] : []),
  ];
  const view = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'library';
  const reading = params.get('read');
  const setRead = (k: string | null) => setParams(k ? { ...(view !== 'library' ? { tab: view } : {}), read: k } : view !== 'library' ? { tab: view } : {});
  return (
    <>
      <PageHeader
        icon={Library}
        kicker="History"
        title="The Archives"
        sub="Dinner notes from every family dinner, and the book of who we are: chapters, stories, the people and the wars."
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setDialog({ kind: 'story' })}>
              <Send className="size-4" /> Send a story
            </button>
            {isArchivist && (
              <>
                <button className="btn-ghost" onClick={() => setDialog({ kind: 'lore', lore: null })}>
                  <Feather className="size-4" /> Write
                </button>
                <button className="btn-gold" onClick={() => setDialog({ kind: 'note', note: null })}>
                  <ScrollText className="size-4" /> Dinner notes
                </button>
              </>
            )}
          </div>
        }
      />
      {reading ? (
        <Reader k={reading} d={d} setK={setRead} edit={setDialog} isArchivist={isArchivist} />
      ) : (
        <>
          <div className="mb-5">
            <Tabs value={view} onChange={(v) => setParams(v === 'library' ? {} : { tab: v })} tabs={tabs} />
          </div>
          {view === 'library' && (
            <div className="space-y-6">
              <label className="relative block max-w-md">
                <Search className="absolute top-2.5 left-3 size-4 text-smoke" />
                <input className="input pl-9" placeholder="Search the Archives" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <Shelves d={d} open={setRead} q={q} />
              <MyStories d={d} />
            </div>
          )}
          {view === 'timeline' && <Timeline d={d} isArchivist={isArchivist} onAdd={() => setDialog({ kind: 'event' })} />}
          {view === 'characters' && <Characters d={d} open={setRead} />}
          {view === 'wars' && <Wars open={setRead} />}
          {view === 'fallen' && <Fallen open={setRead} />}
          {view === 'desk' && <Desk d={d} edit={setDialog} />}
        </>
      )}
      {dialog?.kind === 'note' && <NoteEditor note={dialog.note} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'lore' && <LoreEditor lore={dialog.lore} kind={dialog.preset?.kind} memberId={dialog.preset?.memberId ?? undefined} gangId={dialog.preset?.gangId ?? undefined} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'story' && <SubmitStory onClose={() => setDialog(null)} />}
      {dialog?.kind === 'event' && <EventEditor onClose={() => setDialog(null)} />}
    </>
  );
}

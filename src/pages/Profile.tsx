import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Empty, Field } from '../components/Field';
import { ImagePicker } from '../components/ImagePicker';
import { JournalCard, JournalForm } from '../components/Journal';
import { LoreText } from '../components/LoreText';
import { MemberName } from '../components/MemberName';
import { Ornament } from '../components/Ornament';
import { RankBadge } from '../components/RankBadge';
import { StatusPill } from '../components/StatusPill';
import { TieForm, TieList } from '../components/Ties';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { useLore } from '../hooks/useLore';
import { db } from '../lib/firebase';
import { displayName, formatDate } from '../lib/format';
import { CHARACTER_STATUSES, type Character, type Member } from '../lib/types';
import { LoreCard } from './lore/LoreIndex';
import { MarkdownEditor } from '../components/MarkdownEditor';

const DETAILS: { key: keyof Character; label: string }[] = [
  { key: 'specialty', label: 'Specialty' },
  { key: 'dob', label: 'Born' },
  { key: 'nationality', label: 'Origin' },
  { key: 'phone', label: 'Phone' },
  { key: 'vehicle', label: 'Rides' },
  { key: 'discord', label: 'Discord' },
  { key: 'timezone', label: 'Timezone' },
];

const TABS = [
  { id: 'dossier', label: 'Dossier' },
  { id: 'journal', label: 'Journal' },
  { id: 'ties', label: 'Ties' },
  { id: 'appears', label: 'Appears in' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export default function Profile() {
  const { id } = useParams();
  const { me } = useAuth();
  const { memberById, rankById, members, can } = useHub();
  const { journals, lore, chronicle, tiesOf } = useLore();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState(false);
  const [writing, setWriting] = useState(false);
  const [addingTie, setAddingTie] = useState(false);
  const member = id ? memberById.get(id) : undefined;

  if (!member) return <Empty>That member doesn't exist.</Empty>;
  const isMe = member.id === me?.id;
  if (editing && isMe) return <ProfileEditor member={member} onDone={() => setEditing(false)} />;

  const tab = (TABS.find((t) => t.id === params.get('tab'))?.id ?? 'dossier') as Tab;
  const setTab = (t: Tab) => setParams(t === 'dossier' ? {} : { tab: t }, { replace: true });
  const rank = member.rankId ? rankById.get(member.rankId) : null;
  const c = member.character ?? {};
  const crew = members.filter((m) => m.status === 'active' && m.reportsTo === member.id);
  const myJournal = journals.filter((j) => j.authorId === member.id);
  const appearsIn = lore.filter((l) => l.characters.includes(member.id) || l.body.toLowerCase().includes(`@${member.usernameLower}`));
  const events = chronicle.filter((e) => e.characters.includes(member.id));
  const counts: Record<Tab, number | null> = { dossier: null, journal: myJournal.length, ties: tiesOf(member.id).length, appears: appearsIn.length + events.length };

  return (
    <div className="space-y-6">
      <Link to="/members" className="text-sm text-smoke hover:text-gold-200">
        ← The Family
      </Link>

      <section className="panel relative overflow-hidden">
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(212,175,55,.12),transparent_65%)]" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-8">
          <div className="mx-auto shrink-0 sm:mx-0">
            {member.avatar ? (
              <img
                src={member.avatar}
                alt={displayName(member)}
                className="h-52 w-52 rounded-full border-2 border-gold-500/70 object-cover shadow-[0_0_50px_-10px_rgba(212,175,55,.6)] ring-4 ring-gold-700/20 ring-offset-4 ring-offset-panel"
              />
            ) : (
              <Avatar member={member} size="xl" ring />
            )}
          </div>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <RankBadge rank={rank} />
              <StatusPill status={c.characterStatus} />
              <span className="text-xs text-smoke">@{member.username}</span>
            </div>
            <h1 className="gold-text mt-2 text-4xl font-black sm:text-5xl">{displayName(member)}</h1>
            {c.alias && <p className="mt-1 font-display text-lg italic text-gold-300">“{c.alias}”</p>}
            {c.quote && <p className="mt-3 max-w-xl font-serif text-xl italic text-parchment/85">❝ {c.quote} ❞</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
              {isMe && (
                <button className="btn-gold" onClick={() => setEditing(true)}>
                  Edit my file
                </button>
              )}
            </div>
          </div>
        </div>
        <nav className="flex overflow-x-auto border-t border-edge px-4" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 font-display text-sm tracking-wider ${
                tab === t.id ? 'border-gold-400 text-gold-200' : 'border-transparent text-smoke hover:text-bone'
              }`}
            >
              {t.label}
              {counts[t.id] ? <span className="ml-1.5 text-xs text-smoke">{counts[t.id]}</span> : null}
            </button>
          ))}
        </nav>
      </section>

      {tab === 'dossier' && (
        <div className="grid gap-6 lg:grid-cols-3">
          <section className="panel p-6 lg:col-span-2">
            <h2 className="panel-title mb-4">Their story</h2>
            {c.bio ? <LoreText dropCap>{c.bio}</LoreText> : <p className="text-sm text-smoke">No story on file yet.</p>}
          </section>
          <div className="space-y-6">
            <section className="panel p-5">
              <h2 className="panel-title mb-3">Particulars</h2>
              <dl className="space-y-2.5">
                {member.reportsTo && (
                  <Detail label="Answers to">
                    <MemberName id={member.reportsTo} />
                  </Detail>
                )}
                {DETAILS.filter((d) => c[d.key]).map((d) => (
                  <Detail key={d.key} label={d.label}>
                    {c[d.key]}
                  </Detail>
                ))}
                <Detail label="Joined the family">{formatDate(member.joinedAt)}</Detail>
              </dl>
            </section>
            {crew.length > 0 && (
              <section className="panel p-5">
                <h2 className="panel-title mb-3">Their crew</h2>
                <ul className="space-y-2">
                  {crew.map((m) => (
                    <li key={m.id} className="flex items-center gap-2">
                      <Avatar member={m} size="xs" />
                      <MemberName id={m.id} className="text-sm" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}

      {tab === 'journal' && (
        <div className="mx-auto max-w-3xl space-y-4">
          {isMe && (
            <button className="btn-gold" onClick={() => setWriting(true)}>
              ✎ New journal entry
            </button>
          )}
          {myJournal.length ? myJournal.map((j) => <JournalCard key={j.id} entry={j} />) : <Empty>{isMe ? 'Your journal is empty. Write your first entry.' : 'Their journal is empty.'}</Empty>}
        </div>
      )}

      {tab === 'ties' && (
        <section className="panel p-6">
          <div className="mb-4 flex justify-end">
            {(isMe || can('editAllLore')) && can('writeLore') && (
              <button className="btn-gold" onClick={() => setAddingTie(true)}>
                + Record a tie
              </button>
            )}
          </div>
          <TieList memberId={member.id} />
        </section>
      )}

      {tab === 'appears' && (
        <div className="space-y-8">
          {appearsIn.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {appearsIn.map((l) => (
                <LoreCard key={l.id} entry={l} />
              ))}
            </div>
          )}
          {events.length > 0 && (
            <section>
              <Ornament className="mb-4" />
              <ul className="space-y-2">
                {events.map((e) => (
                  <li key={e.id}>
                    <Link to={`/chronicle#${e.id}`} className="panel flex items-center gap-4 p-3 hover:border-gold-500">
                      <span className="w-40 shrink-0 font-display text-xs uppercase tracking-wider text-gold-300">{e.whenLabel || e.when}</span>
                      <span className="text-bone">{e.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!appearsIn.length && !events.length && <Empty>{displayName(member)} hasn't appeared in the Archive or the Chronicle yet.</Empty>}
        </div>
      )}

      {writing && <JournalForm entry={null} onClose={() => setWriting(false)} />}
      {addingTie && <TieForm from={member.id} onClose={() => setAddingTie(false)} />}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-edge/60 pb-2 last:border-0">
      <dt className="text-[11px] uppercase tracking-wider text-smoke">{label}</dt>
      <dd className="text-right text-sm text-bone">{children}</dd>
    </div>
  );
}

function ProfileEditor({ member, onDone }: { member: Member; onDone: () => void }) {
  const [c, setC] = useState<Character>({ characterStatus: 'Active', ...member.character });
  const [avatar, setAvatar] = useState<string | null>(member.avatar ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof Character) => (e: { target: { value: string } }) => setC((prev) => ({ ...prev, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const clean = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
      await updateDoc(doc(db, 'users', member.id), { character: clean, avatar, updatedAt: serverTimestamp() });
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="gold-text text-3xl font-black">Edit Your File</h1>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}

      <section className="panel flex flex-wrap items-center gap-6 p-5">
        {avatar ? (
          <img src={avatar} alt="" className="h-32 w-32 rounded-xl border border-gold-700/60 object-cover" />
        ) : (
          <Avatar member={{ ...member, avatar: null, character: c }} size="lg" />
        )}
        <div className="space-y-2">
          <p className="text-sm text-smoke">Character portrait — cropped square. A screenshot from in-game works great.</p>
          <div className="flex gap-2">
            <ImagePicker onPick={setAvatar} label={avatar ? 'Change picture' : 'Upload picture'} />
            {avatar && (
              <button type="button" className="btn-ghost" onClick={() => setAvatar(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="panel grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Character name">
          <input className="input" value={c.characterName ?? ''} onChange={set('characterName')} maxLength={60} placeholder="Vincent Moretti" />
        </Field>
        <Field label="Alias / nickname">
          <input className="input" value={c.alias ?? ''} onChange={set('alias')} maxLength={40} placeholder="Vinnie Two-Times" />
        </Field>
        <Field label="Status">
          <select className="input" value={c.characterStatus} onChange={set('characterStatus')}>
            {CHARACTER_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field label="Specialty">
          <input className="input" value={c.specialty ?? ''} onChange={set('specialty')} maxLength={60} placeholder="Wheelman, Muscle, Hacker, Cook…" />
        </Field>
        <Field label="In-game phone">
          <input className="input" value={c.phone ?? ''} onChange={set('phone')} maxLength={30} />
        </Field>
        <Field label="Date of birth">
          <input className="input" value={c.dob ?? ''} onChange={set('dob')} maxLength={30} placeholder="03/14/1988" />
        </Field>
        <Field label="Nationality">
          <input className="input" value={c.nationality ?? ''} onChange={set('nationality')} maxLength={40} />
        </Field>
        <Field label="Vehicle">
          <input className="input" value={c.vehicle ?? ''} onChange={set('vehicle')} maxLength={60} />
        </Field>
        <Field label="Discord">
          <input className="input" value={c.discord ?? ''} onChange={set('discord')} maxLength={40} />
        </Field>
        <Field label="Timezone">
          <input className="input" value={c.timezone ?? ''} onChange={set('timezone')} maxLength={30} placeholder="EST" />
        </Field>
        <Field label="A line they're known for (optional)" className="sm:col-span-2">
          <input className="input font-serif text-lg italic" value={c.quote ?? ''} onChange={set('quote')} maxLength={200} placeholder="Family first. Family always." />
        </Field>
        <div className="sm:col-span-2">
          <span className="label">Their story</span>
          <MarkdownEditor value={c.bio ?? ''} onChange={(v) => setC((prev) => ({ ...prev, bio: v }))} maxLength={20000} rows={12} placeholder="Where they came from, how they found the family…" />
        </div>
      </section>
    </form>
  );
}

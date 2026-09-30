import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Empty, Field } from '../components/Field';
import { ImagePicker } from '../components/ImagePicker';
import { MemberName } from '../components/MemberName';
import { RankBadge } from '../components/RankBadge';
import { StatusPill } from '../components/StatusPill';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { displayName, formatDate } from '../lib/format';
import { CHARACTER_STATUSES, type Character, type Member } from '../lib/types';

const DETAILS: { key: keyof Character; label: string }[] = [
  { key: 'specialty', label: 'Specialty' },
  { key: 'phone', label: 'Phone' },
  { key: 'dob', label: 'Date of Birth' },
  { key: 'nationality', label: 'Nationality' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'discord', label: 'Discord' },
  { key: 'timezone', label: 'Timezone' },
];

export default function Profile() {
  const { id } = useParams();
  const { me } = useAuth();
  const { memberById, rankById, members } = useHub();
  const member = id ? memberById.get(id) : undefined;
  const [editing, setEditing] = useState(false);

  if (!member) return <Empty>That member doesn't exist.</Empty>;
  const isMe = member.id === me?.id;
  const rank = member.rankId ? rankById.get(member.rankId) : null;
  const c = member.character ?? {};
  const crew = members.filter((m) => m.status === 'active' && m.reportsTo === member.id);

  if (editing && isMe) return <ProfileEditor member={member} onDone={() => setEditing(false)} />;

  return (
    <div className="space-y-6">
      <Link to="/members" className="text-sm text-smoke hover:text-gold-200">
        ← The Family
      </Link>
      <section className="panel overflow-hidden">
        <div className="h-1.5 bg-gradient-to-r from-gold-700 via-gold-300 to-gold-700" />
        <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
          <div className="mx-auto shrink-0 sm:mx-0">
            {member.avatar ? (
              <img
                src={member.avatar}
                alt={displayName(member)}
                className="h-56 w-56 rounded-xl border border-gold-700/60 object-cover shadow-[0_0_40px_-10px_rgba(212,175,55,.5)]"
              />
            ) : (
              <Avatar member={member} size="xl" ring />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="gold-text text-4xl font-black">{displayName(member)}</h1>
                {c.alias && <p className="mt-1 font-display text-lg italic text-gold-300">“{c.alias}”</p>}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <RankBadge rank={rank} />
                  <StatusPill status={c.characterStatus} />
                  <span className="text-xs text-smoke">@{member.username}</span>
                </div>
              </div>
              {isMe && (
                <button className="btn-gold" onClick={() => setEditing(true)}>
                  Edit my file
                </button>
              )}
            </div>
            <div className="divider-gold my-5" />
            <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
              {member.reportsTo && (
                <Detail label="Reports to">
                  <MemberName id={member.reportsTo} />
                </Detail>
              )}
              {DETAILS.filter((d) => c[d.key]).map((d) => (
                <Detail key={d.key} label={d.label}>
                  {c[d.key]}
                </Detail>
              ))}
              <Detail label="Joined">{formatDate(member.joinedAt)}</Detail>
            </dl>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <h2 className="panel-title mb-3">Background</h2>
          {c.bio ? <p className="whitespace-pre-wrap leading-relaxed text-bone/90">{c.bio}</p> : <p className="text-sm text-smoke">No story on file.</p>}
        </section>
        <section className="panel p-5">
          <h2 className="panel-title mb-3">Crew</h2>
          {crew.length ? (
            <ul className="space-y-2">
              {crew.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <Avatar member={m} size="xs" />
                  <MemberName id={m.id} className="text-sm" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">Nobody reports to {displayName(member)}.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-smoke">{label}</dt>
      <dd className="mt-0.5 text-sm text-bone">{children}</dd>
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
        <Field label="Background / backstory" className="sm:col-span-2">
          <textarea className="input min-h-40" value={c.bio ?? ''} onChange={set('bio')} maxLength={5000} />
        </Field>
      </section>
    </form>
  );
}

import { ArrowLeft, Camera, Crosshair, Crown, KeyRound, Pencil, Swords, Trophy } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { useCollection } from '../hooks/useCollection';
import { records, type Blacksite } from '../lib/blacksites';
import { Cabinet } from '../components/Cabinet';
import { CrewChip, RankBadge } from '../components/Badges';
import { ErrorText, Field } from '../components/Field';
import { Modal } from '../components/Modal';
import { Panel } from '../components/Page';
import { useHub } from '../hooks/useHub';
import { AuthError, changePin } from '../lib/auth';
import { ago, fmtDate } from '../lib/format';
import { squareImage } from '../lib/image';
import { setPresenceStatus, updateProfile } from '../lib/members';
import { PRESENCE_STATUSES, type Member } from '../lib/types';

const BMONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function EditProfile({ m, onClose }: { m: Member; onClose: () => void }) {
  const [alias, setAlias] = useState(m.alias ?? '');
  const [phone, setPhone] = useState(m.phone ?? '');
  const [bio, setBio] = useState(m.bio ?? '');
  const [bMonth, setBMonth] = useState(m.birthday ? +m.birthday.slice(0, 2) : 0);
  const [bDay, setBDay] = useState(m.birthday ? +m.birthday.slice(3) : 0);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const birthday = bMonth && bDay ? `${String(bMonth).padStart(2, '0')}-${String(bDay).padStart(2, '0')}` : null;
    await updateProfile(m.id, { alias: alias.trim(), phone: phone.trim(), bio: bio.trim(), birthday });
    onClose();
  }
  return (
    <Modal title="Edit profile" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Alias / street name">
          <input className="input" value={alias} onChange={(e) => setAlias(e.target.value)} maxLength={30} />
        </Field>
        <Field label="Character birthday" hint="Shows on the family calendar.">
          <div className="grid grid-cols-2 gap-2">
            <select className="input" value={bMonth} onChange={(e) => setBMonth(+e.target.value)}>
              <option value={0}>Month</option>
              {BMONTHS.map((n, i) => (
                <option key={n} value={i + 1}>
                  {n}
                </option>
              ))}
            </select>
            <select className="input" value={bDay} onChange={(e) => setBDay(+e.target.value)}>
              <option value={0}>Day</option>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
        </Field>
        <Field label="In-city phone">
          <input className="input font-mono" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
        </Field>
        <Field label="About">
          <textarea className="input min-h-28" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

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
    <input
      className="input font-mono tracking-[0.4em]"
      type="password"
      inputMode="numeric"
      value={v}
      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      autoComplete={auto}
      required
    />
  );
  return (
    <Modal title="Change PIN" onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-ash">PIN changed. Your other devices will ask for the new one.</p>
          <button className="btn-gold" onClick={onClose}>
            Done
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
          <button className="btn-gold w-full">Change PIN</button>
        </form>
      )}
    </Modal>
  );
}

function BlacksiteRecord({ id }: { id: string }) {
  const sites = useCollection<Blacksite>('blacksites') ?? [];
  const r = records(sites).get(id);
  return (
    <Link to="/blacksites" className="hud flex gap-3 p-4 hover:bg-raised/40">
      <Crosshair className="mt-0.5 size-5 shrink-0 text-gold-500" />
      <div className="min-w-0 flex-1">
        <p className="font-hud font-bold text-gold-200">Blacksite record</p>
        {r ? (
          <div className="mt-1 grid grid-cols-4 gap-1 text-center">
            {[
              ['Fights', r.fights],
              ['Kills', r.kills],
              ['K/D', (r.kills / Math.max(1, r.downs)).toFixed(1)],
              ['MVPs', r.mvps],
            ].map(([l, v]) => (
              <div key={l}>
                <p className="font-mono text-lg text-gold-100">{v}</p>
                <p className="label">{l}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-smoke">No fights logged yet.</p>
        )}
      </div>
    </Link>
  );
}

const COMING = [
  { icon: Trophy, title: 'Titles & MVPs', text: 'Leaderboard titles and MVP crowns.' },
  { icon: Swords, title: 'Current loadout', text: 'What they’re carrying right now.' },
];

export default function Profile() {
  const { id = '' } = useParams();
  const { memberById, rankById, crewsOf, me, isOnline, presence, roster } = useHub();
  const m = memberById.get(id);
  const [editing, setEditing] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [customStatus, setCustomStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!m) return <Navigate to="/crews?tab=roster" replace />;
  const mine = m.id === me.id;
  const crews = crewsOf(m.id);
  const boss = m.reportsTo ? memberById.get(m.reportsTo) : undefined;
  const reports = roster.filter((x) => x.reportsTo === m.id);
  const on = isOnline(m.id);
  const status = presence.get(m.id)?.status;

  async function onAvatar(file?: File) {
    if (file) await updateProfile(m!.id, { avatar: await squareImage(file) });
  }

  return (
    <>
      <Link to="/crews?tab=roster" className="label mb-4 inline-flex items-center gap-1.5 hover:text-gold-300">
        <ArrowLeft className="size-3.5" /> Roster
      </Link>

      <section className="hud mb-6 overflow-hidden">
        <div className="scanlines flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
          <div className="relative">
            <Avatar member={m} size="xl" online={on} />
            {mine && (
              <>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute right-0 bottom-0 rounded-full bg-gold-400 p-1.5 text-void shadow"
                  title="Change picture"
                >
                  <Camera className="size-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onAvatar(e.target.files?.[0])} />
              </>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="foil font-display text-3xl font-bold sm:text-4xl">{m.name}</h1>
            {m.alias && <p className="text-ash italic">“{m.alias}”</p>}
            <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
              <RankBadge rank={rankById.get(m.rankId ?? '')} />
              {crews.map((c) => (
                <span key={c.id} className="inline-flex items-center gap-1">
                  {c.leaderId === m.id && <Crown className="size-3.5" style={{ color: c.color }} />}
                  <CrewChip crew={c} full />
                </span>
              ))}
            </div>
            <p className="mt-2 text-sm text-smoke">
              {on ? <span className="text-ok">● {status || 'Online now'}</span> : `Last seen ${ago(presence.get(m.id)?.at)}`}
              {m.joinedAt && <> · Joined {fmtDate(m.joinedAt)}</>}
            </p>
          </div>
          {mine && (
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn-ghost btn-sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" /> Edit
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setPinOpen(true)}>
                <KeyRound className="size-3.5" /> PIN
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {mine && (
            <Panel title="Your status">
              <div className="flex flex-wrap gap-2">
                {PRESENCE_STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setPresenceStatus(m.id, s === status ? '' : s)}
                    className={`chip px-3 py-1.5 text-xs ${s === status ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setPresenceStatus(m.id, customStatus.trim().slice(0, 24));
                  setCustomStatus('');
                }}
              >
                <input className="input" placeholder="Or type your own" maxLength={24} value={customStatus} onChange={(e) => setCustomStatus(e.target.value)} />
                <button className="btn-ghost">Set</button>
              </form>
            </Panel>
          )}
          <Panel title="Dossier">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="label">Answers to</dt>
                <dd className="mt-1">
                  {boss ? (
                    <Link to={`/members/${boss.id}`} className="font-semibold text-gold-100 hover:underline">
                      {boss.name}
                    </Link>
                  ) : (
                    <span className="text-smoke">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="label">In-city phone</dt>
                <dd className="mt-1 font-mono">{m.phone || <span className="text-smoke">—</span>}</dd>
              </div>
              <div>
                <dt className="label">Birthday</dt>
                <dd className="mt-1">{m.birthday ? `${BMONTHS[+m.birthday.slice(0, 2) - 1]} ${+m.birthday.slice(3)}` : <span className="text-smoke">—</span>}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="label">Runs</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {reports.length ? (
                    reports.map((r) => (
                      <Link key={r.id} to={`/members/${r.id}`} className="flex items-center gap-1.5 hover:underline">
                        <Avatar member={r} size="xs" /> {r.name}
                      </Link>
                    ))
                  ) : (
                    <span className="text-smoke">Nobody reports to them.</span>
                  )}
                </dd>
              </div>
              {m.bio && (
                <div className="sm:col-span-2">
                  <dt className="label">About</dt>
                  <dd className="mt-1 whitespace-pre-line text-ash">{m.bio}</dd>
                </div>
              )}
            </dl>
          </Panel>
        </div>
        <div className="space-y-3">
          <BlacksiteRecord id={m.id} />
          {COMING.map((c) => (
            <div key={c.title} className="hud flex gap-3 p-4 opacity-75">
              <c.icon className="mt-0.5 size-5 shrink-0 text-gold-500" />
              <div>
                <p className="font-hud font-bold text-gold-200">{c.title}</p>
                <p className="text-sm text-smoke">{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <Cabinet member={m} />
      </div>

      {editing && <EditProfile m={m} onClose={() => setEditing(false)} />}
      {pinOpen && <ChangePin onClose={() => setPinOpen(false)} />}
    </>
  );
}

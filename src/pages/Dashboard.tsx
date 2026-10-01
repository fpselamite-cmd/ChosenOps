import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Crest } from '../components/Crest';
import { Empty } from '../components/Field';
import { JournalCard } from '../components/Journal';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { Ornament, SectionTitle } from '../components/Ornament';
import { RankBadge } from '../components/RankBadge';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { useLore } from '../hooks/useLore';
import { db } from '../lib/firebase';
import { displayName, timeAgo } from '../lib/format';
import { compareWhen } from '../lib/lore';
import { LoreCard } from './lore/LoreIndex';

export default function Dashboard() {
  const { me, branding } = useAuth();
  const { can, members, ranks, rankById, settings } = useHub();
  const { lore, chronicle, journals } = useLore();
  const [editing, setEditing] = useState(false);

  const active = members.filter((m) => m.status === 'active');
  const leadershipRanks = ranks.slice(0, 3).map((r) => r.id);
  const leadership = active
    .filter((m) => m.rankId && leadershipRanks.includes(m.rankId))
    .sort((a, b) => (rankById.get(a.rankId!)?.order ?? 99) - (rankById.get(b.rankId!)?.order ?? 99));
  const canon = lore.filter((l) => l.canon).slice(0, 3);
  const recent = lore.filter((l) => !canon.includes(l)).slice(0, 6);
  const latestEvents = [...chronicle].sort((a, b) => compareWhen(b.when, a.when)).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'The night is long' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-edge bg-night/70 px-6 py-10 text-center sm:py-14">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 opacity-[0.08]">
          <Crest className="h-full w-full" spin />
        </div>
        <div className="relative">
          <Crest className="mx-auto h-28 w-28 sm:h-36 sm:w-36" />
          <p className="mt-5 text-xs uppercase tracking-[0.35em] text-smoke">
            {greeting}, {displayName(me)}
          </p>
          <h1 className="gold-text mt-2 text-4xl font-black sm:text-6xl">{branding.name}</h1>
          <p className="mt-2 font-display text-sm tracking-[0.3em] text-gold-400/80">{branding.motto}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-8">
            <Stat label="Members" value={active.length} to="/members" />
            <Stat label="Archive entries" value={lore.length} to="/archive" />
            <Stat label="Chronicled events" value={chronicle.length} to="/chronicle" />
            {can('approveMembers') && <Stat label="At the door" value={members.filter((m) => m.status === 'pending').length} to="/admin" />}
          </div>
        </div>
      </section>

      {me && !me.character?.characterName && (
        <Link to={`/members/${me.id}`} className="panel block border-gold-500/50 p-4 text-sm hover:border-gold-300">
          <span className="text-gold-200">Your file is empty.</span> <span className="text-smoke">Give your character a name, a portrait and a story →</span>
        </Link>
      )}

      <section className="panel p-6">
        <SectionTitle
          action={
            can('postAnnouncements') && (
              <button className="text-xs text-gold-300 hover:underline" onClick={() => setEditing(true)}>
                Edit
              </button>
            )
          }
        >
          Word from the Top
        </SectionTitle>
        {settings.announcement ? (
          <>
            <p className="whitespace-pre-wrap font-serif text-2xl leading-relaxed text-parchment">{settings.announcement}</p>
            {settings.announcementBy && (
              <p className="mt-3 text-xs text-smoke">
                — <MemberName id={settings.announcementBy} />, {timeAgo(settings.announcementAt)}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-smoke">Nothing posted.</p>
        )}
      </section>

      {canon.length > 0 && (
        <section>
          <SectionTitle
            action={
              <Link to="/archive?canon=1" className="text-xs text-gold-300 hover:underline">
                All canon →
              </Link>
            }
          >
            Canon
          </SectionTitle>
          <div className="grid gap-5 md:grid-cols-3">
            {canon.map((l) => (
              <LoreCard key={l.id} entry={l} />
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          action={
            <Link to="/archive" className="text-xs text-gold-300 hover:underline">
              The Archive →
            </Link>
          }
        >
          Lately in the Archive
        </SectionTitle>
        {recent.length ? (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map((l) => (
              <LoreCard key={l.id} entry={l} />
            ))}
          </div>
        ) : (
          <Empty>
            Nothing written yet.{' '}
            {can('writeLore') && (
              <Link to="/archive/new" className="text-gold-300 hover:underline">
                Write the first entry →
              </Link>
            )}
          </Empty>
        )}
      </section>

      <Ornament />

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="min-w-0 lg:col-span-3">
          <SectionTitle
            action={
              <Link to="/journals" className="text-xs text-gold-300 hover:underline">
                All journals →
              </Link>
            }
          >
            From the journals
          </SectionTitle>
          {journals.length ? (
            <div className="space-y-4">
              {journals.slice(0, 3).map((j) => (
                <JournalCard key={j.id} entry={j} showAuthor collapsed />
              ))}
            </div>
          ) : (
            <Empty>No journal entries yet.</Empty>
          )}
        </section>

        <div className="min-w-0 space-y-8 lg:col-span-2">
          <section className="panel p-5">
            <SectionTitle
              action={
                <Link to="/chronicle" className="text-xs text-gold-300 hover:underline">
                  Timeline →
                </Link>
              }
            >
              The Chronicle
            </SectionTitle>
            {latestEvents.length ? (
              <ol className="relative space-y-4 border-l border-gold-700/60 pl-5">
                {latestEvents.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2 w-2 rotate-45 border border-gold-300 bg-ink" />
                    <Link to={`/chronicle#${e.id}`} className="group block">
                      <div className="font-display text-[10px] uppercase tracking-[0.2em] text-gold-300">{e.whenLabel || e.when}</div>
                      <div className="text-sm text-bone group-hover:text-gold-200">{e.title}</div>
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-smoke">No events recorded.</p>
            )}
          </section>

          <section className="panel p-5">
            <SectionTitle
              action={
                <Link to="/members" className="text-xs text-gold-300 hover:underline">
                  Full family →
                </Link>
              }
            >
              Leadership
            </SectionTitle>
            {leadership.length ? (
              <ul className="space-y-3">
                {leadership.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <MemberName id={m.id}>
                      <Avatar member={m} size="md" ring={rankById.get(m.rankId!)?.order === 0} />
                    </MemberName>
                    <div className="min-w-0">
                      <MemberName id={m.id} />
                      <div className="mt-0.5">
                        <RankBadge rank={rankById.get(m.rankId!)} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">No one at the top yet.</p>
            )}
          </section>
        </div>
      </div>

      {editing && <AnnouncementEditor initial={settings.announcement ?? ''} onClose={() => setEditing(false)} uid={me!.id} />}
    </div>
  );
}

function Stat({ label, value, to }: { label: string; value: number | string; to?: string }) {
  const body = (
    <>
      <div className="font-display text-2xl font-bold text-gold-200">{value}</div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-smoke">{label}</div>
    </>
  );
  return to ? (
    <Link to={to} className="hover:opacity-80">
      {body}
    </Link>
  ) : (
    <div>{body}</div>
  );
}

function AnnouncementEditor({ initial, onClose, uid }: { initial: string; onClose: () => void; uid: string }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Post Announcement" onClose={onClose}>
      <textarea className="input min-h-40" value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn-gold"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await updateDoc(doc(db, 'settings', 'family'), { announcement: text.trim(), announcementBy: uid, announcementAt: serverTimestamp() });
              onClose();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          Post
        </button>
      </div>
    </Modal>
  );
}

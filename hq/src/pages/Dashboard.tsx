import { Crown, LayoutDashboard, Megaphone, Pencil, Users } from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLock } from '../components/AdminLock';
import { Avatar } from '../components/Avatar';
import { RankBadge } from '../components/Badges';
import { CrewEmblem } from '../components/CrewEmblem';
import { Empty } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat } from '../components/Page';
import { useHub } from '../hooks/useHub';
import { n } from '../noel/data';
import { NOEL_MAIN, NOELOPS_URL, useNoel, type NoelBucket, type NoelGrow, type NoelStash } from '../lib/noelops';
import { sumStock } from '../noel/store';
import { db } from '../lib/firebase';
import { ago } from '../lib/format';
import { BOARDS, monthKey, monthName, ranked, useBoards } from '../lib/boards';
import { Podium } from './HallOfFame';

function ThisMonth() {
  const { byId } = useBoards();
  const now = monthKey();
  return (
    <Panel title={`Leaderboards · ${monthName(now)}`} right={<Link to="/hall-of-fame" className="label hover:text-gold-300">Hall of Fame →</Link>}>
      <div className="grid gap-6 sm:grid-cols-2">
        {BOARDS.map((b) => (
          <div key={b.id}>
            <p className="label mb-3 text-center">{b.name}</p>
            <Podium rows={ranked(byId.get(now), b.id).slice(0, 3)} board={b} compact />
          </div>
        ))}
      </div>
    </Panel>
  );
}

function WordFromTheTop() {
  const { announcement, can, me } = useHub();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  return (
    <section className="hud relative overflow-hidden p-5 sm:p-6" style={{ background: 'linear-gradient(120deg, rgba(212,175,55,0.12), transparent 60%), #111112' }}>
      <div className="flex items-start justify-between gap-4">
        <p className="label flex items-center gap-2 text-gold-400">
          <Megaphone className="size-3.5" /> Word from the top
        </p>
        {can('postAnnouncements') && (
          <button
            className="text-smoke hover:text-gold-200"
            onClick={() => {
              setText(announcement?.text ?? '');
              setEditing(true);
            }}
            aria-label="Edit"
          >
            <Pencil className="size-4" />
          </button>
        )}
      </div>
      <p className="mt-3 font-hud text-xl leading-snug font-semibold text-gold-50 sm:text-2xl">{announcement?.text || 'Nothing from the top yet.'}</p>
      {announcement?.by && (
        <p className="mt-3 text-sm text-smoke">
          — <MemberName id={announcement.by} /> · {ago(announcement.at)}
        </p>
      )}
      {editing && (
        <Modal title="Word from the top" onClose={() => setEditing(false)}>
          <textarea className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus />
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button
              className="btn-gold"
              onClick={async () => {
                await setDoc(doc(db, 'settings', 'announcement'), { text: text.trim(), by: me.id, at: serverTimestamp() });
                setEditing(false);
              }}
            >
              Post
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

/** Bricks on hand across every place that counts in totals, live from NoelOps (opens it in a new tab). */
function BricksTile() {
  const stock = useNoel<Record<string, NoelBucket>>('stock').data;
  const stashes = useNoel<Record<string, NoelStash>>('stashes').data;
  const grows = useNoel<Record<string, NoelGrow>>('locations').data;
  const main = useNoel<{ excludeTotals?: boolean }>('settings/mainStash').data;
  const left = new Set<string>([
    ...(main?.excludeTotals ? [NOEL_MAIN] : []),
    ...Object.entries(stashes ?? {}).filter(([, x]) => x?.excludeTotals).map(([id]) => `%h${id}`),
    ...Object.entries(grows ?? {}).filter(([, x]) => x?.excludeTotals).map(([k]) => k),
  ]);
  const t = sumStock(Object.entries(stock ?? {}).filter(([k]) => !left.has(k)).map(([, v]) => v));
  return (
    <a href={NOELOPS_URL} target="_blank" rel="noopener" className="block">
      <Stat label="Bricks on hand" value={stock !== undefined ? n(t.bricks) : '—'} sub={`${n(t.potential)} ready to press · ${n(t.meth)} meth bins`} />
    </a>
  );
}

export default function Dashboard() {
  const { me, myCrews, roster, isOnline, rankById, ranks, settings, memberById, familyRep, canSee } = useHub();
  const online = roster.filter((m) => isOnline(m.id));
  const leadership = roster.filter((m) => rankById.get(m.rankId ?? '')?.leadership);
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const greet = hour < 5 ? 'Late night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';

  return (
    <>
      <PageHeader icon={LayoutDashboard} kicker={`${settings.name} · ${settings.motto}`} title={`${greet}, ${me.name}`} />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Family" value={roster.length} sub={`${ranks.length} ranks`} />
        <Stat label="Online now" value={<span className="text-ok">{online.length}</span>} />
        <Stat label="Family rep" value={familyRep.toLocaleString('en-US')} sub="Petty rep sent in + blacksites" />
        {canSee('narcotics') ? <BricksTile /> : <Stat label="Your crews" value={myCrews.length} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <WordFromTheTop />
          <ThisMonth />

          <Panel title="Your crews" right={<Link to="/crews" className="label hover:text-gold-300">All crews →</Link>}>
            {myCrews.length ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {myCrews.map((c) => {
                  const on = c.memberIds.filter((id) => isOnline(id)).length;
                  return (
                    <Link
                      key={c.id}
                      to={`/crews?crew=${c.id}`}
                      className="flex items-center gap-3 border border-line-soft bg-coal/60 p-3 transition hover:border-gold-700"
                      style={{ boxShadow: `inset 3px 0 0 ${c.color}` }}
                    >
                      <CrewEmblem crew={c} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-hud font-bold text-gold-100">{c.name}</span>
                        <span className="text-xs text-smoke">
                          {c.leaderId === me.id ? (
                            <span className="text-gold-300">
                              <Crown className="inline size-3" /> You lead
                            </span>
                          ) : (
                            <>Led by {memberById.get(c.leaderId ?? '')?.name ?? 'nobody'}</>
                          )}{' '}
                          · {c.memberIds.length} · <span className="text-ok">{on} on</span>
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <Empty icon={<Users className="size-7" />} title="Not in a crew yet">
                Crew leaders add people to their crews. Once you’re in one, its ops, timers and gear show up here.
              </Empty>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Leadership">
            <ul className="space-y-2">
              {leadership.map((m) => (
                <li key={m.id}>
                  <Link to={`/members/${m.id}`} className="flex items-center gap-3 hover:opacity-90">
                    <Avatar member={m} online={isOnline(m.id)} />
                    <span className="flex-1 truncate font-semibold text-gold-100">{m.name}</span>
                    <RankBadge rank={rankById.get(m.rankId ?? '')} />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title={`Online · ${online.length}`}>
            {online.length ? (
              <div className="flex flex-wrap gap-2">
                {online.map((m) => (
                  <Link key={m.id} to={`/members/${m.id}`} title={m.name}>
                    <Avatar member={m} size="md" online />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-smoke">Just you.</p>
            )}
          </Panel>
        </div>
      </div>
      <footer className="mt-10 flex items-center justify-center gap-3 text-[11px] text-smoke/60">
        <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold-700/40" />
        <AdminLock signedIn={{ id: me.id, admin: me.admin }} />
        <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold-700/40" />
      </footer>
    </>
  );
}

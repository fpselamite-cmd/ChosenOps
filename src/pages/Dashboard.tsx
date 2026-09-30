import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { Crest } from '../components/Crest';
import { Empty } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { RankBadge } from '../components/RankBadge';
import { StatTile } from '../components/StatTile';
import { useAuth } from '../hooks/useAuth';
import { useInventory, useLedger } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { CURRENCY_META, displayName, formatAmount, timeAgo } from '../lib/format';

export default function Dashboard() {
  const { me, branding } = useAuth();
  const { can, members, ranks, rankById, settings } = useHub();
  const canBudget = can('viewBudget');
  const { transactions, totals } = useLedger(canBudget);
  const { items } = useInventory();
  const [editing, setEditing] = useState(false);

  const active = members.filter((m) => m.status === 'active');
  const leadershipRanks = ranks.slice(0, 3).map((r) => r.id);
  const leadership = active
    .filter((m) => m.rankId && leadershipRanks.includes(m.rankId))
    .sort((a, b) => (rankById.get(a.rankId!)?.order ?? 99) - (rankById.get(b.rankId!)?.order ?? 99));
  const recentItems = [...(items ?? [])].sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0)).slice(0, 5);
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <section className="panel relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-10 opacity-[0.07]">
          <Crest className="h-72 w-72" />
        </div>
        <div className="relative flex flex-wrap items-center gap-6">
          <Crest className="h-20 w-20 sm:h-24 sm:w-24" />
          <div className="min-w-[14rem] flex-1">
            <p className="text-xs uppercase tracking-[0.3em] text-smoke">
              {greeting}, {displayName(me)}
            </p>
            <h1 className="gold-text mt-1 text-3xl font-black sm:text-5xl">{branding.name}</h1>
            <p className="mt-1 font-display text-sm tracking-[0.25em] text-gold-400/80">{branding.motto}</p>
          </div>
          <div className="flex w-full justify-around gap-6 text-center sm:w-auto">
            <Stat label="Members" value={active.length} />
            <Stat label="Items" value={items?.length ?? '—'} />
            {can('approveMembers') && <Stat label="Pending" value={members.filter((m) => m.status === 'pending').length} to="/admin" />}
          </div>
        </div>
      </section>

      {me && !me.character?.characterName && (
        <Link to={`/members/${me.id}`} className="panel block border-gold-500/50 p-4 text-sm hover:border-gold-300">
          <span className="text-gold-200">Your file is empty.</span> <span className="text-smoke">Add your character name, picture and details →</span>
        </Link>
      )}

      <section className="panel p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="panel-title">Word from the Top</h2>
          {can('postAnnouncements') && (
            <button className="text-xs text-gold-300 hover:underline" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
        {settings.announcement ? (
          <>
            <p className="whitespace-pre-wrap font-display text-lg leading-relaxed text-bone">{settings.announcement}</p>
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

      {canBudget && (
        <section className="grid gap-4 sm:grid-cols-3">
          <StatTile type="clean" value={totals.clean} hint="Legit, bankable" />
          <StatTile type="dirty" value={totals.dirty} hint="Needs washing" />
          <StatTile type="rep" value={totals.rep} hint="Standing on the streets" />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="panel min-w-0 p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="panel-title">Leadership</h2>
            <Link to="/members" className="text-xs text-gold-300 hover:underline">
              Full family →
            </Link>
          </div>
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
            <Empty>No one at the top yet.</Empty>
          )}
        </section>

        <div className="min-w-0 space-y-6 lg:col-span-3">
          {canBudget && (
            <section className="panel p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="panel-title">Recent Money Moves</h2>
                <Link to="/budget" className="text-xs text-gold-300 hover:underline">
                  Treasury →
                </Link>
              </div>
              {transactions?.length ? (
                <ul className="divide-y divide-edge">
                  {transactions.slice(0, 5).map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2 text-sm">
                      <span className={`hidden w-24 shrink-0 text-xs sm:inline ${CURRENCY_META[t.type].color}`}>{CURRENCY_META[t.type].label}</span>
                      <span className="min-w-0 flex-1 truncate">{t.reason}</span>
                      <span className={`font-semibold ${t.amount < 0 ? 'text-red-400' : CURRENCY_META[t.type].color}`}>
                        {formatAmount(t.type, t.amount, true)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No transactions yet.</Empty>
              )}
            </section>
          )}

          <section className="panel p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="panel-title">Stash Activity</h2>
              <Link to="/inventory" className="text-xs text-gold-300 hover:underline">
                Inventory →
              </Link>
            </div>
            {recentItems.length ? (
              <ul className="divide-y divide-edge">
                {recentItems.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                    <span className="w-24 shrink-0 truncate text-xs text-smoke">{i.category}</span>
                    <span className="min-w-0 flex-1 truncate">{i.name}</span>
                    <span className="font-semibold text-gold-200">×{i.quantity}</span>
                    <span className="hidden w-20 text-right text-xs text-smoke sm:block">{timeAgo(i.updatedAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>The stash is empty.</Empty>
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

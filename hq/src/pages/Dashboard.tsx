import { collection, doc, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore';
import {
  Cake,
  CheckCircle2,
  Crosshair,
  Crown,
  Gift,
  HelpCircle,
  LayoutDashboard,
  Lock,
  Megaphone,
  Newspaper,
  Pencil,
  Sparkles,
  Star,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AdminLock } from '../components/AdminLock';
import { Avatar } from '../components/Avatar';
import { RankBadge } from '../components/Badges';
import { Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat } from '../components/Page';
import { PettyRing } from '../components/PettyRing';
import { StreakBadge } from '../components/Streak';
import { Trophy } from '../components/Trophy';
import { useCollection, useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { useVisible } from '../lib/audience';
import { mvps, RESULTS, type Blacksite } from '../lib/blacksites';
import { BOARDS, monthKey, monthName, ranked, useBoards } from '../lib/boards';
import { useCabinet } from '../lib/cabinet';
import { addDays, et, fromET, keyOf, occurrences, rsvp, timeLabel, type CalEvent, type Rsvp } from '../lib/calendar';
import { db } from '../lib/firebase';
import { ago, fmtDate, TZ, TZ_LABEL } from '../lib/format';
import { KitStrip } from '../components/Kit';
import type { Signout, Trade } from '../lib/locker';
import type { Nudge } from '../lib/stash';
import { dismissWelcome, type Welcome } from '../lib/adminData';
import type { DuesPay, DuesWeek } from '../lib/books';
import { myDuesOwed } from './money/Dues';
import { fmtDue, KINDS } from './money/duesCalc';
import { LowStockLine } from './Stash';
import { useMoney } from '../lib/money';
import { BASICS, CITY, LOOKS, STORY, type Sheet } from '../lib/sheet';
import { cashText, thingsText, type Trade2 } from '../lib/trades';
import { isNarcoTrophy, type TrophyDoc } from '../lib/trophies';
import type { Member, RepTransfer } from '../lib/types';
import { Podium } from './HallOfFame';
import { MoodPicker } from './Profile';
import { MyProgress, NewlyPatched, PatchMoment } from './welcome/DashboardBits';
import { OpenPolls } from './polls/PollsBits';
import { useAttention } from './admin/useAttention';
import { PartyBanner } from './parties/Parties';
import { LiveHeistBanner } from './Heists';
import { RunsTile } from './NarcoRuns';
import { useWelcomeAccess, useWelcomeAttention } from './welcome/useWelcome';

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
/** Same pick for everyone on the same day. */
const seeded = (seed: string, n: number) => {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return n ? Math.abs(h) % n : 0;
};

// ---------- hero ----------

function Hero() {
  const { me, myRank, presence, narco } = useHub();
  const { byId } = useBoards();
  const month = byId.get(monthKey());
  const place = (b: 'sales' | 'bricks') => ranked(month, b).find((r) => r.memberId === me.id)?.place;
  return (
    <section className="hud relative overflow-hidden p-5">
      <div className="pointer-events-none absolute -top-16 -right-16 size-56 rounded-full bg-gold-400/10 blur-3xl" />
      <div className="flex items-start gap-4">
        <Link to={`/members/${me.id}`} className="shrink-0">
          <Avatar member={me} size="xl" online />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="label text-gold-500">Your character</p>
          <Link to={`/members/${me.id}`} className="foil block truncate font-display text-2xl font-bold hover:opacity-90">
            {me.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
            <RankBadge rank={myRank} />
            <span className="text-smoke">{presence.get(me.id)?.status || 'No mood set'}</span>
            <MoodPicker id={me.id} status={presence.get(me.id)?.status} />
          </div>
        </div>
      </div>
      {narco && <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="border border-line-soft bg-coal/60 px-3 py-2">
          <p className="label">My sales · {monthName(monthKey(), true)}</p>
          <p className="font-mono text-lg text-gold-100">
            {money(month?.sales?.[me.id] ?? 0)} {place('sales') && <span className="text-xs text-gold-400">#{place('sales')}</span>}
          </p>
        </div>
        <div className="border border-line-soft bg-coal/60 px-3 py-2">
          <p className="label">My bricks pressed</p>
          <p className="font-mono text-lg text-gold-100">
            {(month?.bricks?.[me.id] ?? 0).toLocaleString('en-US')} {place('bricks') && <span className="text-xs text-gold-400">#{place('bricks')}</span>}
          </p>
        </div>
      </div>}
      <div className="mt-3">
        <KitStrip memberId={me.id} />
      </div>
    </section>
  );
}

// ---------- spotlight ----------

interface Spot {
  id: string;
  memberId?: string;
  why?: string;
  day?: string;
  by?: string;
}

function funFact(s: Sheet | null | undefined, day: string): [string, string] | null {
  if (!s) return null;
  const lines: [string, string][] = [];
  const add = (list: readonly (readonly [string, string])[], o?: Partial<Record<string, string>>) => list.forEach(([k, l]) => o?.[k]?.trim() && lines.push([l, o[k]!.trim()]));
  add(BASICS, s.basics);
  add(LOOKS, s.looks);
  add(CITY, s.city);
  add(
    STORY.filter(([k]) => k === 'goals' || k === 'fears'),
    s.story,
  );
  (s.customFields ?? []).forEach((f) => f.label && f.value && lines.push([f.label, f.value]));
  return lines.length ? lines[seeded(day + 'fact', lines.length)]! : null;
}

function PickSpotlight({ onClose }: { onClose: () => void }) {
  const { roster, me } = useHub();
  const [who, setWho] = useState('');
  const [why, setWhy] = useState('');
  return (
    <Modal title="Put someone in the spotlight" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!who) return;
          await setDoc(doc(db, 'spotlight', 'today'), { memberId: who, why: why.trim().slice(0, 140), day: keyOf(Date.now()), by: me.id });
          onClose();
        }}
      >
        <Field label="Who">
          <select className="input" value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Pick someone…</option>
            {roster.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why" hint="Shows on the spotlight today. Optional.">
          <input className="input" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={140} placeholder="e.g. Held the docks alone for 20 minutes" />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Spotlight them</button>
        </div>
      </form>
    </Modal>
  );
}

function Spotlight() {
  const { roster, memberById, can } = useHub();
  const today = keyOf(Date.now());
  const pick = useDoc<Spot>('spotlight/today');
  const [picking, setPicking] = useState(false);
  const chosen = pick?.day === today && pick.memberId ? memberById.get(pick.memberId) : undefined;
  const pool = [...roster].sort((a, b) => a.id.localeCompare(b.id));
  const m: Member | undefined = chosen ?? pool[seeded(today, pool.length)];
  const sheet = useDoc<Sheet>(`sheets/${m?.id ?? '_'}`, !!m);
  const { trophies } = useCabinet(m?.id ?? '_');
  if (!m) return null;
  const best = trophies[0] as TrophyDoc | undefined;
  const fact = funFact(sheet, today);
  const quote = sheet?.story?.quote?.trim();
  return (
    <section className="hud relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgb(var(--acc)/0.18),transparent_60%)]" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="label flex items-center gap-1.5 text-gold-400">
          <Sparkles className="size-3.5" /> Spotlight {chosen ? '· picked by leadership' : '· today'}
        </p>
        {can('manageMembers') && (
          <button className="text-xs text-smoke hover:text-gold-200" onClick={() => setPicking(true)}>
            <Pencil className="mr-1 inline size-3" />
            Pick
          </button>
        )}
      </div>
      <Link to={`/members/${m.id}`} className="relative mt-3 flex items-center gap-4">
        <span className="spotlight-ring rounded-full">
          <Avatar member={m} size="lg" />
        </span>
        <span className="min-w-0">
          <span className="foil block truncate font-display text-xl font-bold">{m.name}</span>
          {m.alias && <span className="block text-sm text-ash italic">“{m.alias}”</span>}
        </span>
        {best && (
          <span className="ml-auto shrink-0" title={best.title}>
            <Trophy design={best.design} tier={best.tier} size={54} title={best.title} />
          </span>
        )}
      </Link>
      {chosen && pick?.why && <p className="relative mt-3 border-l-2 border-gold-500 pl-3 text-sm text-gold-100">{pick.why}</p>}
      {quote && <p className="relative mt-3 font-display text-base text-gold-200 italic">“{quote}”</p>}
      {fact && (
        <p className="relative mt-2 text-xs text-smoke">
          <span className="label">{fact[0]}:</span> <span className="text-ash">{fact[1]}</span>
        </p>
      )}
      {picking && <PickSpotlight onClose={() => setPicking(false)} />}
    </section>
  );
}

// ---------- tiles ----------

function MoneyTile() {
  const { can } = useHub();
  const m = useMoney();
  if (!m.ready) return <Stat label="Money" value="—" />;
  return can('money') ? (
    <Link to="/blackmarket" className="block">
      <Stat label="Gang bank" value={money(m.bank)} sub="Sales in, minus payouts & expenses" />
    </Link>
  ) : (
    <Link to="/blackmarket?tab=wash" className="block">
      <Stat label="My dirty money" value={<span className="text-red-300">{money(m.mine.held)}</span>} sub="Not washed yet" />
    </Link>
  );
}

// ---------- briefing ----------

function Briefing() {
  const { memberById, rankById, narco } = useHub();
  const yesterday = addDays(keyOf(Date.now()), -1);
  const daily = useDoc<{ sales?: Record<string, number> }>(`daily/${yesterday}`);
  const sites = useCollection<Blacksite>('blacksites');
  const weekAgo = useMemo(() => Timestamp.fromMillis(Date.now() - 7 * 86400e3), []);
  const dayAgo = useMemo(() => Timestamp.fromMillis(Date.now() - 86400e3), []);
  const newsQ = useMemo(() => query(collection(db, 'news'), where('at', '>=', weekAgo)), [weekAgo]);
  const news = useCollection<{ id: string; kind: 'joined' | 'promoted'; memberId: string; rankId: string; at?: Timestamp }>(newsQ) ?? [];
  const tq = useMemo(() => query(collection(db, 'trophies'), where('at', '>=', dayAgo)), [dayAgo]);
  const trophies = (useCollection<TrophyDoc>(tq) ?? []).filter((t) => narco || !isNarcoTrophy(t)).sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const sellers = Object.entries(daily?.sales ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const total = sellers.reduce((t, [, v]) => t + v, 0);
  const last = [...(sites ?? [])].sort((a, b) => b.at.toMillis() - a.at.toMillis())[0];
  const lastMvp = last ? mvps(last).ids : [];
  const Item = ({ icon, kicker, children }: { icon: ReactNode; kicker: string; children: ReactNode }) => (
    <div className="border-b border-line-soft py-3 last:border-0">
      <p className="label mb-1 flex items-center gap-1.5 text-gold-500">
        {icon} {kicker}
      </p>
      <div className="text-sm text-ash">{children}</div>
    </div>
  );
  return (
    <section className="hud p-5">
      <div className="flex items-baseline justify-between border-b-2 border-double border-gold-700/60 pb-2">
        <h2 className="flex items-center gap-2 font-display text-2xl font-bold tracking-wide text-gold-100">
          <Newspaper className="size-5 text-gold-400" /> The Chosen Times
        </h2>
        <span className="label">{fmtDate(Timestamp.now())}</span>
      </div>
      <div className="grid gap-x-6 sm:grid-cols-2">
        {narco && (
          <Item icon={<Crown className="size-3" />} kicker="Yesterday’s top seller">
            {sellers.length ? (
              <>
                <MemberName id={sellers[0]![0]} className="font-semibold" /> moved <b className="text-gold-200">{money(sellers[0]![1])}</b>. The family sold <b className="text-gold-200">{money(total)}</b> in all.
              </>
            ) : (
              'Quiet day. Nothing sold yesterday.'
            )}
          </Item>
        )}
        <Item icon={<Crosshair className="size-3" />} kicker="Last blacksite">
          {last ? (
            <>
              <Link to="/blacksites" className="font-semibold text-gold-100 hover:underline">
                {last.zone}
              </Link>{' '}
              · {RESULTS.find((r) => r.id === last.result)?.label ?? last.result} · {ago(last.at)}
              {lastMvp.length > 0 && (
                <>
                  {' '}
                  · MVP{' '}
                  {lastMvp.map((id, i) => (
                    <span key={id}>
                      {i > 0 && ', '}
                      <MemberName id={id} />
                    </span>
                  ))}
                </>
              )}
              {last.rep ? <> · {last.repStatus === 'confirmed' ? `+${last.rep} rep` : `${last.rep} rep pending`}</> : null}
            </>
          ) : (
            'No fights logged yet.'
          )}
        </Item>
        <Item icon={<Users className="size-3" />} kicker="New in the family">
          {news.length ? (
            <ul className="space-y-0.5">
              {news.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <MemberName id={n.memberId} className="font-semibold" /> {n.kind === 'joined' ? 'joined as' : 'was promoted to'} {rankById.get(n.rankId)?.name ?? n.rankId}
                  <span className="text-smoke"> · {ago(n.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            'No new faces this week.'
          )}
        </Item>
        <Item icon={<Star className="size-3" />} kicker="New trophies">
          {trophies.length ? (
            <ul className="space-y-0.5">
              {trophies.slice(0, 5).map((t) => (
                <li key={t.id}>
                  {memberById.get(t.memberId)?.name ?? 'Someone'} earned <span className="text-gold-200">{t.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            'None in the last day.'
          )}
        </Item>
      </div>
    </section>
  );
}

// ---------- up next, birthdays, to-dos ----------

function useUpcoming(days: number) {
  const events = useVisible<CalEvent>('events');
  return useMemo(() => {
    const from = keyOf(Date.now());
    const to = addDays(from, days);
    const now = Date.now();
    return (events ?? [])
      .flatMap((e) => occurrences(e, from, to))
      .filter((o) => o.at.getTime() + (o.event?.mins ?? 60) * 60e3 > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
  }, [events, days]);
}

function UpNext() {
  const { me } = useHub();
  const next = useUpcoming(21).slice(0, 3);
  const btn = (e: CalEvent, v: Rsvp, Icon: typeof CheckCircle2, label: string, on: string) => (
    <button
      onClick={() => rsvp(e.id, me.id, v)}
      title={label}
      className={`flex items-center gap-1 border px-2 py-0.5 text-[11px] transition ${e.rsvp?.[me.id] === v ? on : 'border-line text-smoke hover:text-gold-200'}`}
    >
      <Icon className="size-3" /> {label}
    </button>
  );
  return (
    <Panel title="Up next" right={<Link to="/calendar" className="label hover:text-gold-300">Calendar →</Link>}>
      {next.length ? (
        <ul className="space-y-3">
          {next.map((o) => (
            <li key={o.key} className="border-l-2 pl-3" style={{ borderColor: o.color }}>
              <p className="font-semibold text-gold-100">{o.title}</p>
              <p className="text-xs text-smoke">
                {o.at.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' })} · {timeLabel(o.at)} {TZ_LABEL}{o.sub ? ` · ${o.sub}` : ''}
              </p>
              {o.event && (
                <div className="mt-1.5 flex gap-1">
                  {btn(o.event, 'yes', CheckCircle2, 'Going', 'border-ok/60 bg-ok/10 text-ok')}
                  {btn(o.event, 'maybe', HelpCircle, 'Maybe', 'border-amber-400/60 bg-amber-400/10 text-amber-300')}
                  {btn(o.event, 'no', XCircle, 'Can’t', 'border-red-400/60 bg-red-400/10 text-red-300')}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-smoke">Nothing on the calendar yet.</p>
      )}
    </Panel>
  );
}

function Birthdays() {
  const { roster } = useHub();
  const today = keyOf(Date.now());
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));
  const rows: { m: Member; day: string; kind: 'birthday' | 'anniversary'; years?: number }[] = [];
  roster.forEach((m) => {
    week.forEach((d) => {
      if (m.birthday && d.slice(5) === m.birthday) rows.push({ m, day: d, kind: 'birthday' });
      if (m.joinedAt) {
        const j = et(m.joinedAt.toDate());
        const years = +d.slice(0, 4) - j.y;
        if (years >= 1 && d.slice(5) === `${String(j.m).padStart(2, '0')}-${String(j.d).padStart(2, '0')}`) rows.push({ m, day: d, kind: 'anniversary', years });
      }
    });
  });
  rows.sort((a, b) => a.day.localeCompare(b.day));
  return (
    <Panel title="Birthdays & anniversaries">
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.m.id + r.kind}>
              <Link to={`/members/${r.m.id}`} className="flex items-center gap-2 hover:opacity-90">
                <Avatar member={r.m} size="sm" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="text-gold-100">{r.m.name}</span>{' '}
                  <span className="text-smoke">{r.kind === 'birthday' ? 'birthday' : `${r.years} year${r.years === 1 ? '' : 's'} in the family`}</span>
                </span>
                <span className={`flex items-center gap-1 text-xs ${r.day === today ? 'font-bold text-gold-300' : 'text-smoke'}`}>
                  {r.kind === 'birthday' ? <Cake className="size-3.5" /> : <Gift className="size-3.5" />}
                  {r.day === today ? 'Today!' : fromET(+r.day.slice(0, 4), +r.day.slice(5, 7), +r.day.slice(8)).toLocaleDateString('en-US', { weekday: 'short', timeZone: TZ })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-smoke">None this week.</p>
      )}
    </Panel>
  );
}

function Todos() {
  const { me, can, narco } = useHub();
  const tradesQ = useMemo(() => query(collection(db, 'trades'), where('to', '==', me.id), where('status', '==', 'pending')), [me.id]);
  const trades = useCollection<Trade>(tradesQ) ?? [];
  const outQ = useMemo(() => query(collection(db, 'signouts'), where('memberId', '==', me.id), where('status', '==', 'out')), [me.id]);
  const out = useCollection<Signout>(outQ) ?? [];
  const sitesQ = useMemo(() => query(collection(db, 'blacksites'), where('participants', 'array-contains', me.id)), [me.id]);
  const mySites = useCollection<Blacksite>(sitesQ) ?? [];
  const pendingQ = useMemo(() => query(collection(db, 'members'), where('status', '==', 'pending')), []);
  const pendingMembers = useCollection<Member>(pendingQ, can('approveMembers')) ?? [];
  const repQ = useMemo(() => query(collection(db, 'repTransfers'), where('status', '==', 'pending')), []);
  const reps = useCollection<RepTransfer>(repQ, can('confirmRep')) ?? [];
  const allSites = useCollection<Blacksite>('blacksites', can('confirmRep')) ?? [];
  const duesWeeks = useCollection<DuesWeek>('duesWeeks') ?? [];
  const duesPays = useCollection<DuesPay>('duesPay') ?? [];
  const allTransfers = useCollection<RepTransfer>('repTransfers') ?? [];
  const nudgeQ = useMemo(() => query(collection(db, 'nudges'), where('to', '==', me.id)), [me.id]);
  const nudges = useCollection<Nudge>(nudgeQ) ?? [];
  const upcoming = useUpcoming(7);
  const recent = (s: Blacksite) => Date.now() - s.at.toMillis() < 7 * 86400e3;
  const items: { to: string; text: string; group: string }[] = [];
  trades.forEach((t) => {
    const x = t as unknown as Trade2;
    const what = x.v === 2 ? [thingsText(x.things, narco), cashText(x.cash)].filter(Boolean).join(' + ') || 'a trade' : `${t.thing?.qty} × ${t.thing?.label}`;
    items.push({ group: 'Mine', to: '/locker', text: `${t.fromName} is offering you ${what}` });
  });
  mySites.filter(recent).forEach((s) => {
    if (!s.stats?.[me.id]) items.push({ group: 'Mine', to: '/blacksites', text: `Fill in your stats for ${s.zone}` });
    if (!s.votes?.[me.id] && s.participants.length > 1) items.push({ group: 'Mine', to: '/blacksites', text: `Vote the MVP for ${s.zone}` });
    if (s.lootStatus === 'open' && (!s.closesAt || s.closesAt.toMillis() > Date.now())) items.push({ group: 'Mine', to: '/blacksites', text: `Loot is up for grabs from ${s.zone}` });
  });
  nudges.forEach((n) => items.push({ group: 'Mine', to: '/locker', text: `${n.fromName}: ${n.text}` }));
  const owesDues = myDuesOwed(me.id, duesWeeks, allTransfers, duesPays);
  const owesText = KINDS.filter((k) => owesDues[k]).map((k) => `${fmtDue(k, owesDues[k])} ${k}`);
  if (owesText.length) items.push({ group: 'Mine', to: '/money?tab=dues', text: `You owe dinner dues: ${owesText.join(', ')}` });
  const cashWaiting = can('money') ? duesPays.filter((p) => p.status === 'pending').length : 0;
  if (cashWaiting) items.push({ group: 'Leadership', to: '/money?tab=dues', text: `${cashWaiting} dues ${cashWaiting === 1 ? 'payment' : 'payments'} to confirm` });
  if (out.length) items.push({ group: 'Mine', to: '/locker', text: `You still have ${out.length} signed-out ${out.length === 1 ? 'item' : 'items'} from the stash` });
  const wl = useWelcomeAttention();
  if (wl.stamps) items.push({ group: 'Welcome', to: '/welcome?tab=associates', text: `${wl.stamps} associate ${wl.stamps === 1 ? 'operation' : 'operations'} to sign off` });
  if (wl.recs) items.push({ group: 'Leadership', to: '/welcome?tab=associates', text: `${wl.recs} ${wl.recs === 1 ? 'associate is' : 'associates are'} recommended to be blooded in` });
  if (pendingMembers.length) items.push({ group: 'Leadership', to: '/welcome?tab=door', text: `${pendingMembers.length} ${pendingMembers.length === 1 ? 'person is' : 'people are'} waiting at the door` });
  if (reps.length) items.push({ group: 'Leadership', to: '/petty-crime', text: `${reps.length} petty rep ${reps.length === 1 ? 'transfer' : 'transfers'} to confirm` });
  const siteRep = allSites.filter((s) => s.repStatus === 'pending' && s.rep > 0).length;
  if (siteRep) items.push({ group: 'Leadership', to: '/blacksites', text: `${siteRep} blacksite rep ${siteRep === 1 ? 'claim' : 'claims'} to confirm` });
  const seen = new Set<string>();
  upcoming.forEach((o) => {
    if (o.event && !o.event.rsvp?.[me.id] && !seen.has(o.event.id)) {
      seen.add(o.event.id);
      items.push({ group: 'Events', to: '/calendar', text: `RSVP to ${o.title} (${o.at.toLocaleDateString('en-US', { timeZone: TZ, weekday: 'short' })})` });
    }
  });
  const groups = ['Mine', 'Welcome', 'Leadership', 'Events'].map((g) => [g, items.filter((i) => i.group === g)] as const).filter(([, l]) => l.length);
  return (
    <Panel title={`Waiting on you${items.length ? ` · ${items.length}` : ''}`}>
      {groups.length ? (
        <div className="space-y-3">
          {groups.map(([g, list]) => (
            <div key={g}>
              <p className="label mb-1 text-gold-500">{g}</p>
              <ul className="space-y-1">
                {list.map((i, k) => (
                  <li key={k}>
                    <Link to={i.to} className="flex items-start gap-2 text-sm text-ash hover:text-gold-200">
                      <span className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-gold-400" />
                      {i.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-smoke">
          <CheckCircle2 className="size-4 text-ok" /> All caught up.
        </p>
      )}
      {can('manageOps') && narco && <LowStockLine />}
    </Panel>
  );
}

/** A newcomer's welcome note from whoever let them in, until they dismiss it. */
function WelcomeNote() {
  const { me } = useHub();
  const w = useDoc<Welcome>(`welcomes/${me.id}`);
  if (!w) return null;
  return (
    <div className="hud mb-6 flex items-start gap-3 border-gold-400/50 p-4">
      <Sparkles className="mt-0.5 size-5 shrink-0 text-gold-300" />
      <div className="min-w-0 flex-1">
        <p className="label text-gold-400">Welcome to the family</p>
        <p className="mt-1 text-gold-100">“{w.text}”</p>
        <p className="mt-1 text-xs text-smoke">— {w.byName}</p>
      </div>
      <button className="btn-ghost btn-sm" onClick={() => dismissWelcome(me.id)}>
        Thanks
      </button>
    </div>
  );
}

// ---------- the rest ----------

/** Both monthly boards are narcotics (drug sales, bricks pressed), so only Narco sees them. */
function ThisMonth() {
  const { narco } = useHub();
  const { byId } = useBoards();
  const now = monthKey();
  if (!narco) return null;
  return (
    <Panel title={`Leaderboards · ${monthName(now)}`} right={<Link to="/hall-of-fame" className="label hover:text-gold-300">Hall of Fame →</Link>}>
      <div className="grid gap-8 sm:grid-cols-2">
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

export default function Dashboard() {
  const { me, roster, isOnline, rankById, ranks, settings, familyRep, can } = useHub();
  const canAdmin = can('approveMembers') || can('manageMembers') || can('manageRanks') || can('manageSettings');
  const waiting = useAttention().reduce((t, a) => t + a.n, 0);
  const online = roster.filter((m) => isOnline(m.id));
  const leadership = roster.filter((m) => rankById.get(m.rankId ?? '')?.leadership);
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: TZ, hour: 'numeric', hour12: false }));
  const greet = hour < 5 ? 'Late night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const { isAssoc } = useWelcomeAccess();
  const locked = !!(useLocation().state as { locked?: boolean } | null)?.locked;
  const footer = (
    <footer className="mt-10 flex items-center justify-center gap-3 text-[11px] text-smoke/60">
      <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold-700/40" />
      <AdminLock signedIn={{ id: me.id, admin: me.admin }} canOpen={canAdmin} badge={canAdmin || me.admin ? waiting : 0} />
      <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold-700/40" />
    </footer>
  );

  // Associates: their progress and the welcome bits, nothing about the family's business.
  if (isAssoc)
    return (
      <>
        <PageHeader icon={LayoutDashboard} kicker={`${settings.name} · ${settings.motto}`} title={`${greet}, ${me.name}`} actions={<StreakBadge />} />
        {locked && <p className="hud mb-6 flex items-center gap-2 border-gold-600/50 p-3 text-sm text-gold-100"><Lock className="size-4 text-gold-400" /> That opens once you’re blooded in.</p>}
        <WelcomeNote />
        <div className="mx-auto max-w-2xl space-y-6">
          <MyProgress />
        </div>
        {footer}
      </>
    );

  return (
    <>
      <PageHeader icon={LayoutDashboard} kicker={`${settings.name} · ${settings.motto}`} title={`${greet}, ${me.name}`} actions={
          <div className="flex items-center gap-2">
            <PettyRing />
            <StreakBadge />
          </div>
        } />

      <PartyBanner />
      <LiveHeistBanner />
      <PatchMoment />
      <NewlyPatched />
      <WelcomeNote />
      <OpenPolls />
      <div className="mb-6 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        <Hero />
        <Spotlight />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-flow-col lg:auto-cols-fr">
        <Stat label="Family" value={roster.length} sub={`${ranks.length} ranks`} />
        <Stat label="Online now" value={<span className="text-ok">{online.length}</span>} />
        <Stat label="Family rep" value={familyRep.toLocaleString('en-US')} sub="Petty rep sent in + blacksites" />
        <MoneyTile />
        <RunsTile />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <WordFromTheTop />
          <Briefing />
          <ThisMonth />

        </div>

        <div className="space-y-6">
          <MyProgress />
          <Todos />
          <UpNext />
          <Birthdays />
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
      {footer}
    </>
  );
}

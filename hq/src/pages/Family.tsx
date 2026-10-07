import { Cake, Crown, LayoutGrid, Minus, Network, Plus, RotateCcw, Search, Sparkles, Table2, X } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent, type WheelEvent } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { RankBadge } from '../components/Badges';
import { FamilyCard, type FamilyCardDoc } from '../components/FamilyCard';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat, Tabs } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { et } from '../lib/calendar';
import { ago, fmtDate } from '../lib/format';
import type { Sheet } from '../lib/sheet';
import { starStyle } from '../lib/stars';
import type { Member, Rank } from '../lib/types';
import { RoleChips } from '../components/RoleChips';

type View = 'sky' | 'roster' | 'tiers' | 'cards';

const days = (m: Member) => (m.joinedAt ? Math.max(0, Math.floor((Date.now() - m.joinedAt.toMillis()) / 86400e3)) : 0);
const tenure = (d: number) => (d >= 365 ? `${Math.floor(d / 365)}y ${Math.floor((d % 365) / 30)}m` : d >= 30 ? `${Math.floor(d / 30)}m ${d % 30}d` : `${d}d`);
/** Same small offset for the same person every time. */
const jitter = (id: string, salt: number) => {
  let h = 2166136261 ^ salt;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000 - 0.5;
};

// ---------- the sky ----------

interface Star {
  m: Member;
  x: number;
  y: number;
  r: number;
  tier: number;
}

function useSky(roster: Member[], ranks: Rank[]) {
  return useMemo(() => {
    const W = 1200;
    const tiers = ranks.map((r) => roster.filter((m) => m.rankId === r.id)).filter((t) => t.length);
    const unranked = roster.filter((m) => !ranks.some((r) => r.id === m.rankId));
    if (unranked.length) tiers.push(unranked);
    const stars: Star[] = [];
    tiers.forEach((people, ti) => {
      const order = ranks.findIndex((r) => r.id === people[0]!.rankId);
      const r = Math.max(6, 20 - Math.max(0, order) * 2);
      people
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((m, j) => {
          const slot = W / people.length;
          stars.push({ m, tier: ti, r, x: slot * (j + 0.5) + jitter(m.id, 1) * slot * 0.45, y: 90 + ti * 120 + jitter(m.id, 2) * 46 });
        });
    });
    // Each star reaches up to the nearest star in the rank above.
    const lines = stars
      .filter((s) => s.tier > 0)
      .map((s) => {
        const up = stars.filter((o) => o.tier === s.tier - 1).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0]!;
        return { a: up, b: s };
      });
    return { stars, lines, height: 90 + tiers.length * 120 + 40, W };
  }, [roster, ranks]);
}

function MiniCard({ m, onClose }: { m: Member; onClose: () => void }) {
  const { rankById, presence, isOnline } = useHub();
  const status = presence.get(m.id)?.status;
  return (
    <div className="absolute bottom-3 left-1/2 z-10 w-[min(92%,360px)] -translate-x-1/2 border border-gold-600/60 bg-coal/95 p-4 shadow-2xl backdrop-blur">
      <button onClick={onClose} className="absolute top-2 right-2 text-smoke hover:text-gold-200" aria-label="Close">
        <X className="size-4" />
      </button>
      <div className="flex items-center gap-3">
        <Avatar member={m} size="lg" online={isOnline(m.id)} />
        <div className="min-w-0">
          <p className="truncate font-display text-lg text-gold-100">{m.name}</p>
          {m.alias && <p className="truncate text-sm text-ash italic">“{m.alias}”</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-smoke">
            <RankBadge rank={rankById.get(m.rankId ?? '')} />
            <span>{tenure(days(m))} in the family</span>
          </div>
          {status && <p className="mt-1 text-xs text-gold-300">● {status}</p>}
        </div>
      </div>
      <Link to={`/members/${m.id}`} className="btn-gold btn-sm mt-3 w-full justify-center">
        Open their sheet
      </Link>
    </div>
  );
}

function Sky() {
  const { roster, ranks, isOnline } = useHub();
  const sheets = useCollection<Sheet>('sheets') ?? [];
  const starOf = new Map(sheets.map((s) => [s.id, s.star]));
  const { stars, lines, height, W } = useSky(roster, ranks);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [pick, setPick] = useState<Member | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const svgRef = useRef<SVGSVGElement>(null);
  // Screen pixels → sky units, so dragging moves the sky with your finger.
  const unit = () => {
    const el = svgRef.current;
    if (!el) return 1;
    return Math.max(W / el.clientWidth, height / el.clientHeight);
  };
  const last = useRef<{ x: number; y: number; d: number } | null>(null);
  const zoom = (f: number) => setView((v) => ({ ...v, k: Math.min(4, Math.max(0.6, v.k * f)) }));
  const center = () => {
    const ps = [...pointers.current.values()];
    const x = ps.reduce((t, p) => t + p.x, 0) / ps.length;
    const y = ps.reduce((t, p) => t + p.y, 0) / ps.length;
    const d = ps.length > 1 ? Math.hypot(ps[0]!.x - ps[1]!.x, ps[0]!.y - ps[1]!.y) : 0;
    return { x, y, d };
  };
  const down = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    last.current = center();
  };
  const move = (e: PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = center();
    const l = last.current;
    if (l) setView((v) => ({ x: v.x + c.x - l.x, y: v.y + c.y - l.y, k: l.d && c.d ? Math.min(4, Math.max(0.6, (v.k * c.d) / l.d)) : v.k }));
    last.current = c;
  };
  const up = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId);
    last.current = pointers.current.size ? center() : null;
  };
  return (
    <div className="family-sky relative overflow-hidden border border-line" style={{ height: 'min(78vh, 720px)' }}>
      <div
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        onWheel={(e: WheelEvent) => zoom(e.deltaY < 0 ? 1.1 : 0.9)}
      >
        <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
          <g transform={`translate(${W / 2 + view.x * unit()} ${height * 0.4 + view.y * unit()}) scale(${view.k}) translate(${-W / 2} ${-height * 0.4})`}>
            <defs>
              {stars.map((s) => {
                const st = starStyle(starOf.get(s.m.id));
                return (
                  <radialGradient key={s.m.id} id={`sg-${s.m.id}`}>
                    <stop offset="0" stopColor={st.glow} stopOpacity="0.85" />
                    <stop offset="1" stopColor={st.glow} stopOpacity="0" />
                  </radialGradient>
                );
              })}
            </defs>
            {lines.map(({ a, b }) => (
              <line key={b.m.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgb(212 175 55)" strokeOpacity="0.28" strokeWidth="0.9" className="sky-line" />
            ))}
            {stars.map((s, i) => {
              const st = starStyle(starOf.get(s.m.id));
              const p = Array.from({ length: 8 }, (_, k) => {
                const a = (k * Math.PI) / 4 - Math.PI / 2;
                const rr = k % 2 ? s.r * 0.34 : s.r;
                return `${s.x + Math.cos(a) * rr},${s.y + Math.sin(a) * rr}`;
              }).join(' ');
              return (
                <g key={s.m.id} className="sky-star" style={{ animationDelay: `${(i % 9) * 0.37}s` }} onClick={() => setPick(s.m)} role="button" aria-label={s.m.name}>
                  <circle cx={s.x} cy={s.y} r={s.r * 3.4} fill={`url(#sg-${s.m.id})`} opacity={isOnline(s.m.id) ? 0.9 : 0.6} />
                  <polygon points={p} fill={st.core} />
                  <circle cx={s.x} cy={s.y} r={s.r * 4} fill="transparent" />
                  <text x={s.x} y={s.y + s.r + 15} textAnchor="middle" className="sky-name" dy={6}>
                    {s.m.name}
                  </text>
                  {s.tier === 0 && (
                    <text x={s.x} y={s.y - s.r - 10} textAnchor="middle" className="sky-rank">
                      ♛
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <button className="btn-ghost btn-sm px-2" onClick={() => zoom(1.25)} aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
        <button className="btn-ghost btn-sm px-2" onClick={() => zoom(0.8)} aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <button className="btn-ghost btn-sm px-2" onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="Reset">
          <RotateCcw className="size-4" />
        </button>
      </div>
      <p className="pointer-events-none absolute top-3 left-3 text-[11px] text-smoke">Brightest at the top. Tap a star. Pick your own star’s color in Customize.</p>
      {pick && <MiniCard m={pick} onClose={() => setPick(null)} />}
    </div>
  );
}

// ---------- roster ----------

function Roster() {
  const { roster, ranks, rankById, memberById, presence, isOnline } = useHub();
  const [q, setQ] = useState('');
  const [rank, setRank] = useState('');
  const [sort, setSort] = useState<'rank' | 'name' | 'joined' | 'seen'>('rank');
  const order = (m: Member) => rankById.get(m.rankId ?? '')?.order ?? 99;
  const seen = (m: Member) => (isOnline(m.id) ? Date.now() : (presence.get(m.id)?.at?.toMillis() ?? 0));
  const rows = roster
    .filter((m) => !rank || m.rankId === rank)
    .filter((m) => !q.trim() || `${m.name} ${m.alias ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name) : sort === 'joined' ? (a.joinedAt?.toMillis() ?? 0) - (b.joinedAt?.toMillis() ?? 0) : sort === 'seen' ? seen(b) - seen(a) : order(a) - order(b) || a.name.localeCompare(b.name),
    );
  return (
    <div className="hud overflow-hidden">
      <div className="flex flex-wrap gap-2 border-b border-line-soft p-3">
        <div className="relative min-w-48 flex-1">
          <Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-smoke" />
          <input className="input py-1.5 pl-8 text-sm" placeholder="Search name or alias" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="input w-auto py-1.5 text-sm" value={rank} onChange={(e) => setRank(e.target.value)}>
          <option value="">Every rank</option>
          {ranks.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
        <select className="input w-auto py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="rank">Sort: Rank</option>
          <option value="name">Sort: Name</option>
          <option value="joined">Sort: Longest in the family</option>
          <option value="seen">Sort: Last seen</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="label border-b border-line-soft text-left">
              <th className="px-4 py-2">Member</th>
              <th className="px-2 py-2">Rank</th>
              <th className="px-2 py-2">Answers to</th>
              <th className="px-2 py-2">Joined</th>
              <th className="px-2 py-2">Last seen</th>
              <th className="px-4 py-2">Phone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const boss = m.reportsTo ? memberById.get(m.reportsTo) : undefined;
              return (
                <tr key={m.id} className="border-b border-line-soft last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <Link to={`/members/${m.id}`} className="flex items-center gap-2 hover:underline">
                      <Avatar member={m} size="sm" online={isOnline(m.id)} />
                      <span>
                        <span className="block text-gold-100">{m.name}</span>
                        {m.alias && <span className="block text-xs text-smoke italic">“{m.alias}”</span>}
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <RankBadge rank={rankById.get(m.rankId ?? '')} />
                  </td>
                  <td className="px-2 py-2 text-ash">{boss ? <Link to={`/members/${boss.id}`} className="hover:underline">{boss.name}</Link> : <span className="text-smoke">—</span>}</td>
                  <td className="px-2 py-2 text-ash">
                    {m.joinedAt ? fmtDate(m.joinedAt) : '—'} <span className="text-xs text-smoke">· {tenure(days(m))}</span>
                  </td>
                  <td className="px-2 py-2">{isOnline(m.id) ? <span className="text-ok">● {presence.get(m.id)?.status || 'Online'}</span> : <span className="text-smoke">{ago(presence.get(m.id)?.at)}</span>}</td>
                  <td className="px-4 py-2 font-mono text-ash">{m.phone || <span className="text-smoke">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <p className="p-6 text-center text-sm text-smoke">Nobody matches.</p>}
      </div>
    </div>
  );
}

// ---------- tiers ----------

function PersonCard({ m, big }: { m: Member; big?: boolean }) {
  const { rankById, isOnline, presence } = useHub();
  const rank = rankById.get(m.rankId ?? '');
  return (
    <Link
      to={`/members/${m.id}`}
      className={`hud group flex flex-col items-center gap-1.5 px-3 py-4 text-center transition hover:-translate-y-0.5 ${big ? 'w-52 sm:w-56' : 'w-[9.5rem] sm:w-40'}`}
      style={rank?.order === 0 ? { boxShadow: '0 0 32px rgba(212,175,55,0.25)' } : undefined}
    >
      {rank?.order === 0 && <Crown className="size-5 text-gold-300 drop-shadow-[0_0_6px_#d4af37]" />}
      <Avatar member={m} size={big ? 'xl' : 'lg'} online={isOnline(m.id)} />
      <span className="w-full truncate font-hud text-base font-bold text-gold-100 group-hover:text-gold-200">{m.name}</span>
      {m.alias && <span className="-mt-1 w-full truncate text-xs text-ash italic">“{m.alias}”</span>}
      <RankBadge rank={rank} size={big ? 'lg' : 'sm'} />
      <RoleChips memberId={m.id} className="justify-center" />
      <span className="text-[11px] text-smoke">
        {tenure(days(m))}
        {presence.get(m.id)?.status && isOnline(m.id) && <span className="text-ok"> · {presence.get(m.id)?.status}</span>}
      </span>
    </Link>
  );
}

function Tiers() {
  const { roster, ranks } = useHub();
  const top = ranks[0];
  const council = ranks.slice(1).filter((r) => r.leadership);
  const rest = ranks.slice(1).filter((r) => !r.leadership);
  const tiers = [
    ...(top ? [{ key: top.id, label: top.name, people: roster.filter((m) => m.rankId === top.id), vacant: true, big: true }] : []),
    ...(council.length ? [{ key: 'council', label: 'Leadership', people: council.flatMap((r) => roster.filter((m) => m.rankId === r.id)), vacant: false, big: false }] : []),
    ...rest.map((r) => ({ key: r.id, label: r.name, people: roster.filter((m) => m.rankId === r.id), vacant: false, big: false })),
  ].filter((t) => t.people.length || t.vacant);
  return (
    <div>
      {tiers.map((t, i) => (
        <section key={t.key}>
          {i > 0 && <div className="mx-auto h-6 w-px bg-gradient-to-b from-gold-700 to-gold-400/60" />}
          <p className="label mb-3 text-center text-gold-500">
            <span className="text-gold-700">───</span> {t.label} <span className="text-gold-700">───</span>
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {t.people.map((m) => (
              <PersonCard key={m.id} m={m} big={t.big} />
            ))}
            {!t.people.length && (
              <div className="flex h-20 w-40 items-center justify-center border border-dashed border-line font-hud text-sm tracking-widest text-smoke uppercase">Vacant</div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------- family cards ----------

function Cards() {
  const { roster, ranks } = useHub();
  const cards = useCollection<FamilyCardDoc>('familyCards') ?? [];
  const byId = new Map(cards.map((c) => [c.id, c]));
  const [open, setOpen] = useState<Member | null>(null);
  const groups = ranks.map((r) => ({ r, people: roster.filter((m) => m.rankId === r.id) })).filter((g) => g.people.length);
  return (
    <div className="space-y-10">
      {groups.map(({ r, people }) => (
        <section key={r.id}>
          <p className="label mb-4 text-center text-gold-500">
            <span className="text-gold-700">───</span> {r.name} <span className="text-gold-700">───</span>
          </p>
          <div className="card-fan flex justify-center">
            {people.map((m, i) => {
              const c = byId.get(m.id);
              const mid = (people.length - 1) / 2;
              return (
                <button
                  key={m.id}
                  onClick={() => setOpen(m)}
                  className="fan-card"
                  style={{ ['--rot' as string]: `${(i - mid) * Math.min(8, 40 / people.length)}deg`, ['--lift' as string]: `${Math.abs(i - mid) * 6}px`, zIndex: i }}
                  title={c?.title || m.name}
                >
                  {c ? <img src={c.image} alt={m.name} className="size-full object-cover" /> : <img src="/brand/logo.webp" alt="" className="m-auto w-2/3 rounded-full opacity-70" />}
                  <span className="fan-name">{m.name}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {open && (
        <Modal title={open.name} onClose={() => setOpen(null)}>
          <FamilyCard member={open} />
          <Link to={`/members/${open.id}`} className="btn-ghost btn-sm mt-3">
            Open their sheet
          </Link>
        </Modal>
      )}
    </div>
  );
}

// ---------- page ----------

/** Who holds each job, so people know who to ask. */
function WhoToAsk() {
  const { roles, holders, roster } = useHub();
  const jobs = roles.filter((r) => !r.honor).map((r) => ({ r, who: holders.filter((h) => h.roles.includes(r.id)).map((h) => roster.find((m) => m.id === h.id)).filter((m): m is Member => !!m) })).filter((x) => x.who.length);
  if (!jobs.length) return null;
  return (
    <Panel title="Who to ask" className="mb-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map(({ r, who }) => (
          <div key={r.id} className="border border-line-soft p-3">
            <p className="label text-gold-300">{r.name}</p>
            {r.note && <p className="mt-0.5 text-xs text-smoke">{r.note}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {who.map((m) => (
                <Link key={m.id} to={`/members/${m.id}`} className="flex items-center gap-1.5 text-sm text-gold-100 hover:text-gold-200">
                  <Avatar member={m} size="xs" /> {m.name}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function Family() {
  const { roster, settings } = useHub();
  const [view, setView] = useState<View>('sky');
  const tenures = roster.map(days);
  const avg = tenures.length ? Math.round(tenures.reduce((t, d) => t + d, 0) / tenures.length) : 0;
  const byJoin = roster.filter((m) => m.joinedAt).sort((a, b) => a.joinedAt!.toMillis() - b.joinedAt!.toMillis());
  const now = et(new Date());
  const anniversaries = roster.filter((m) => {
    if (!m.joinedAt) return false;
    const j = et(m.joinedAt.toDate());
    return j.m === now.m && now.y - j.y >= 1;
  });
  return (
    <>
      <PageHeader icon={Network} kicker="People" title="The Family" sub="Everyone in the family, by rank. Who answers to whom is on each person’s sheet." />

      <section className="hud family-crest relative mb-6 flex flex-col items-center gap-4 overflow-hidden p-6 text-center sm:flex-row sm:text-left">
        <img src="/brand/logo.webp" alt="" className="crest-seal size-28 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <p className="foil font-display text-3xl font-bold">{settings.name}</p>
          <p className="mt-1 font-display text-lg text-gold-200 italic">“{settings.motto}”</p>
        </div>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Members" value={roster.length} />
        <Stat label="Average time in" value={tenure(avg)} />
        <Stat label="Newest" value={<span className="text-base">{byJoin.at(-1)?.name ?? '—'}</span>} sub={byJoin.at(-1)?.joinedAt ? fmtDate(byJoin.at(-1)!.joinedAt!) : undefined} />
        <Stat label="Longest standing" value={<span className="text-base">{byJoin[0]?.name ?? '—'}</span>} sub={byJoin[0] ? tenure(days(byJoin[0])) : undefined} />
      </div>

      {anniversaries.length > 0 && (
        <div className="anniv-ribbon mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
          <span className="flex items-center gap-1.5 font-bold text-gold-100">
            <Sparkles className="size-4" /> Anniversaries this month
          </span>
          {anniversaries.map((m) => {
            const j = et(m.joinedAt!.toDate());
            return (
              <Link key={m.id} to={`/members/${m.id}`} className="flex items-center gap-1 text-gold-200 hover:underline">
                <Cake className="size-3.5" /> {m.name} · {now.y - j.y} year{now.y - j.y === 1 ? '' : 's'} ({j.d}th)
              </Link>
            );
          })}
        </div>
      )}

      <WhoToAsk />

      <div className="mb-5">
        <Tabs
          value={view}
          onChange={setView}
          tabs={[
            { id: 'sky', label: <span className="inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> The sky</span> },
            { id: 'roster', label: <span className="inline-flex items-center gap-1.5"><Table2 className="size-3.5" /> Roster</span> },
            { id: 'tiers', label: <span className="inline-flex items-center gap-1.5"><Crown className="size-3.5" /> By rank</span> },
            { id: 'cards', label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-3.5" /> Family cards</span> },
          ]}
        />
      </div>
      {view === 'sky' && <Sky />}
      {view === 'roster' && <Roster />}
      {view === 'tiers' && <Tiers />}
      {view === 'cards' && <Cards />}
    </>
  );
}

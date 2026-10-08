import { Cake, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Plus, Repeat as RepeatIcon, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { AudiencePicker } from '../components/AudiencePicker';
import { Avatar } from '../components/Avatar';
import { Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { usePins } from '../lib/pins';
import { useHub } from '../hooks/useHub';
import { audienceLabel, GANG, useVisible, type AudienceDraft } from '../lib/audience';
import { useCollection } from '../hooks/useCollection';
import { RESULTS, type Blacksite, type Spot } from '../lib/blacksites';
import { TZ, TZ_LABEL } from '../lib/format';
import { Link } from 'react-router-dom';
import {
  addDays,
  addEvent,
  dayKey,
  et,
  EVENT_KINDS,
  fromET,
  keyOf,
  occurrences,
  parseKey,
  removeEvent,
  REPEATS,
  rsvp,
  saveEvent,
  timeLabel,
  type CalEvent,
  type Occurrence,
  type Repeat,
  type Rsvp,
} from '../lib/calendar';
import { METH_SIZES } from '../noel/data';
import { useNoel, type NoelCook, type NoelGrow, type NoelRun } from '../lib/noelops';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DURATIONS = [
  [30, '30 min'],
  [60, '1 hour'],
  [120, '2 hours'],
  [180, '3 hours'],
  [240, '4 hours'],
  [360, '6 hours'],
] as const;

function EventDialog({ event, day, onClose }: { event?: CalEvent; day: string; onClose: () => void }) {
  const { me } = useHub();
  const s = event ? et(event.start.toDate()) : null;
  const [title, setTitle] = useState(event?.title ?? '');
  const [kind, setKind] = useState(event?.kind ?? 'meeting');
  const [date, setDate] = useState(s ? dayKey(s) : day);
  const [time, setTime] = useState(s ? `${String(s.h).padStart(2, '0')}:${String(s.mi).padStart(2, '0')}` : '21:00');
  const [mins, setMins] = useState(event?.mins ?? 60);
  const [repeat, setRepeat] = useState<Repeat>(event?.repeat ?? 'none');
  const [place, setPlace] = useState(event?.place ?? '');
  const [pinId, setPinId] = useState<string | null>(event?.pinId ?? null);
  const pins = usePins() ?? [];
  const spots = (useCollection<Spot>('blacksiteSpots') ?? []).filter((x) => x.x != null);
  const [note, setNote] = useState(event?.note ?? '');
  const [aud, setAud] = useState<AudienceDraft>(event ? { scope: event.scope, ranks: event.ranks, crewIds: [], minRank: event.minRank ?? null } : { ...GANG });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { y, m, d } = parseKey(date);
    const [h, mi] = time.split(':').map(Number);
    const draft = { title: title.trim().slice(0, 60), kind, mins, repeat, place: place.trim().slice(0, 60), pinId, note: note.trim().slice(0, 500), start: fromET(y, m, d, h, mi), ...aud };
    if (event) await saveEvent(event.id, draft);
    else await addEvent(me, draft);
    onClose();
  }
  return (
    <Modal title={event ? 'Edit event' : 'New event'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="What">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="e.g. Family sit-down" autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setKind(k.id)}
              className="chip px-2.5 py-1 text-xs"
              style={kind === k.id ? { background: k.color, color: '#0a0a0b' } : { border: `1px solid ${k.color}66`, color: k.color }}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Day">
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          <Field label={`Time (${TZ_LABEL})`}>
            <input type="time" className="input" value={time} onChange={(e) => setTime(e.target.value)} required />
          </Field>
          <Field label="How long">
            <select className="input" value={mins} onChange={(e) => setMins(+e.target.value)}>
              {DURATIONS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Repeats">
            <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              {REPEATS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Where">
            <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={60} placeholder="Postal or place" />
          </Field>
          <Field label="On the map" hint="Shows on the Map for the week before">
            <select
              className="input"
              value={pinId ?? ''}
              onChange={(e) => {
                const v = e.target.value || null;
                setPinId(v);
                const name = v?.startsWith('spot:') ? spots.find((x) => `spot:${x.id}` === v)?.name : pins.find((p) => p.id === v)?.name;
                if (name && !place.trim()) setPlace(name);
              }}
            >
              <option value="">Not on the map</option>
              {pins.length > 0 && (
                <optgroup label="Pins">
                  {pins.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.postal ? ` · ${p.postal}` : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {spots.length > 0 && (
                <optgroup label="Blacksite locations">
                  {spots.map((x) => (
                    <option key={x.id} value={`spot:${x.id}`}>
                      {x.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </Field>
        </div>
        <Field label="Details">
          <textarea className="input min-h-20" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <div>
          <span className="label mb-1.5 block">Who can see it</span>
          <AudiencePicker value={aud} onChange={setAud} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy || !title.trim()}>
            {event ? 'Save' : 'Post event'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function EventCard({ o, onEdit }: { o: Occurrence; onEdit: (e: CalEvent) => void }) {
  const { me, isLead, can, memberById, rankById } = useHub();
  const e = o.event;
  const lead = isLead || can('manageEvents');
  const canEdit = e && (e.owner === me.id || (lead && e.scope !== 'personal'));
  const going = e ? Object.entries(e.rsvp ?? {}) : [];
  const mine = e?.rsvp?.[me.id];
  const left = o.at.getTime() - Date.now();
  const d = Math.floor(left / 86400e3);
  const h = Math.floor((left % 86400e3) / 3600e3);
  const m = Math.floor((left % 3600e3) / 60e3);
  const countdown = !e ? null : left > 0 && left < 7 * 86400e3 ? `Starts in ${[d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(' ')}` : left <= 0 && -left < e.mins * 60e3 ? 'Happening now' : null;
  return (
    <div className="border-l-2 bg-raised/40 px-3 py-2" style={{ borderColor: o.color }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-hud font-bold text-gold-100">
            {o.href ? (
              <Link to={o.href} className="hover:underline">
                {o.title}
              </Link>
            ) : (
              o.title
            )}
            {countdown && <span className={`cal-countdown ${countdown === 'Happening now' ? 'live' : ''}`}>{countdown}</span>}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-smoke">
            {!o.allDay && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {timeLabel(o.at)}
                {e ? ` – ${timeLabel(new Date(o.at.getTime() + e.mins * 60e3))}` : ''} {TZ_LABEL}
              </span>
            )}
            {o.sub && (
              <span className="inline-flex items-center gap-1">
                {e ? <MapPin className="size-3" /> : null}
                {o.sub}
              </span>
            )}
            {e && e.repeat !== 'none' && (
              <span className="inline-flex items-center gap-1">
                <RepeatIcon className="size-3" />
                {REPEATS.find((r) => r.id === e.repeat)?.label}
              </span>
            )}
            {e && <span>{audienceLabel(e, rankById)}</span>}
          </p>
        </div>
        {canEdit && (
          <span className="flex gap-1">
            <button className="text-smoke hover:text-gold-200" onClick={() => onEdit(e!)} aria-label="Edit">
              <Pencil className="size-3.5" />
            </button>
            <button className="text-smoke hover:text-danger" onClick={() => confirm(`Delete “${e!.title}”${e!.repeat !== 'none' ? ' and all its repeats' : ''}?`) && removeEvent(e!.id)} aria-label="Delete">
              <Trash2 className="size-3.5" />
            </button>
          </span>
        )}
      </div>
      {e?.note && <p className="mt-1 text-sm whitespace-pre-wrap text-ash">{e.note}</p>}
      {e && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {(['yes', 'maybe', 'no'] as Rsvp[]).map((v) => (
            <button
              key={v}
              onClick={() => rsvp(e.id, me.id, v)}
              className={`chip px-2.5 py-1 text-xs ${mine === v ? (v === 'yes' ? 'bg-ok text-void' : v === 'maybe' ? 'bg-gold-400 text-void' : 'bg-danger text-white') : 'bg-raised text-ash'}`}
            >
              {v === 'yes' ? 'Going' : v === 'maybe' ? 'Maybe' : 'Can’t'}
            </button>
          ))}
          <span className="flex -space-x-1.5">
            {going
              .filter(([, v]) => v === 'yes')
              .slice(0, 8)
              .map(([id]) => (
                <span key={id} title={`${memberById.get(id)?.name} · going`}>
                  <Avatar member={memberById.get(id)} size="xs" />
                </span>
              ))}
            {going
              .filter(([, v]) => v === 'maybe')
              .slice(0, 5)
              .map(([id]) => (
                <span key={id} className="opacity-45" title={`${memberById.get(id)?.name} · maybe`}>
                  <Avatar member={memberById.get(id)} size="xs" />
                </span>
              ))}
          </span>
          <span className="text-xs text-smoke">
            {going.filter(([, v]) => v === 'yes').length} going · {going.filter(([, v]) => v === 'maybe').length} maybe
          </span>
        </div>
      )}
      {e?.pinId && (
        <Link to={e.pinId.startsWith('spot:') ? '/blacksites' : `/map?pin=${e.pinId}`} className="btn-ghost btn-sm mt-2 inline-flex">
          <MapPin className="size-3.5" /> Show on map
        </Link>
      )}
      {o.memberId && (
        <p className="mt-0.5 text-xs">
          <MemberName id={o.memberId} />
        </p>
      )}
    </div>
  );
}

export default function CalendarPage() {
  const { roster, canSee } = useHub();
  const events = useVisible<CalEvent>('events');
  const fights = useCollection<Blacksite>('blacksites');
  const ops = canSee('narcotics');
  // Grow, cook and coke-run timers come live from NoelOps.
  const locations = useNoel<Record<string, NoelGrow>>('locations', ops).data;
  const cooks = useNoel<Record<string, NoelCook>>('cooks', ops).data;
  const runs = useNoel<Record<string, NoelRun>>('runs', ops).data;
  const today = keyOf(Date.now());
  const t = parseKey(today);
  const [month, setMonth] = useState({ y: t.y, m: t.m });
  const [day, setDay] = useState(today);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CalEvent | null>(null);

  // The 6-week grid, Sunday first.
  const first = et(fromET(month.y, month.m, 1, 12));
  const gridStart = addDays(dayKey({ y: month.y, m: month.m, d: 1 }), -first.wd);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const from = days[0]!;
  const to = days[41]! > addDays(today, 30) ? days[41]! : addDays(today, 30);

  const all = useMemo(() => {
    const out: Occurrence[] = [];
    (events ?? []).forEach((e) => out.push(...occurrences(e, from, to)));
    if (ops) {
      Object.entries(locations ?? {})
        .filter(([, l]) => l && Number(l.startTime) > 0)
        .forEach(([k, l]) => {
          const at = new Date(Number(l.startTime) + (Number(l.durationHours) || 36) * 3600e3);
          const postal = String(l.id ?? k);
          out.push({ key: `g${k}`, day: keyOf(at), at, title: `${l.alias || `Postal ${postal}`} ready to harvest`, color: '#22c55e', kind: 'grow', sub: `Postal ${postal}` });
        });
      Object.entries(cooks ?? {})
        .filter(([, c]) => c && Number(c.ts) > 0)
        .forEach(([id, c]) => {
          const at = new Date(Number(c.ts) + (Number(c.mins) || 0) * 60e3);
          out.push({ key: `k${id}`, day: keyOf(at), at, title: `Meth cook done (${METH_SIZES[Number(c.size)] ?? c.size})`, color: '#22d3ee', kind: 'cook', sub: c.who });
        });
      Object.entries(runs ?? {})
        .filter(([, r]) => r && Number(r.ts) > 0)
        .forEach(([id, r]) => {
          const at = new Date(Number(r.ts) + (Number(r.mins) || 0) * 60e3);
          out.push({ key: `r${id}`, day: keyOf(at), at, title: `Coke run back (${r.n ?? 1} ${r.size ?? ''})`, color: '#e5e7eb', kind: 'run', sub: r.crew });
        });
    }
    // Logged blacksite fights.
    (fights ?? []).forEach((f) => {
      const at = f.at.toDate();
      const r = RESULTS.find((x) => x.id === f.result)!;
      out.push({ key: `f${f.id}`, day: keyOf(at), at, title: `${f.zone} · ${r.label}`, color: r.color, kind: 'fight', sub: f.rivals.length ? `vs ${f.rivals.join(', ')}` : undefined, href: '/blacksites' });
    });
    // Character birthdays and join anniversaries, for every year the window touches.
    const years = [...new Set([parseKey(from).y, parseKey(to).y])];
    roster.forEach((m) => {
      years.forEach((y) => {
        if (m.birthday) {
          const [bm, bd] = m.birthday.split('-').map(Number);
          const k = dayKey({ y, m: bm!, d: bd! });
          out.push({ key: `b${m.id}${y}`, day: k, at: fromET(y, bm!, bd!), allDay: true, title: `${m.name}’s birthday`, color: '#f472b6', kind: 'birthday', memberId: m.id });
        }
        if (m.joinedAt) {
          const j = et(m.joinedAt.toDate());
          const n = y - j.y;
          if (n >= 1)
            out.push({ key: `a${m.id}${y}`, day: dayKey({ y, m: j.m, d: j.d }), at: fromET(y, j.m, j.d), allDay: true, title: `${m.name}: ${n} year${n === 1 ? '' : 's'} in the family`, color: '#d4af37', kind: 'anniversary', memberId: m.id });
        }
      });
    });
    return out.filter((o) => o.day >= from && o.day <= to).sort((a, b) => a.day.localeCompare(b.day) || (a.allDay === b.allDay ? a.at.getTime() - b.at.getTime() : a.allDay ? -1 : 1));
  }, [events, fights, locations, cooks, runs, roster, ops, from, to]);

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    all.forEach((o) => m.set(o.day, [...(m.get(o.day) ?? []), o]));
    return m;
  }, [all]);
  const upcoming = all.filter((o) => o.day >= today && o.day <= addDays(today, 13));
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y, m: ((m + n + 11) % 12) + 1 }));
  const label = (k: string) => {
    const p = parseKey(k);
    return k === today ? 'Today' : k === addDays(today, 1) ? 'Tomorrow' : fromET(p.y, p.m, p.d, 12).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: TZ });
  };

  const short = (k: string) => {
    const p = parseKey(k);
    return k === today ? 'Today' : k === addDays(today, 1) ? 'Tmrw' : fromET(p.y, p.m, p.d, 12).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: TZ });
  };

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        kicker="City"
        title="Calendar"
        sub="Eastern time. Posted events, ops timers, blacksite fights, birthdays and anniversaries."
        actions={
          <button className="btn-gold" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> New event
          </button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Panel
          title={`${MONTHS[month.m - 1]} ${month.y}`}
          right={
            <span className="flex gap-1">
              <button className="btn-ghost btn-sm px-2" onClick={() => shift(-1)} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
              <button className="btn-ghost btn-sm" onClick={() => (setMonth({ y: t.y, m: t.m }), setDay(today))}>
                Today
              </button>
              <button className="btn-ghost btn-sm px-2" onClick={() => shift(1)} aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
            </span>
          }
        >
          <div className="grid grid-cols-7 gap-px border border-line-soft bg-line-soft">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="label bg-coal py-1.5 text-center">
                {d}
              </div>
            ))}
            {days.map((k) => {
              const p = parseKey(k);
              const list = byDay.get(k) ?? [];
              const out = p.m !== month.m;
              return (
                <button
                  key={k}
                  onClick={() => setDay(k)}
                  className={`cal-day flex min-h-16 flex-col items-stretch gap-0.5 p-1 text-left sm:min-h-24 ${k === today ? 'cal-today' : ''} ${k === day ? 'bg-gold-400/15 ring-1 ring-gold-400 ring-inset' : 'bg-coal hover:bg-raised'} ${out ? 'opacity-40' : ''}`}
                >
                  <span className={`self-end px-1 font-mono text-xs ${k === today ? 'rounded bg-gold-400 font-bold text-void' : 'text-ash'}`}>{p.d}</span>
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {list.slice(0, 3).map((o) => (
                      <span key={o.key} className={`cal-chip ${k === today && o.at.getTime() > Date.now() ? 'tonight' : ''}`} style={{ '--c': o.color } as React.CSSProperties}>
                        {o.kind === 'birthday' ? '🎂 ' : ''}
                        {o.title}
                      </span>
                    ))}
                    {list.length > 3 && <span className="px-1 text-[10px] text-smoke">+{list.length - 3} more</span>}
                  </span>
                  <span className="flex flex-wrap gap-0.5 sm:hidden">
                    {list.slice(0, 4).map((o) => (
                      <span key={o.key} className="size-1.5 rounded-full" style={{ background: o.color }} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-smoke">
            {EVENT_KINDS.map((k) => (
              <span key={k.id} className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: k.color }} /> {k.label}
              </span>
            ))}
            {ops && (
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> Ops timers
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Cake className="size-3 text-pink-400" /> Birthdays
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-ok" /> Blacksite fights
            </span>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title={label(day)}
            right={
              <button className="btn-ghost btn-sm" onClick={() => setAdding(true)}>
                <Plus className="size-3.5" /> Add
              </button>
            }
          >
            {(byDay.get(day) ?? []).length ? (
              <div className="space-y-2">
                {(byDay.get(day) ?? []).map((o) => (
                  <EventCard key={o.key} o={o} onEdit={setEditing} />
                ))}
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-smoke">Nothing on this day.</p>
            )}
          </Panel>

          <Panel title="Next two weeks">
            {upcoming.length ? (
              <ul className="space-y-1.5">
                {upcoming.map((o) => (
                  <li key={o.key}>
                    <button className="flex w-full items-center gap-2 text-left text-sm hover:text-gold-200" onClick={() => (setDay(o.day), setMonth({ y: parseKey(o.day).y, m: parseKey(o.day).m }))}>
                      <span className="size-2 shrink-0 rounded-full" style={{ background: o.color }} />
                      <span className="w-24 shrink-0 text-xs text-smoke">
                        {short(o.day)}
                        {!o.allDay && ` ${timeLabel(o.at)}`}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-gold-100">{o.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-smoke">Nothing coming up.</p>
            )}
          </Panel>
        </div>
      </div>

      {adding && <EventDialog day={day < today ? today : day} onClose={() => setAdding(false)} />}
      {editing && <EventDialog event={editing} day={day} onClose={() => setEditing(null)} />}
    </>
  );
}

import { Cake, CalendarDays, ChevronLeft, ChevronRight, Clock, MapPin, Pencil, Plus, Repeat as RepeatIcon, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { AudiencePicker } from '../components/AudiencePicker';
import { Avatar } from '../components/Avatar';
import { Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { audienceLabel, GANG, useVisible, type AudienceDraft } from '../lib/audience';
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
import type { Cook, OpsLocation, Run } from '../noel/data';

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
  const [note, setNote] = useState(event?.note ?? '');
  const [aud, setAud] = useState<AudienceDraft>(event ? { scope: event.scope, ranks: event.ranks, crewIds: event.crewIds, minRank: event.minRank ?? null } : { ...GANG });
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    const { y, m, d } = parseKey(date);
    const [h, mi] = time.split(':').map(Number);
    const draft = { title: title.trim().slice(0, 60), kind, mins, repeat, place: place.trim().slice(0, 60), note: note.trim().slice(0, 500), start: fromET(y, m, d, h, mi), ...aud };
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
          <Field label="Time (ET)">
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
        <Field label="Where">
          <input className="input" value={place} onChange={(e) => setPlace(e.target.value)} maxLength={60} placeholder="Postal, place or pin name" />
        </Field>
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
  const { me, myRank, memberById, rankById, crewById } = useHub();
  const e = o.event;
  const lead = !!myRank && (myRank.order === 0 || !!myRank.leadership);
  const canEdit = e && (e.owner === me.id || (lead && e.scope !== 'personal'));
  const going = e ? Object.entries(e.rsvp ?? {}) : [];
  const mine = e?.rsvp?.[me.id];
  return (
    <div className="border-l-2 bg-raised/40 px-3 py-2" style={{ borderColor: o.color }}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-hud font-bold text-gold-100">{o.title}</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-smoke">
            {!o.allDay && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                {timeLabel(o.at)}
                {e ? ` – ${timeLabel(new Date(o.at.getTime() + e.mins * 60e3))}` : ''} ET
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
            {e && <span>{audienceLabel(e, rankById, crewById)}</span>}
          </p>
        </div>
        {canEdit && (
          <span className="flex gap-1">
            <button className="text-smoke hover:text-gold-200" onClick={() => onEdit(e!)} aria-label="Edit">
              <Pencil className="size-3.5" />
            </button>
            <button className="text-smoke hover:text-blood" onClick={() => confirm(`Delete “${e!.title}”${e!.repeat !== 'none' ? ' and all its repeats' : ''}?`) && removeEvent(e!.id)} aria-label="Delete">
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
              className={`chip px-2.5 py-1 text-xs ${mine === v ? (v === 'yes' ? 'bg-ok text-void' : v === 'maybe' ? 'bg-gold-400 text-void' : 'bg-blood text-white') : 'bg-raised text-ash'}`}
            >
              {v === 'yes' ? 'Going' : v === 'maybe' ? 'Maybe' : 'Can’t'}
            </button>
          ))}
          <span className="flex -space-x-1.5">
            {going
              .filter(([, v]) => v === 'yes')
              .slice(0, 8)
              .map(([id]) => (
                <Avatar key={id} member={memberById.get(id)} size="xs" />
              ))}
          </span>
          <span className="text-xs text-smoke">
            {going.filter(([, v]) => v === 'yes').length} going · {going.filter(([, v]) => v === 'maybe').length} maybe
          </span>
        </div>
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
  const ops = canSee('narcotics');
  const locations = useCollection<OpsLocation>('locations', ops);
  const cooks = useCollection<Cook>('cooks', ops);
  const runs = useCollection<Run>('runs', ops);
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
      (locations ?? [])
        .filter((l) => l.kind === 'grow' && l.startTime)
        .forEach((l) => {
          const at = new Date(l.startTime!.toMillis() + (l.durationHours ?? 36) * 3600e3);
          out.push({ key: `g${l.id}`, day: keyOf(at), at, title: `${l.name} ready to harvest`, color: '#22c55e', kind: 'grow', sub: l.postal ? `Postal ${l.postal}` : undefined });
        });
      (cooks ?? [])
        .filter((c) => !c.done && c.at)
        .forEach((c) => {
          const at = new Date(c.at!.toMillis() + c.mins * 60e3);
          out.push({ key: `k${c.id}`, day: keyOf(at), at, title: `Meth cook done (${c.size})`, color: '#22d3ee', kind: 'cook', sub: c.by });
        });
      (runs ?? [])
        .filter((r) => !r.done && r.at)
        .forEach((r) => {
          const at = new Date(r.at!.toMillis() + r.mins * 60e3);
          out.push({ key: `r${r.id}`, day: keyOf(at), at, title: `Coke run back (${r.n} ${r.size})`, color: '#e5e7eb', kind: 'run', sub: r.crew });
        });
    }
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
  }, [events, locations, cooks, runs, roster, ops, from, to]);

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>();
    all.forEach((o) => m.set(o.day, [...(m.get(o.day) ?? []), o]));
    return m;
  }, [all]);
  const upcoming = all.filter((o) => o.day >= today && o.day <= addDays(today, 13));
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n > 12 ? y + 1 : m + n < 1 ? y - 1 : y, m: ((m + n + 11) % 12) + 1 }));
  const label = (k: string) => {
    const p = parseKey(k);
    return k === today ? 'Today' : k === addDays(today, 1) ? 'Tomorrow' : fromET(p.y, p.m, p.d, 12).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'America/New_York' });
  };

  const short = (k: string) => {
    const p = parseKey(k);
    return k === today ? 'Today' : k === addDays(today, 1) ? 'Tmrw' : fromET(p.y, p.m, p.d, 12).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', timeZone: 'America/New_York' });
  };

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        kicker="City"
        title="Calendar"
        sub="Eastern time. Posted events, ops timers, birthdays and anniversaries."
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
                  className={`flex min-h-16 flex-col items-stretch gap-0.5 p-1 text-left sm:min-h-24 ${k === day ? 'bg-gold-400/15 ring-1 ring-gold-400 ring-inset' : 'bg-coal hover:bg-raised'} ${out ? 'opacity-40' : ''}`}
                >
                  <span className={`self-end px-1 font-mono text-xs ${k === today ? 'rounded bg-gold-400 font-bold text-void' : 'text-ash'}`}>{p.d}</span>
                  <span className="hidden flex-col gap-0.5 sm:flex">
                    {list.slice(0, 3).map((o) => (
                      <span key={o.key} className="truncate rounded-sm px-1 text-[10px] leading-4 font-semibold text-black/85" style={{ background: o.color }}>
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

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AvatarStack } from '../components/AvatarStack';
import { Empty, Field, PageHeader } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { MemberPicker } from '../components/MemberPicker';
import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { useLore } from '../hooks/useLore';
import { yearOf } from '../lib/format';
import { compareWhen, deleteEvent, saveEvent, toWhen, type EventDraft } from '../lib/lore';
import type { ChronicleEvent } from '../lib/types';

export default function Chronicle() {
  const { me } = useAuth();
  const { can } = useHub();
  const { chronicle, loreById } = useLore();
  const [editing, setEditing] = useState<ChronicleEvent | 'new' | null>(null);
  const { hash } = useLocation();

  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [hash]);

  const events = [...chronicle].sort((a, b) => compareWhen(a.when, b.when));
  const byYear = new Map<string, ChronicleEvent[]>();
  for (const e of events) byYear.set(yearOf(e.when), [...(byYear.get(yearOf(e.when)) ?? []), e]);
  const side = new Map(events.map((e, i) => [e.id, i % 2 === 1]));
  const canEdit = (e: ChronicleEvent) => can('editAllLore') || (e.authorId === me?.id && can('writeLore'));

  return (
    <div>
      <PageHeader
        title="The Chronicle"
        subtitle="The family's history, in the order it happened."
        actions={
          can('writeLore') && (
            <button className="btn-gold" onClick={() => setEditing('new')}>
              + Record an event
            </button>
          )
        }
      />

      {events.length === 0 ? (
        <Empty>No events recorded yet. Start with the day the family was founded.</Empty>
      ) : (
        <div className="relative mx-auto max-w-3xl">
          {/* the gold spine */}
          <div className="absolute bottom-0 left-[7px] top-0 w-px bg-gradient-to-b from-gold-700/0 via-gold-500/70 to-gold-700/0 sm:left-1/2" />
          {[...byYear.entries()].map(([year, list]) => (
            <section key={year} className="relative mb-10">
              <div className="relative z-10 mb-6 flex sm:justify-center">
                <span className="ml-6 rounded-full border border-gold-700 bg-night px-4 py-1 font-display text-sm font-bold tracking-[0.25em] text-gold-200 sm:ml-0">
                  {formatYear(year)}
                </span>
              </div>
              <ol className="space-y-6">
                {list.map((e) => {
                  const article = e.loreId ? loreById.get(e.loreId) : undefined;
                  const right = side.get(e.id);
                  return (
                    <li key={e.id} id={e.id} className={`relative flex scroll-mt-24 ${right ? 'sm:justify-end' : ''}`}>
                      <span className="absolute left-0 top-5 z-10 h-[15px] w-[15px] rotate-45 border border-gold-300 bg-ink shadow-[0_0_12px_rgba(212,175,55,.6)] sm:left-1/2 sm:-ml-[7px]" />
                      <div className={`panel ml-8 w-full p-4 sm:ml-0 sm:w-[calc(50%-2rem)] ${hash === `#${e.id}` ? 'border-gold-400' : ''}`}>
                        <div className="font-display text-[11px] uppercase tracking-[0.2em] text-gold-300">{e.whenLabel || e.when}</div>
                        <h3 className="mt-1 font-display text-lg font-bold text-bone">{e.title}</h3>
                        {e.description && <p className="mt-1.5 whitespace-pre-wrap font-serif text-[1.08rem] leading-snug text-parchment/85">{e.description}</p>}
                        {article && (
                          <Link to={`/archive/${article.id}`} className="mt-2 inline-block text-sm text-gold-200 hover:text-gold-50">
                            ✦ Read: {article.title} →
                          </Link>
                        )}
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-smoke">
                          <AvatarStack ids={e.characters} />
                          <span className="ml-auto">
                            by <MemberName id={e.authorId} className="text-xs" />
                          </span>
                          {canEdit(e) && (
                            <button className="text-gold-300 hover:underline" onClick={() => setEditing(e)}>
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {editing && <EventForm event={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const formatYear = (y: string) => (y.startsWith('-') ? `−${Number(y.slice(1))}` : String(Number(y)));

function splitWhen(when?: string) {
  const m = when ? /^(-?\d+)-(\d{2})-(\d{2})$/.exec(when) : null;
  return m ? { year: String(Number(m[1])), month: m[2], day: m[3] } : { year: '', month: '01', day: '01' };
}

function EventForm({ event, onClose }: { event: ChronicleEvent | null; onClose: () => void }) {
  const { me } = useAuth();
  const { can } = useHub();
  const { lore } = useLore();
  const init = splitWhen(event?.when);
  const [year, setYear] = useState(init.year);
  const [month, setMonth] = useState(init.month);
  const [day, setDay] = useState(init.day);
  const [d, setD] = useState<Omit<EventDraft, 'when'>>({
    title: event?.title ?? '',
    whenLabel: event?.whenLabel ?? '',
    description: event?.description ?? '',
    loreId: event?.loreId ?? null,
    characters: event?.characters ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^-?\d+$/.test(year.trim())) return setError('Enter a year as a number (use a minus sign for "before the founding").');
    setBusy(true);
    try {
      await saveEvent(event, { ...d, when: toWhen(year, month, day) }, me!.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={event ? 'Edit Event' : 'Record an Event'} onClose={onClose} wide>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
        <Field label="What happened" className="sm:col-span-6">
          <input className="input" value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} maxLength={120} required autoFocus placeholder="The Docks War begins" />
        </Field>
        <Field label="Year" className="sm:col-span-2">
          <input className="input" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="1923 (or -12 for before)" required />
        </Field>
        <Field label="Month">
          <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Day">
          <select className="input" value={day} onChange={(e) => setDay(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')).map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
        <Field label="Shown as (optional)" className="sm:col-span-2">
          <input className="input" value={d.whenLabel} onChange={(e) => setD({ ...d, whenLabel: e.target.value })} maxLength={80} placeholder="The Long Winter" />
        </Field>
        <p className="-mt-2 text-[11px] text-smoke sm:col-span-6">The year/month/day only decide the order on the timeline. "Shown as" is what members see, if you'd rather not use real dates.</p>
        <Field label="What people remember" className="sm:col-span-6">
          <textarea className="input min-h-28 font-serif text-lg" value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} maxLength={4000} />
        </Field>
        <Field label="Archive entry with the full story (optional)" className="sm:col-span-6">
          <select className="input" value={d.loreId ?? ''} onChange={(e) => setD({ ...d, loreId: e.target.value || null })}>
            <option value="">— None —</option>
            {[...lore].sort((a, b) => a.title.localeCompare(b.title)).map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-6">
          <span className="label">Who was there</span>
          <MemberPicker value={d.characters} onChange={(characters) => setD({ ...d, characters })} />
        </div>
        {error && <p className="text-sm text-red-400 sm:col-span-6">{error}</p>}
        <div className="flex justify-between gap-2 sm:col-span-6">
          {event && (can('editAllLore') || event.authorId === me?.id) ? (
            <button
              type="button"
              className="btn-danger"
              onClick={() => confirm('Remove this event from the Chronicle?') && deleteEvent(event.id).then(onClose, (e) => setError(e.message))}
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold" disabled={busy}>
              {event ? 'Save' : 'Record it'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

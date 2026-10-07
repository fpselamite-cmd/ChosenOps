import { CalendarDays, Crown, Plus, Trash2, Vote, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { PageHeader, Panel, Tabs } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { AUDIENCES, blankPoll, BUILT_IN, createPoll, pollOpen, POLL_KINDS, removeTemplate, saveTemplate, YES_NO, type PollDraft, type PollTemplate } from '../../lib/polls';
import { PollCard } from './PollCard';
import { useNow, usePolls } from './usePolls';

const DEADLINES = [
  { h: 0, label: 'No deadline' },
  { h: 24, label: '24 hours' },
  { h: 48, label: '2 days' },
  { h: 72, label: '3 days' },
  { h: 168, label: '1 week' },
];
/** A local date-time input value for a Date. */
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

function Choice<T extends string | boolean>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { id: T; label: string }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.id)} type="button" className={`chip px-3 py-1.5 text-xs ${value === o.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewPoll({ onClose }: { onClose: () => void }) {
  const { me } = useHub();
  const saved = useCollection<PollTemplate>('pollTemplates') ?? [];
  const [d, setD] = useState<PollDraft>(blankPoll);
  const [hours, setHours] = useState(48);
  const [custom, setCustom] = useState('');
  const [keep, setKeep] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<PollDraft>) => setD((x) => ({ ...x, ...p }));

  const use = (t: PollTemplate | null) => {
    if (!t) return (setD(blankPoll()), setHours(48));
    const slots = t.kind === 'dates' ? [1, 2, 3].map((n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(20, 0, 0, 0); return x.toISOString(); }) : t.options;
    setD({ question: t.question, note: t.note, kind: t.kind, options: slots.length >= 2 ? slots : [...slots, '', ''].slice(0, 2), audience: t.audience, anonymous: t.anonymous, reveal: t.reveal, official: t.official, closesAt: null });
    setHours(t.hours);
  };
  const opts = d.kind === 'yesno' ? YES_NO : d.options;
  const filled = d.kind === 'yesno' ? 3 : d.options.filter((o) => o.trim()).length;
  const closesAt = custom ? new Date(custom) : hours ? new Date(Date.now() + hours * 3_600_000) : null;

  return (
    <Modal title="Ask the family" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap gap-1.5">
        <span className="label mr-1 self-center text-[10px]">Start from</span>
        <button type="button" className="chip px-2.5 py-1 text-xs text-smoke" onClick={() => use(null)}>
          Blank
        </button>
        {[...BUILT_IN, ...saved].map((t) => (
          <button key={t.id} type="button" className="chip px-2.5 py-1 text-xs text-gold-200" onClick={() => use(t)}>
            {t.kind === 'dates' ? <CalendarDays className="mr-1 inline size-3" /> : t.official ? <Crown className="mr-1 inline size-3" /> : null}
            {t.name}
          </button>
        ))}
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await createPoll(me, { ...d, closesAt });
            if (keep.trim()) await saveTemplate({ ...d, name: keep.trim(), options: d.kind === 'dates' ? [] : d.options.filter((o) => o.trim()), hours });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Question">
          <input className="input" value={d.question} maxLength={140} required placeholder="Where's dinner this week?" onChange={(e) => set({ question: e.target.value })} />
        </Field>
        <Field label="Details (optional)">
          <textarea className="input min-h-16" value={d.note} maxLength={500} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        <Field label="Kind of poll">
          <Choice
            value={d.kind}
            onChange={(kind) =>
              set({
                kind,
                options:
                  kind === 'dates' && !d.options.some((o) => !Number.isNaN(Date.parse(o)))
                    ? [1, 2].map((n) => { const x = new Date(); x.setDate(x.getDate() + n); x.setHours(20, 0, 0, 0); return x.toISOString(); })
                    : kind !== 'dates' && d.kind === 'dates'
                      ? ['', '']
                      : d.options,
              })
            }
            options={POLL_KINDS.map((k) => ({ id: k.id, label: k.label }))}
          />
        </Field>
        <Field label={d.kind === 'dates' ? 'Times to choose from' : 'Options'}>
          <div className="space-y-1.5">
            {opts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-5 text-right font-mono text-xs text-smoke">{String.fromCharCode(65 + i)}</span>
                {d.kind === 'yesno' ? (
                  <span className="input flex-1 text-ash">{o}</span>
                ) : d.kind === 'dates' ? (
                  <input
                    type="datetime-local"
                    className="input flex-1"
                    value={o ? local(new Date(o)) : ''}
                    onChange={(e) => set({ options: d.options.map((x, j) => (j === i ? (e.target.value ? new Date(e.target.value).toISOString() : '') : x)) })}
                  />
                ) : (
                  <input className="input flex-1" value={o} maxLength={80} placeholder={`Option ${i + 1}`} onChange={(e) => set({ options: d.options.map((x, j) => (j === i ? e.target.value : x)) })} />
                )}
                {d.kind !== 'yesno' && d.options.length > 2 && (
                  <button type="button" className="text-smoke hover:text-red-300" onClick={() => set({ options: d.options.filter((_, j) => j !== i) })} aria-label="Remove option">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {d.kind !== 'yesno' && d.options.length < 12 && (
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => {
                  const last = d.options.at(-1);
                  const next = d.kind === 'dates' && last ? new Date(new Date(last).getTime() + 86_400_000).toISOString() : '';
                  set({ options: [...d.options, next] });
                }}
              >
                <Plus className="size-3.5" /> {d.kind === 'dates' ? 'Add a time' : 'Add an option'}
              </button>
            )}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who votes">
            <Choice value={d.audience} onChange={(audience) => set({ audience })} options={AUDIENCES} />
          </Field>
          <Field label="Votes are">
            <Choice value={d.anonymous} onChange={(anonymous) => set({ anonymous })} options={[{ id: false, label: 'Named' }, { id: true, label: 'Anonymous' }]} />
          </Field>
          <Field label="Results show">
            <Choice value={d.reveal} onChange={(reveal) => set({ reveal })} options={[{ id: 'live', label: 'Live, once you vote' }, { id: 'closed', label: 'Only when it closes' }]} />
          </Field>
          <Field label="Official motion" hint="Gets the High Table seal; the result goes in the Archives timeline.">
            <Choice value={d.official} onChange={(official) => set({ official })} options={[{ id: false, label: 'No' }, { id: true, label: 'Yes, seal it' }]} />
          </Field>
        </div>
        <Field label="Voting closes">
          <div className="flex flex-wrap items-center gap-1.5">
            {DEADLINES.map((x) => (
              <button key={x.h} type="button" className={`chip px-3 py-1.5 text-xs ${!custom && hours === x.h ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => (setHours(x.h), setCustom(''))}>
                {x.label}
              </button>
            ))}
            <input type="datetime-local" className="input w-auto !py-1.5 text-sm" value={custom} min={local(new Date())} onChange={(e) => setCustom(e.target.value)} aria-label="Custom deadline" />
          </div>
        </Field>
        <Field label="Also save as a template (optional)">
          <input className="input" value={keep} maxLength={40} placeholder="Template name" onChange={(e) => setKeep(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <button className="btn-gold" disabled={busy || !d.question.trim() || filled < 2 || (!!closesAt && closesAt.getTime() < Date.now())}>
            <Vote className="size-4" /> Put it to a vote
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Templates() {
  const saved = useCollection<PollTemplate>('pollTemplates') ?? [];
  return (
    <Panel title={`Saved templates · ${saved.length}`}>
      {saved.length ? (
        <ul className="divide-y divide-line-soft">
          {saved.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                <b className="block truncate text-gold-100">{t.name}</b>
                <span className="block truncate text-xs text-smoke">
                  {POLL_KINDS.find((k) => k.id === t.kind)?.label} · {t.question}
                </span>
              </span>
              <button className="text-smoke hover:text-red-300" onClick={() => confirm(`Delete the "${t.name}" template?`) && removeTemplate(t.id)} aria-label="Delete template">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-smoke">Save a poll as a template from its ••• menu, or when you make one. "Schedule a night" and "Motion" are always there.</p>
      )}
    </Panel>
  );
}

export default function Polls() {
  const { isLead, me } = useHub();
  const polls = usePolls();
  const now = useNow();
  const [tab, setTab] = useState<'open' | 'closed' | 'templates'>('open');
  const [making, setMaking] = useState(false);
  const open = useMemo(() => (polls ?? []).filter((p) => pollOpen(p, now)).sort((a, b) => Number(a.voters.includes(me.id)) - Number(b.voters.includes(me.id))), [polls, now, me.id]);
  const closed = useMemo(() => (polls ?? []).filter((p) => !pollOpen(p, now)), [polls, now]);
  const list = tab === 'open' ? open : closed;
  return (
    <>
      <PageHeader
        icon={Vote}
        kicker="HQ · Family votes"
        title="Polls"
        sub="Leadership puts it to the family. Cast your vote, make your case, and see where everyone stands."
        actions={
          isLead && (
            <button className="btn-gold" onClick={() => setMaking(true)}>
              <Plus className="size-4" /> New poll
            </button>
          )
        }
      />
      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'open', label: `Open · ${open.length}` },
            { id: 'closed', label: `Closed · ${closed.length}` },
            ...(isLead ? [{ id: 'templates' as const, label: 'Templates' }] : []),
          ]}
        />
      </div>
      {tab === 'templates' ? (
        <Templates />
      ) : list.length ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {list.map((p) => (
            <PollCard key={p.id} p={p} />
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-smoke">{tab === 'open' ? 'Nothing up for a vote right now.' : 'No closed polls yet.'}</p>
      )}
      {making && <NewPoll onClose={() => setMaking(false)} />}
    </>
  );
}

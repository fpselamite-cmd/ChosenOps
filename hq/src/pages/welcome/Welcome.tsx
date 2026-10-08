import { ArrowDown, ArrowUp, Award, ChevronDown, Flag, HandHeart, Plus, ScrollText, Sparkles, ThumbsUp, Trash2, X } from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Empty, Field } from '../../components/Field';
import { PageHeader, Panel, Tabs } from '../../components/Page';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { Blacksite } from '../../lib/blacksites';
import { db } from '../../lib/firebase';
import { ago } from '../../lib/format';
import type { Member } from '../../lib/types';
import {
  acceptRules,
  addHandlerNote,
  promote,
  recommend,
  removeHandlerNote,
  removeNote,
  removeVouch,
  ASSOCIATE_CHECKLIST,
  canvaEmbed,
  CHECKLIST_VERSION,
  saveWelcome,
  sendNote,
  stepsFromText,
  withdraw,
  type HandlerNote,
  type Vouch,
  type WelcomeNote,
  type WelcomeSettings,
  type WStep,
} from '../../lib/welcome';
import PendingTab from '../admin/PendingTab';
import { Road, stopsOf } from './Road';
import { useAssociate, useAssociates, useWelcomeAccess, useWelcomeSettings } from './useWelcome';

type View = 'road' | 'associates' | 'door' | 'guide' | 'setup';

/** The Welcome Committee: everyone holding the role. */
function useHandlers(): Member[] {
  const { holders, memberById } = useHub();
  return holders.filter((h) => h.roles.includes('welcome')).flatMap((h) => memberById.get(h.id) ?? []);
}

// ---------- the associate's side ----------

function NotesForMe() {
  const { me } = useHub();
  const q = useMemo(() => query(collection(db, 'welcomeNotes'), where('to', '==', me.id)), [me.id]);
  const notes = (useCollection<WelcomeNote>(q) ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const first = useDoc<{ text: string; byName: string }>(`welcomes/${me.id}`);
  return (
    <Panel title="Notes for you">
      <ul className="space-y-3 text-sm">
        {first && (
          <li>
            <p className="text-gold-100">“{first.text}”</p>
            <p className="text-xs text-smoke">{first.byName}</p>
          </li>
        )}
        {notes.map((n) => (
          <li key={n.id} className="group relative">
            <p className="text-gold-100">“{n.text}”</p>
            <p className="text-xs text-smoke">
              {n.byName} · {ago(n.at)}
            </p>
            <button className="absolute top-0 right-0 text-smoke opacity-0 group-hover:opacity-100 hover:text-red-300" onClick={() => removeNote(n.id)} aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        {!first && !notes.length && <li className="text-smoke">Nothing yet. Your handlers will leave notes here.</li>}
      </ul>
    </Panel>
  );
}

function MyRoad() {
  const { me } = useHub();
  const { w, ob, p } = useAssociate(me.id);
  const handlers = useHandlers();
  const stops = stopsOf(w, p, ob, me.id);
  const now = stops.find((s) => s.state !== 'done');
  const nextTask = w.steps.find((t) => !p.stamps.has(t.id));
  const next =
    now?.id === 'rules'
      ? { text: 'Read the rules and accept them.', to: '/welcome?tab=rules', cta: 'Read the rules' }
      : now?.id === 'sheet'
        ? { text: 'Fill in your character sheet: who you are, where you’re from, your story.', to: `/members/${me.id}`, cta: 'Open my sheet' }
        : now?.id === 'tasks'
          ? nextTask
            ? { text: `${nextTask.title}${nextTask.detail ? `: ${nextTask.detail}` : ''}. Do it with a handler around, then mark it on your card.`, cta: '' }
            : { text: 'Your handlers are checking the operations you marked.', cta: '' }
          : now?.id === 'rep'
            ? { text: `Earn rep on runs until you hit ${w.repTarget.toLocaleString()}.`, to: '/petty-crime', cta: 'Petty Crime' }
            : now?.id === 'rec'
              ? { text: 'You’ve done it all. A handler will put you up to High Table.', cta: '' }
              : { text: 'You’re up to be blooded in. High Table decides.', cta: '' };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
      <Road memberId={me.id} name={me.name} w={w} p={p} ob={ob} />
      <div className="space-y-6">
        <Panel title="Do this next">
          <p className="text-sm text-gold-100">{next.text}</p>
          {next.to && (
            <Link to={next.to} className="btn-gold btn-sm mt-3 inline-flex">
              {next.cta}
            </Link>
          )}
        </Panel>
        <Panel title="Your handlers">
          {handlers.length ? (
            <ul className="space-y-2">
              {handlers.map((h) => (
                <li key={h.id}>
                  <Link to={`/members/${h.id}`} className="flex items-center gap-2 hover:text-gold-200">
                    <Avatar member={h} size="sm" online />
                    <span className="text-sm">{h.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-smoke">The Welcome Committee looks after you. Ask leadership who’s on it.</p>
          )}
          <p className="mt-3 text-xs text-smoke">Any of them can sign off your operations or answer questions.</p>
        </Panel>
        <NotesForMe />
      </div>
    </div>
  );
}

/** The guide (the Canva slideshow), and accepting it as the rules. */
function Guide({ w }: { w: WelcomeSettings }) {
  const { me } = useHub();
  const { isAssoc, isHandler } = useWelcomeAccess();
  const ob = useDoc<{ rulesAccepted?: number }>(`onboarding/${me.id}`);
  const accepted = (ob?.rulesAccepted ?? 0) >= w.rulesVersion;
  return (
    <div className="space-y-5">
      {isAssoc && ob?.rulesAccepted && !accepted && <p className="hud border-yellow-400/50 p-3 text-sm text-yellow-200">The guide changed since you accepted it. Go through it again and accept below.</p>}
      {w.canva ? (
        <CanvaGuide src={w.canva} />
      ) : (
        <p className="hud p-6 text-center text-sm text-smoke">{isHandler ? 'No guide yet. Paste the Canva embed link in Setup.' : 'The guide isn’t up yet. Ask your handler.'}</p>
      )}
      {isAssoc && (
        <div className="hud flex flex-wrap items-center gap-3 p-4">
          <ScrollText className="size-5 text-gold-300" />
          <p className="flex-1 text-sm">{accepted ? 'You’ve gone through the guide and accepted the rules.' : 'Gone through the whole guide? Accepting means you’ll be held to it.'}</p>
          {!accepted && (
            <button className="btn-gold" onClick={() => acceptRules(me, w.rulesVersion)}>
              I accept the rules
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- the handlers' side ----------

function AssociateFile({ m, fights }: { m: Member; fights: Blacksite[] }) {
  const { me, isLead, ranks, presence, actsOn } = useHub();
  const { isHandler } = useWelcomeAccess();
  const { w, ob, p } = useAssociate(m.id);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [rec, setRec] = useState('');
  const notesQ = useMemo(() => query(collection(db, 'handlerNotes'), where('memberId', '==', m.id)), [m.id]);
  const notes = (useCollection<HandlerNote>(notesQ, open) ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const vouchQ = useMemo(() => query(collection(db, 'vouches'), where('memberId', '==', m.id)), [m.id]);
  const vouches = useCollection<Vouch>(vouchQ) ?? [];
  const ups = vouches.filter((v) => v.kind === 'vouch').length;
  const flags = vouches.filter((v) => v.kind === 'flag').length;
  const above = [...ranks].sort((a, b) => b.order - a.order).filter((r) => r.id !== m.rankId && actsOn(r));
  const [rank, setRank] = useState('');
  const toRank = above.find((r) => r.id === rank) ?? above[0];
  const seen = presence.get(m.id)?.at;
  const ran = fights.filter((f) => f.participants.includes(m.id)).length;
  return (
    <div className={`hud ${ob?.recommended ? 'border-gold-400/70' : ''}`}>
      <button className="flex w-full flex-wrap items-center gap-3 p-4 text-left" onClick={() => setOpen(!open)}>
        <Avatar member={m} size="md" online />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <b className="font-hud text-base text-gold-100">{m.name}</b>
            {ob?.recommended && (
              <span className="chip border-gold-400 px-2 py-0.5 text-[10px] text-gold-200">
                <Award className="size-3" /> Recommended
              </span>
            )}
            {p.pending > 0 && <span className="chip border-yellow-400/70 px-2 py-0.5 text-[10px] text-yellow-200">{p.pending} to confirm</span>}
          </span>
          <span className="text-xs text-smoke">
            Joined {ago(m.joinedAt)} · {ups} vouch{ups === 1 ? '' : 'es'}
            {flags ? <span className="text-red-300"> · {flags} flag{flags === 1 ? '' : 's'}</span> : ''}
          </span>
        </span>
        <span className="w-40 max-sm:w-full">
          <span className="flex justify-between text-xs">
            <span className="text-smoke">
              {p.done}/{p.total}
            </span>
            <b className="text-gold-200">{p.pct}%</b>
          </span>
          <span className="welcome-bar mt-1 block">
            <i style={{ width: `${p.pct}%` }} />
          </span>
        </span>
        <ChevronDown className={`size-4 text-smoke transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="grid gap-6 border-t border-line-soft p-4 xl:grid-cols-[1fr_320px]">
          <Road memberId={m.id} name={m.name} w={w} p={p} ob={ob} handler={isHandler} />
          <div className="space-y-5">
            <Panel title="Activity">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="label text-[9px]">Petty rep</dt>
                  <dd className="font-hud text-lg text-gold-100">{p.rep.toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="label text-[9px]">Blacksites</dt>
                  <dd className="font-hud text-lg text-gold-100">{ran}</dd>
                </div>
                <div>
                  <dt className="label text-[9px]">Last on</dt>
                  <dd className="text-ash">{seen ? ago(seen) : '—'}</dd>
                </div>
                <div>
                  <dt className="label text-[9px]">Rules</dt>
                  <dd className={p.rules ? 'text-ok' : 'text-smoke'}>{p.rules ? 'Accepted' : 'Not yet'}</dd>
                </div>
              </dl>
              <Link to={`/members/${m.id}`} className="mt-3 inline-block text-xs text-gold-400 hover:text-gold-200">
                Open their profile →
              </Link>
            </Panel>

            <Panel title={ob?.recommended ? 'Up to be blooded in' : 'Recommend'}>
              {ob?.recommended ? (
                <div className="space-y-3 text-sm">
                  <p>
                    <b className="text-gold-200">{ob.recommended.byName}</b> put them up {ago(ob.recommended.at)}
                    {ob.recommended.note && <span className="block text-ash">“{ob.recommended.note}”</span>}
                  </p>
                  {isLead && toRank && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select className="input w-auto py-1 text-sm" value={toRank.id} onChange={(e) => setRank(e.target.value)}>
                        {above.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                      <button className="btn-gold btn-sm" onClick={() => confirm(`Blood ${m.name} in as ${toRank.name}?`) && promote(m, toRank.id, toRank.name)}>
                        <Sparkles className="size-3.5" /> Blood them in
                      </button>
                    </div>
                  )}
                  {!isLead && <p className="text-xs text-smoke">High Table decides from here.</p>}
                  <button className="text-xs text-smoke hover:text-red-300" onClick={() => withdraw(m.id)}>
                    Withdraw the recommendation
                  </button>
                </div>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void recommend(me, m.id, rec.trim());
                    setRec('');
                  }}
                >
                  {!p.ready && <p className="text-xs text-yellow-200">Not everything is done yet ({p.done}/{p.total}). You can still put them up.</p>}
                  <input className="input text-sm" placeholder="Why they’re ready (for High Table)" value={rec} maxLength={300} onChange={(e) => setRec(e.target.value)} />
                  <button className="btn-gold btn-sm">
                    <Award className="size-3.5" /> Recommend to High Table
                  </button>
                </form>
              )}
            </Panel>

            <Panel title={`Vouches & flags · ${vouches.length}`}>
              <ul className="space-y-2 text-sm">
                {vouches.map((v) => (
                  <li key={v.id} className="flex gap-2">
                    {v.kind === 'vouch' ? <ThumbsUp className="mt-0.5 size-3.5 shrink-0 text-ok" /> : <Flag className="mt-0.5 size-3.5 shrink-0 text-red-300" />}
                    <span className="min-w-0 flex-1 text-ash">
                      {v.text || (v.kind === 'vouch' ? 'Vouches for them' : 'Flagged them')}
                      <span className="block text-[11px] text-smoke">
                        {v.byName} · {ago(v.at)}
                      </span>
                    </span>
                    <button className="text-smoke hover:text-red-300" onClick={() => removeVouch(v.id)} aria-label="Remove">
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
                {!vouches.length && <li className="text-smoke">Members can vouch or flag from the associate’s profile.</li>}
              </ul>
            </Panel>

            <Panel title="Handler notes · private">
              <form
                className="mb-3 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!note.trim()) return;
                  void addHandlerNote(me, m.id, note.trim());
                  setNote('');
                }}
              >
                <input className="input py-1 text-sm" placeholder="Only handlers and leadership see these" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
                <button className="btn-gold btn-sm">Add</button>
              </form>
              <ul className="space-y-2 text-sm">
                {notes.map((n) => (
                  <li key={n.id} className="group relative">
                    <p className="text-ash">{n.text}</p>
                    <p className="text-[11px] text-smoke">
                      {n.byName} · {ago(n.at)}
                    </p>
                    <button className="absolute top-0 right-0 text-smoke opacity-0 group-hover:opacity-100 hover:text-red-300" onClick={() => removeHandlerNote(n.id)} aria-label="Remove">
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title="Leave them a note">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!msg.trim()) return;
                  void sendNote(me, m.id, msg.trim());
                  setMsg('');
                }}
              >
                <input className="input py-1 text-sm" placeholder="Shows on their Welcome page" value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} />
                <button className="btn-ghost btn-sm">
                  <HandHeart className="size-3.5" /> Send
                </button>
              </form>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Associates() {
  const list = useAssociates();
  const fights = useCollection<Blacksite>('blacksites') ?? [];
  if (!list.length) return <Empty title="No associates right now">New people show up here once they’re let in as associates.</Empty>;
  return (
    <div className="space-y-3">
      {list.map((m) => (
        <AssociateFile key={m.id} m={m} fights={fights} />
      ))}
    </div>
  );
}

function Setup({ w }: { w: WelcomeSettings }) {
  const [steps, setSteps] = useState<WStep[]>(w.steps);
  const [rep, setRep] = useState(w.repTarget);
  const [again, setAgain] = useState(false);
  const [paste, setPaste] = useState('');
  const [saved, setSaved] = useState(false);
  const [canva, setCanva] = useState(w.canva ?? '');
  const canvaOk = !canva.trim() ? '' : canvaEmbed(canva);
  const move = (i: number, d: number) => {
    const n = [...steps];
    const [x] = n.splice(i, 1);
    n.splice(i + d, 0, x!);
    setSteps(n);
  };
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title={`Operations on the card · ${steps.length}`}>
        <ul className="space-y-2">
          {steps.map((s, i) => (
            <li key={s.id} className="flex items-start gap-2">
              <span className="mt-2 w-5 text-right font-mono text-xs text-smoke">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-1">
                <input className="input py-1 text-sm" value={s.title} maxLength={80} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, title: e.target.value } : x)))} />
                <input className="input py-1 text-xs" placeholder="Details (optional)" value={s.detail ?? ''} maxLength={200} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, detail: e.target.value } : x)))} />
              </div>
              <div className="flex flex-col">
                <button className="p-1 text-smoke hover:text-gold-200 disabled:opacity-30" disabled={!i} onClick={() => move(i, -1)} aria-label="Up">
                  <ArrowUp className="size-3.5" />
                </button>
                <button className="p-1 text-smoke hover:text-gold-200 disabled:opacity-30" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Down">
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
              <button className="mt-2 text-smoke hover:text-red-300" onClick={() => setSteps(steps.filter((_, k) => k !== i))} aria-label="Remove">
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <button className="btn-ghost btn-sm mt-3" onClick={() => setSteps([...steps, { id: `t${Date.now().toString(36)}`, title: 'New operation' }])} disabled={steps.length >= 40}>
          <Plus className="size-3.5" /> Add one
        </button>
        <div className="mt-5 border-t border-line-soft pt-4">
          <Field label="Paste a whole list (one per line, “Title — details”)" hint="Replaces the list above. Stamps already earned stay if the title matches.">
            <textarea className="input min-h-28 font-mono text-xs" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={'Ride along on a weed run — with a handler\nHold a blacksite\nWash $10k with a washer'} />
          </Field>
          <button className="btn-ghost btn-sm mt-2" disabled={!paste.trim()} onClick={() => (setSteps(stepsFromText(paste, steps)), setPaste(''))}>
            Use this list
          </button>
        </div>
        <div className="mt-5 border-t border-line-soft pt-4">
          <Field label="Petty rep needed (0 for none)">
            <input className="input w-40 font-mono" inputMode="numeric" value={rep || ''} onChange={(e) => setRep(Number(e.target.value.replace(/\D/g, '')) || 0)} />
          </Field>
        </div>
      </Panel>
      <Panel title="Guide · a Canva design" className="xl:col-span-2">
        <Field
          label="Canva embed link"
          hint={
            <>
              In Canva: <b>Share → More → Embed</b>, then copy the <b>smart embed link</b> (it ends in <span className="font-mono">/view?embed</span>). It shows on the Guide tab and updates by itself whenever the design changes in Canva.
            </>
          }
        >
          <input className="input font-mono text-xs" value={canva} onChange={(e) => setCanva(e.target.value)} placeholder="https://www.canva.com/design/…/view?embed" />
        </Field>
        {canvaOk === 'edit' && <p className="mt-2 text-sm text-red-300">That’s an edit link: anyone who sees the page could change your design. Use the embed link instead (Share → More → Embed).</p>}
        {canvaOk === null && <p className="mt-2 text-sm text-red-300">That doesn’t look like a Canva design link.</p>}
        {canvaOk && canvaOk !== 'edit' && <p className="mt-2 text-xs text-ok">Looks good. Save to show it on the Guide tab.</p>}
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={again} onChange={(e) => setAgain(e.target.checked)} />
          Big change: associates must go through the guide and accept again
        </label>
      </Panel>
      <div className="flex items-center justify-end gap-3 xl:col-span-2">
        {saved && <span className="text-sm text-ok">Saved</span>}
        <button
          className="btn-gold"
          disabled={canvaOk === 'edit' || canvaOk === null}
          onClick={async () => {
            await saveWelcome({
              canva: canvaOk || '',
              steps: steps.filter((s) => s.title.trim()).map((s) => ({ id: s.id, title: s.title.trim(), ...(s.detail?.trim() ? { detail: s.detail.trim() } : {}), ...(s.final ? { final: true } : {}) })),
              checklistV: w.checklistV ?? CHECKLIST_VERSION,
              sections: w.sections,
              repTarget: rep,
              rulesVersion: w.rulesVersion + (again ? 1 : 0),
            });
            setAgain(false);
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
          }}
        >
          Save setup
        </button>
      </div>
    </div>
  );
}

/** The Canva guide, live: Canva serves the latest version every time it loads. */
function CanvaGuide({ src }: { src: string }) {
  return (
    <div className="hud overflow-hidden p-2">
      <div className="relative w-full overflow-hidden" style={{ paddingTop: '56.25%' }}>
        <iframe title="Guide" src={src} className="absolute inset-0 size-full border-0" loading="lazy" allowFullScreen allow="fullscreen" />
      </div>
    </div>
  );
}

// ---------- page ----------

/** The family's associate checklist replaces the old placeholder list, once (a WC's visit does it). */
function useChecklistUpgrade(w: WelcomeSettings, can: boolean) {
  const { preview } = useHub();
  const raw = useDoc<WelcomeSettings>('settings/welcome');
  const tried = useRef(false);
  useEffect(() => {
    if (!can || preview || tried.current || raw === undefined || (w.checklistV ?? 0) >= CHECKLIST_VERSION) return;
    tried.current = true;
    void saveWelcome({ ...w, steps: ASSOCIATE_CHECKLIST, checklistV: CHECKLIST_VERSION }).catch(() => (tried.current = false));
  }, [can, preview, raw, w]);
}

export default function Welcome() {
  const { members } = useHub();
  const access = useWelcomeAccess();
  const w = useWelcomeSettings();
  useChecklistUpgrade(w, access.isHandler);
  const assoc = useAssociates();
  const [params, setParams] = useSearchParams();
  const door = members.filter((m) => m.status === 'pending').length;
  if (!access.open) return <Empty title="For associates and their handlers">This page belongs to associates and the Welcome Committee.</Empty>;
  const tabs: { id: View; label: string }[] = [
    ...(access.isAssoc ? [{ id: 'road' as View, label: 'My road' }] : []),
    ...(access.isHandler ? [{ id: 'associates' as View, label: `Associates · ${assoc.length}` }] : []),
    ...(access.canDoor ? [{ id: 'door' as View, label: `At the door${door ? ` · ${door}` : ''}` }] : []),
    { id: 'guide', label: 'Guide' },
    ...(access.isHandler ? [{ id: 'setup' as View, label: 'Setup' }] : []),
  ];
  // Old "rules" links land on the guide, which replaced it.
  const asked = params.get('tab') === 'rules' ? 'guide' : params.get('tab');
  const view = tabs.find((t) => t.id === asked)?.id ?? tabs[0]!.id;
  return (
    <>
      <PageHeader
        icon={HandHeart}
        kicker="Welcome center"
        title={access.isAssoc ? 'Your road to the family' : 'Welcome Committee'}
        sub={access.isAssoc ? 'Everything you need to be blooded in, and the people looking out for you.' : 'Associates, their progress and who’s at the door. Sign off their operations and put them up to High Table.'}
      />
      <div className="mb-5">
        <Tabs value={view} onChange={(v) => setParams(v === tabs[0]!.id ? {} : { tab: v })} tabs={tabs} />
      </div>
      {view === 'road' && <MyRoad />}
      {view === 'associates' && <Associates />}
      {view === 'door' && <PendingTab />}
      {view === 'guide' && <Guide w={w} />}
      {view === 'setup' && <Setup key={JSON.stringify(w)} w={w} />}
    </>
  );
}

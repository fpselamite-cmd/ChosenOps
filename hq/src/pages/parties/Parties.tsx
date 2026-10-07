import { collection, query, where } from 'firebase/firestore';
import { Cake, Coins, Gift, PartyPopper, PenLine, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { PartyCtx, useParties } from '../../components/PartyHat';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Page';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { chipsFmt, sendChips, type Chips } from '../../lib/casino';
import { keyOf } from '../../lib/calendar';
import { db } from '../../lib/firebase';
import { ago } from '../../lib/format';
import { collectGift, giftFor, partiesOn, signCard, unsignCard, type Party, type PartyNote } from '../../lib/parties';
import { sfx } from '../../lib/sound';

// ---------- who's celebrating today ----------

export function PartyProvider({ children }: { children: ReactNode }) {
  const { roster } = useHub();
  const [day, setDay] = useState(() => keyOf(Date.now()));
  useEffect(() => {
    const t = setInterval(() => setDay(keyOf(Date.now())), 60_000);
    return () => clearInterval(t);
  }, []);
  const value = useMemo(() => {
    const parties = partiesOn(roster);
    return { parties, celebrating: new Set(parties.map((p) => p.member.id)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, day]);
  return (
    <PartyCtx.Provider value={value}>
      {children}
      <PartyKeeper />
      <MySurprise />
    </PartyCtx.Provider>
  );
}

// ---------- confetti ----------

const COLORS = ['#fbbf24', '#f472b6', '#a855f7', '#38bdf8', '#4ade80', '#f87171', '#fde68a'];
export function Confetti({ n = 90, onDone }: { n?: number; onDone?: () => void }) {
  const bits = useMemo(
    () => Array.from({ length: n }, (_, i) => ({ i, left: Math.random() * 100, delay: Math.random() * 0.9, dur: 2.4 + Math.random() * 1.8, color: COLORS[i % COLORS.length], drift: (Math.random() - 0.5) * 160, spin: Math.random() * 720 - 360, w: 6 + Math.random() * 6 })),
    [n],
  );
  useEffect(() => {
    const t = setTimeout(() => onDone?.(), 4600);
    return () => clearTimeout(t);
  }, [onDone]);
  return createPortal(
    <div className="confetti" aria-hidden>
      {bits.map((b) => (
        <i key={b.i} style={{ left: `${b.left}%`, background: b.color, width: b.w, height: b.w * 0.45, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, ['--drift' as string]: `${b.drift}px`, ['--spin' as string]: `${b.spin}deg` }} />
      ))}
    </div>,
    document.body,
  );
}
/** True the first time this device sees `key` today. */
function useFirstToday(key: string) {
  const [first] = useState(() => {
    try {
      const k = `chosenops.party.${key}`;
      if (localStorage.getItem(k)) return false;
      localStorage.setItem(k, '1');
      return true;
    } catch {
      return false;
    }
  });
  return first;
}

// ---------- the card ----------

const GIFTS = [50, 100, 250, 500];
const usePartyNotes = (party: string) => useCollection<PartyNote>(useMemo(() => query(collection(db, 'partyNotes'), where('party', '==', party)), [party])) ?? [];

export function PartyCard({ p, onClose }: { p: Party; onClose: () => void }) {
  const { me, preview } = useHub();
  const notes = usePartyNotes(p.id).sort((a, b) => (a.at?.toMillis() ?? Date.now()) - (b.at?.toMillis() ?? Date.now()));
  const mine = notes.find((n) => n.by === me.id);
  const isMe = p.member.id === me.id;
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [gift, setGift] = useState(100);
  const [sent, setSent] = useState('');
  const chips = useDoc<Chips>(`chips/${me.id}`);
  const first = p.member.name.split(' ')[0];
  return (
    <Modal title={p.kind === 'birthday' ? `Happy birthday, ${first}!` : `${first} · ${p.label}`} onClose={onClose}>
      <div className="party-card">
        <div className="mb-4 flex items-center gap-3">
          <Avatar member={p.member} size="lg" />
          <span>
            <span className="label text-[10px] text-gold-500">{p.kind === 'birthday' ? 'Birthday card' : 'Anniversary card'}</span>
            <b className="block font-display text-xl text-gold-100">{p.member.name}</b>
            <span className="text-xs text-smoke">
              {notes.length ? `Signed by ${notes.length}` : 'No one has signed yet'} · the house sent {chipsFmt(giftFor(p))} chips
            </span>
          </span>
        </div>
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="party-note">
              <p className="text-sm text-bone">{n.text}</p>
              <p className="mt-1 flex items-center gap-2 text-[11px] text-smoke">
                <span className="font-semibold text-gold-200">— {n.name}</span> {ago(n.at)}
                {n.by === me.id && !preview && (
                  <>
                    <button className="ml-auto hover:text-gold-200" onClick={() => (setText(n.text), setEditing(true))} aria-label="Edit my note">
                      <PenLine className="size-3" />
                    </button>
                    <button className="hover:text-red-300" onClick={() => unsignCard(n.id)} aria-label="Take back my note">
                      <Trash2 className="size-3" />
                    </button>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
        {!isMe && (!mine || editing) && (
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim() || preview) return;
              void signCard(me, p, text).then(() => (setText(''), setEditing(false), sfx.chip()));
            }}
          >
            <input className="input flex-1" value={text} maxLength={200} autoFocus placeholder={p.kind === 'birthday' ? `Happy birthday, ${first}…` : `To ${first}…`} onChange={(e) => setText(e.target.value)} />
            <button className="btn-gold btn-sm" disabled={!text.trim()}>
              <PenLine className="size-3.5" /> Sign
            </button>
          </form>
        )}
        {!isMe && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
            <span className="label text-[10px]">Send chips</span>
            {GIFTS.map((g) => (
              <button key={g} type="button" className={`chip px-2.5 py-1 text-xs ${gift === g ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => setGift(g)}>
                {g}
              </button>
            ))}
            <button
              className="btn-ghost btn-sm ml-auto"
              disabled={!chips || chips.balance < gift || !!preview}
              onClick={() => void sendChips(me, p.member.id, gift, p.kind === 'birthday' ? 'Happy birthday!' : `Happy ${p.label}!`).then(() => (setSent(`Sent ${gift} chips`), sfx.win()))}
            >
              <Gift className="size-3.5" /> {sent || 'Send'}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------- the dashboard banner ----------

function PartyRow({ p }: { p: Party }) {
  const { me } = useHub();
  const notes = usePartyNotes(p.id);
  const [open, setOpen] = useState(false);
  const signed = notes.some((n) => n.by === me.id);
  const isMe = p.member.id === me.id;
  return (
    <div className="party-row">
      <Avatar member={p.member} size="md" />
      <span className="min-w-0 flex-1">
        <b className="block font-display text-base leading-tight text-gold-100 sm:text-lg">
          {isMe ? (p.kind === 'birthday' ? 'Happy birthday to you!' : `You're ${p.label}!`) : p.kind === 'birthday' ? `It's ${p.member.name}'s birthday!` : `${p.member.name} · ${p.label}`}
        </b>
        <span className="text-xs text-smoke">
          {p.kind === 'birthday' ? <Cake className="mr-1 inline size-3.5 text-pink-300" /> : <PartyPopper className="mr-1 inline size-3.5 text-gold-300" />}
          {notes.length ? `${notes.length} signed the card` : 'Be the first to sign the card'}
        </span>
      </span>
      <button className={signed || isMe ? 'btn-ghost btn-sm' : 'btn-gold btn-sm'} onClick={() => setOpen(true)}>
        {isMe ? 'Open your card' : signed ? 'See the card' : 'Sign the card'}
      </button>
      {open && <PartyCard p={p} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Top of the Dashboard: today's parties, with confetti the first time you see them today. */
export function PartyBanner() {
  const { me } = useHub();
  const { parties } = useParties();
  const today = keyOf(Date.now());
  const burst = useFirstToday(`banner.${today}.${parties.map((p) => p.id).join(',')}`);
  const [boom, setBoom] = useState(burst && parties.length > 0);
  const [nudge, setNudge] = useState(() => {
    try {
      return !me.birthday && !localStorage.getItem('chosenops.bdayNudge');
    } catch {
      return !me.birthday;
    }
  });
  return (
    <>
      {parties.length > 0 && (
        <section className="party-banner rise mb-6">
          <span className="party-streamers" aria-hidden />
          <p className="label relative mb-2 flex items-center gap-1.5 text-pink-200">
            <PartyPopper className="size-3.5" /> Celebrating today
          </p>
          <div className="relative grid gap-2 md:grid-cols-2">
            {parties.map((p) => (
              <PartyRow key={p.id} p={p} />
            ))}
          </div>
          {boom && <Confetti onDone={() => setBoom(false)} />}
        </section>
      )}
      {nudge && (
        <p className="mb-4 flex items-center gap-2 text-xs text-smoke">
          <Cake className="size-3.5 text-pink-300" />
          <span>
            Add your birthday to <Link to={`/members/${me.id}`} className="text-gold-300 hover:underline">your sheet</Link> so the family can celebrate.
          </span>
          <button
            className="ml-auto text-smoke hover:text-gold-200"
            aria-label="Dismiss"
            onClick={() => {
              setNudge(false);
              try {
                localStorage.setItem('chosenops.bdayNudge', '1');
              } catch {
                // fine
              }
            }}
          >
            <X className="size-3.5" />
          </button>
        </p>
      )}
    </>
  );
}

// ---------- the honoree ----------

/** Sends the house's gift to me once per party. */
function PartyKeeper() {
  const { me, preview } = useHub();
  const { parties } = useParties();
  const chips = useDoc<Chips>(`chips/${me.id}`);
  const tried = useRef(new Set<string>());
  useEffect(() => {
    if (preview || !chips) return;
    for (const p of parties) {
      if (p.member.id !== me.id || (chips.partiesPaid ?? []).includes(p.id) || tried.current.has(p.id)) continue;
      tried.current.add(p.id);
      void collectGift(me.id, p).catch(() => tried.current.delete(p.id));
    }
  }, [parties, chips, me.id, preview]);
  return null;
}

/** My own big moment: once per party, the first time I open HQ that day. */
function MySurprise() {
  const { me, preview } = useHub();
  const { parties } = useParties();
  const mine = parties.filter((p) => p.member.id === me.id);
  if (preview || !mine.length) return null;
  return <Surprise key={mine.map((p) => p.id).join()} parties={mine} />;
}
function Surprise({ parties }: { parties: Party[] }) {
  const { me } = useHub();
  const first = useFirstToday(`surprise.${parties.map((p) => p.id).join(',')}`);
  const [show, setShow] = useState(first);
  const [card, setCard] = useState<Party | null>(null);
  useEffect(() => void (show && sfx.jackpot()), [show]);
  const p = parties[0]!;
  const gift = parties.reduce((t, x) => t + giftFor(x), 0);
  const name = me.name.split(' ')[0];
  return (
    <>
      {show &&
        createPortal(
          <div className="party-surprise" onClick={() => setShow(false)}>
            <Confetti n={140} />
            <div className="party-surprise-box" onClick={(e) => e.stopPropagation()}>
              <span className="party-surprise-icon">{p.kind === 'birthday' ? <Cake className="size-12" /> : <PartyPopper className="size-12" />}</span>
              <p className="label text-pink-200">From the whole family</p>
              <h2 className="foil foil-animate font-display text-3xl font-black tracking-wide sm:text-4xl">
                {p.kind === 'birthday' ? `Happy birthday, ${name}!` : `${p.label}, ${name}!`}
              </h2>
              {parties.length > 1 && <p className="text-sm text-ash">And {parties[1]!.label.toLowerCase()} too. What a day.</p>}
              <p className="flex items-center justify-center gap-1.5 text-gold-200">
                <Coins className="size-4" /> The house sent you {chipsFmt(gift)} chips
              </p>
              <div className="flex justify-center gap-2 pt-2">
                <button className="btn-gold" onClick={() => (setShow(false), setCard(p))}>
                  Open your card
                </button>
                <button className="btn-ghost" onClick={() => setShow(false)}>
                  Thanks, family
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
      {card && <PartyCard p={card} onClose={() => setCard(null)} />}
    </>
  );
}

// ---------- kept on the profile ----------

/** Every card the family has signed for someone, newest first. */
export function PartyCards({ memberId }: { memberId: string }) {
  const notes = useCollection<PartyNote>(useMemo(() => query(collection(db, 'partyNotes'), where('for', '==', memberId)), [memberId])) ?? [];
  const cards = useMemo(() => {
    const by = new Map<string, PartyNote[]>();
    notes.forEach((n) => by.set(n.party, [...(by.get(n.party) ?? []), n]));
    return [...by.entries()].map(([id, ns]) => ({ id, ns: ns.sort((a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0)) })).sort((a, b) => b.id.slice(-10).localeCompare(a.id.slice(-10)));
  }, [notes]);
  if (!cards.length) return null;
  const when = (id: string) => {
    const tail = id.split('_').at(-1)!;
    return tail.length === 4 ? tail : new Date(tail + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  return (
    <Panel title={`Cards from the family · ${cards.length}`} className="mb-6">
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.id} className="party-card party-card-kept">
            <p className="label mb-2 flex items-center gap-1.5 text-[10px] text-pink-200">
              {c.ns[0]!.kind === 'birthday' ? <Cake className="size-3.5" /> : <PartyPopper className="size-3.5" />}
              {c.ns[0]!.label} · {when(c.id)}
            </p>
            <ul className="space-y-1.5">
              {c.ns.map((n) => (
                <li key={n.id} className="text-sm">
                  <span className="text-bone">{n.text}</span> <span className="text-[11px] font-semibold text-gold-300">— {n.name}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Panel>
  );
}

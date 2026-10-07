import { Cherry, Coins, Crown, Dices, Gift, Settings, ShoppingBag, Spade, Sparkles, Trophy } from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Field } from '../../components/Field';
import { FancyName, Framed, HonorPic, RarityChip } from '../../components/HonorArt';
import { PageHeader, Panel, Tabs } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { buyHonor, chipsFmt, grantChips, saveCasino, sendChips, weekKey, type CasinoSettings, type ChipGift, type Chips } from '../../lib/casino';
import { db } from '../../lib/firebase';
import { ago } from '../../lib/format';
import { KINDS, RARITIES } from '../../lib/honors';
import { sfx } from '../../lib/sound';
import { useHonors } from '../honors/useHonors';
import Blackjack from './Blackjack';
import { SoundToggle, useChips } from './common';
import Roulette from './Roulette';
import Slots from './Slots';
import VideoPoker from './VideoPoker';

type View = 'floor' | 'blackjack' | 'roulette' | 'slots' | 'poker' | 'shop' | 'boards' | 'cashier';
const GAMES: { id: View; name: string; icon: typeof Spade; blurb: string }[] = [
  { id: 'blackjack', name: 'Blackjack', icon: Spade, blurb: 'Beat the dealer to 21. Blackjack pays 3:2.' },
  { id: 'roulette', name: 'Roulette', icon: Dices, blurb: 'Single zero. Numbers pay 35 to 1.' },
  { id: 'slots', name: 'Golden Reels', icon: Cherry, blurb: 'Three crowns is the 200× jackpot.' },
  { id: 'poker', name: 'Video Poker', icon: Crown, blurb: 'Jacks or Better. Hold, draw, get paid.' },
];

function Floor({ go }: { go: (v: View) => void }) {
  const { settings, event } = useChips();
  return (
    <div className="space-y-6">
      {event && (
        <div className="hud flex items-center gap-3 border-gold-400/70 p-4">
          <Sparkles className="size-5 text-gold-300" />
          <p className="flex-1 text-gold-100">
            <b>{settings.eventName || 'Dice night'}</b> is on: max bet raised to {chipsFmt(settings.eventMax)} until {settings.eventUntil?.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.
          </p>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {GAMES.map((g) => (
          <button key={g.id} className="casino-tile" onClick={() => go(g.id)}>
            <g.icon className="size-10 text-gold-300" strokeWidth={1.5} />
            <b>{g.name}</b>
            <span>{g.blurb}</span>
          </button>
        ))}
      </div>
      <Panel title="Live tables">
        <p className="text-sm text-smoke">Shared tables (blackjack, roulette, slots and 5-card draw poker against the family) open in the next update.</p>
      </Panel>
    </div>
  );
}

function Shop() {
  const { me } = useHub();
  const { balance } = useChips();
  const { honors, has } = useHonors();
  const items = honors.filter((h) => (h.price ?? 0) > 0 && h.status === 'active').sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
  if (!items.length) return <p className="text-sm text-smoke">Nothing for sale yet. High Table can put any honor up for chips in the Forge.</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((h) => {
        const own = has(me.id, h.id);
        return (
          <div key={h.id} className={`honor-tile rar-${h.rarity} ${own ? 'owned' : ''}`} style={{ ['--rar' as string]: RARITIES.find((r) => r.id === h.rarity)!.color }}>
            <div className="honor-tile-pic">
              <HonorPic h={h} member={me} />
            </div>
            <b className="honor-tile-name">{h.name}</b>
            <RarityChip r={h.rarity} />
            <span className="text-[11px] text-smoke">{KINDS.find((k) => k.id === h.kind)?.label}</span>
            {own ? (
              <span className="text-xs text-ok">Yours · equip it on your Honorwall</span>
            ) : (
              <button className="btn-gold btn-sm mt-1" disabled={balance < (h.price ?? 0)} onClick={() => confirm(`Buy ${h.name} for ${chipsFmt(h.price ?? 0)} chips?`) && buyHonor(me, h.id, h.price ?? 0).then(sfx.win)}>
                <Coins className="size-3.5" /> {chipsFmt(h.price ?? 0)}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Boards() {
  const { roster, memberById } = useHub();
  const { equipped } = useHonors();
  const all = useCollection<Chips>('chips') ?? [];
  const wk = weekKey();
  const live = all.filter((c) => memberById.has(c.id) && roster.some((m) => m.id === c.id));
  const board = (title: string, rows: { id: string; v: number }[], fmt = chipsFmt) => (
    <Panel title={title}>
      <ol className="divide-y divide-line-soft">
        {rows.slice(0, 10).map((r, i) => {
          const m = memberById.get(r.id)!;
          const e = equipped(r.id);
          return (
            <li key={r.id} className="flex items-center gap-3 py-2">
              <span className={`w-6 text-center font-display ${i === 0 ? 'text-gold-200' : 'text-smoke'}`}>{i + 1}</span>
              <Framed member={m} frame={e.frame} size="md" />
              <Link to={`/members/${m.id}`} className="min-w-0 flex-1 truncate">
                <FancyName name={m.name} hue={e.nameHue} effect={e.effect?.effect} className="font-hud font-bold" />
              </Link>
              <b className="font-hud text-lg text-gold-100">{fmt(r.v)}</b>
            </li>
          );
        })}
        {!rows.length && <li className="py-2 text-sm text-smoke">Nobody yet.</li>}
      </ol>
    </Panel>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {board('This week · net', live.filter((c) => c.week === wk && (c.weekNet ?? 0) > 0).map((c) => ({ id: c.id, v: c.weekNet ?? 0 })).sort((a, b) => b.v - a.v), (n) => `+${chipsFmt(n)}`)}
      {board('High rollers · biggest stacks', live.map((c) => ({ id: c.id, v: c.balance })).sort((a, b) => b.v - a.v))}
      {board('Biggest single wins', live.filter((c) => (c.biggestWin ?? 0) > 0).map((c) => ({ id: c.id, v: c.biggestWin ?? 0 })).sort((a, b) => b.v - a.v))}
    </div>
  );
}

function Cashier() {
  const { me, roster, isLead } = useHub();
  const { balance, settings } = useChips();
  const [to, setTo] = useState('');
  const [amt, setAmt] = useState(0);
  const [why, setWhy] = useState('');
  const [grant, setGrant] = useState(false);
  const [s, setS] = useState<CasinoSettings>(settings);
  const [hours, setHours] = useState(4);
  const inQ = useMemo(() => query(collection(db, 'chipGifts'), where('to', '==', me.id)), [me.id]);
  const outQ = useMemo(() => query(collection(db, 'chipGifts'), where('from', '==', me.id)), [me.id]);
  const log = [...(useCollection<ChipGift>(inQ) ?? []), ...(useCollection<ChipGift>(outQ) ?? [])].sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now())).slice(0, 20);
  const name = (id: string) => roster.find((m) => m.id === id)?.name ?? 'someone';
  const num = (v: string) => Number(v.replace(/\D/g, '')) || 0;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Send chips">
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!to || amt <= 0 || (!grant && amt > balance)) return;
            await (grant ? grantChips(me, to, amt, why) : sendChips(me, to, amt, why));
            sfx.chip();
            setAmt(0);
            setWhy('');
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="To">
              <select className="input" value={to} onChange={(e) => setTo(e.target.value)} required>
                <option value="">Pick…</option>
                {roster
                  .filter((m) => m.id !== me.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="Chips">
              <input className="input font-mono" inputMode="numeric" value={amt || ''} onChange={(e) => setAmt(num(e.target.value))} />
            </Field>
          </div>
          <Field label="Note (optional)">
            <input className="input" value={why} maxLength={80} onChange={(e) => setWhy(e.target.value)} />
          </Field>
          {isLead && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={grant} onChange={(e) => setGrant(e.target.checked)} /> High Table grant (a prize from the house, not from your stack)
            </label>
          )}
          <button className="btn-gold" disabled={!to || amt <= 0 || (!grant && amt > balance)}>
            <Gift className="size-4" /> {grant ? 'Grant' : 'Send'} {amt ? chipsFmt(amt) : ''}
          </button>
        </form>
        <ul className="mt-4 space-y-1 text-sm">
          {log.map((g) => (
            <li key={g.id} className="flex gap-2 text-ash">
              <span className="flex-1">
                {g.from === me.id ? `To ${name(g.to)}` : `From ${g.fromName}${g.grant ? ' (grant)' : ''}`}
                {g.reason && <span className="text-smoke"> · {g.reason}</span>}
              </span>
              <b className={g.from === me.id ? 'text-red-300' : 'text-ok'}>
                {g.from === me.id ? '−' : '+'}
                {chipsFmt(g.amount)}
              </b>
              <span className="text-[11px] text-smoke">{ago(g.at)}</span>
            </li>
          ))}
        </ul>
      </Panel>
      {isLead && (
        <Panel title="House rules · High Table">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['weekly', 'Weekly allowance'],
                ['daily', 'Daily bonus'],
                ['min', 'Min bet'],
                ['max', 'Max bet'],
                ['eventMax', 'Event max bet'],
                ['perRun', 'Chips per run'],
                ['perFight', 'Per blacksite'],
                ['perDinner', 'Per dinner'],
              ] as [keyof CasinoSettings, string][]
            ).map(([k, label]) => (
              <Field key={k} label={label}>
                <input className="input font-mono" inputMode="numeric" value={(s[k] as number) || ''} onChange={(e) => setS({ ...s, [k]: num(e.target.value) })} />
              </Field>
            ))}
          </div>
          <button className="btn-gold mt-3" onClick={() => saveCasino(s)}>
            <Settings className="size-4" /> Save house rules
          </button>
          <div className="mt-5 border-t border-line-soft pt-4">
            <p className="label mb-2">Event night</p>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Name">
                <input className="input" value={s.eventName ?? ''} placeholder="Dice night" maxLength={40} onChange={(e) => setS({ ...s, eventName: e.target.value })} />
              </Field>
              <Field label="Hours">
                <input className="input w-20 font-mono" inputMode="numeric" value={hours} onChange={(e) => setHours(num(e.target.value) || 1)} />
              </Field>
              <button className="btn-gold" onClick={() => saveCasino({ ...s, eventUntil: Timestamp.fromMillis(Date.now() + hours * 3600e3) })}>
                <Sparkles className="size-4" /> Start it
              </button>
              {settings.eventUntil && settings.eventUntil.toMillis() > Date.now() && (
                <button className="btn-ghost" onClick={() => saveCasino({ ...s, eventUntil: null })}>
                  End it
                </button>
              )}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

export default function Casino() {
  const { balance, chips } = useChips();
  const [params, setParams] = useSearchParams();
  const tabs: { id: View; label: string }[] = [
    { id: 'floor', label: 'The floor' },
    ...GAMES.map((g) => ({ id: g.id, label: g.name })),
    { id: 'shop', label: 'Chip shop' },
    { id: 'boards', label: 'High rollers' },
    { id: 'cashier', label: 'Cashier' },
  ];
  const view = tabs.find((t) => t.id === params.get('tab'))?.id ?? 'floor';
  const go = (v: View) => setParams(v === 'floor' ? {} : { tab: v });
  return (
    <>
      <PageHeader
        icon={Dices}
        kicker="After hours"
        title="The Casino"
        sub="Play chips only: a weekly allowance, a daily bonus, and more for runs, fights, dinners and honors."
        actions={
          <div className="flex items-center gap-2">
            <SoundToggle />
            <div className="chip-purse">
              <span className="chip-purse-stack" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span>
                <b>{chips === undefined ? '…' : chipsFmt(balance)}</b>
                <small>chips</small>
              </span>
            </div>
          </div>
        }
      />
      <div className="mb-5">
        <Tabs value={view} onChange={go} tabs={tabs.map((t) => ({ ...t, label: t.id === 'shop' ? <span className="inline-flex items-center gap-1"><ShoppingBag className="size-3.5" />{t.label}</span> : t.id === 'boards' ? <span className="inline-flex items-center gap-1"><Trophy className="size-3.5" />{t.label}</span> : t.label }))} />
      </div>
      {view === 'floor' && <Floor go={go} />}
      {view === 'blackjack' && <Blackjack />}
      {view === 'roulette' && <Roulette />}
      {view === 'slots' && <Slots />}
      {view === 'poker' && <VideoPoker />}
      {view === 'shop' && <Shop />}
      {view === 'boards' && <Boards />}
      {view === 'cashier' && <Cashier />}
    </>
  );
}

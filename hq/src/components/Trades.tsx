import { ArrowLeftRight, Check, Handshake, MessageSquare, Undo2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useHub } from '../hooks/useHub';
import { ago } from '../lib/format';
import { thingKey, thingsIn, type Locker, type Thing } from '../lib/locker';
import { money, useMoney } from '../lib/money';
import { cashText, hasCash, NO_CASH, thingsText, type Cash, type Trade2 } from '../lib/trades';
import { Avatar } from './Avatar';
import { ErrorText, Field } from './Field';
import { Modal } from './Modal';
import { Panel } from './Page';

/** Pick things (with how many) from one of my storages, plus dirty/clean cash. */
function Basket({
  locker,
  itemName,
  storageId,
  setStorageId,
  picks,
  setPicks,
  cash,
  setCash,
}: {
  locker: Locker;
  itemName: (id: string) => string;
  storageId: string;
  setStorageId: (s: string) => void;
  picks: Record<string, number>;
  setPicks: (p: Record<string, number>) => void;
  cash: Cash;
  setCash: (c: Cash) => void;
}) {
  const m = useMoney();
  const things = thingsIn(locker.stock.get(storageId), itemName);
  return (
    <div className="space-y-3">
      <Field label="From">
        <select className="input" value={storageId} onChange={(e) => (setStorageId(e.target.value), setPicks({}))}>
          {locker.storages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="max-h-56 space-y-1 overflow-y-auto border border-line-soft p-2">
        {things.length ? (
          things.map((t) => {
            const k = thingKey(t);
            return (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-gold-400" checked={!!picks[k]} onChange={(e) => setPicks({ ...picks, [k]: e.target.checked ? 1 : 0 })} />
                <span className="min-w-0 flex-1 truncate text-ash">{t.label}</span>
                {!!picks[k] && (
                  <input
                    className="input w-20 py-0.5 font-mono text-xs"
                    inputMode="numeric"
                    value={picks[k]}
                    onChange={(e) => setPicks({ ...picks, [k]: Math.max(1, Math.min(t.qty, Math.round(+e.target.value.replace(/\D/g, '') || 1))) })}
                  />
                )}
                <span className="w-14 text-right font-mono text-xs text-smoke">/ {t.qty.toLocaleString()}</span>
              </label>
            );
          })
        ) : (
          <p className="text-xs text-smoke">Nothing in there.</p>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`Dirty cash · you have ${money(m.mine.held)}`}>
          <input className="input font-mono" inputMode="numeric" placeholder="$0" value={cash.dirty || ''} onChange={(e) => setCash({ ...cash, dirty: Math.round(+e.target.value.replace(/\D/g, '') || 0) })} />
        </Field>
        <Field label={`Clean cash · you have ${money(m.mine.clean)}`}>
          <input className="input font-mono" inputMode="numeric" placeholder="$0" value={cash.clean || ''} onChange={(e) => setCash({ ...cash, clean: Math.round(+e.target.value.replace(/\D/g, '') || 0) })} />
        </Field>
      </div>
    </div>
  );
}

function picked(locker: Locker, storageId: string, picks: Record<string, number>, itemName: (id: string) => string): Thing[] {
  return thingsIn(locker.stock.get(storageId), itemName)
    .filter((t) => picks[thingKey(t)])
    .map((t) => ({ ...t, qty: Math.min(t.qty, picks[thingKey(t)]!) }));
}

function useCashCheck() {
  const m = useMoney();
  return (c: Cash) => (c.dirty > m.mine.held ? 'You don’t have that much dirty cash.' : c.clean > m.mine.clean ? 'You don’t have that much clean cash.' : null);
}

/** Start a trade: things and/or cash to someone. */
export function NewTrade({ locker, itemName, onClose, start }: { locker: Locker; itemName: (id: string) => string; onClose: () => void; start?: { storageId: string; thing: Thing } }) {
  const { roster, me } = useHub();
  const check = useCashCheck();
  const [to, setTo] = useState(roster.find((r) => r.id !== me.id)?.id ?? '');
  const [storageId, setStorageId] = useState(start?.storageId ?? locker.storages[0]?.id ?? 'onme');
  const [picks, setPicks] = useState<Record<string, number>>(start ? { [thingKey(start.thing)]: start.thing.qty } : {});
  const [cash, setCash] = useState<Cash>(NO_CASH);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const things = picked(locker, storageId, picks, itemName);
    if (!things.length && !hasCash(cash)) return setError('Add something or some cash.');
    const c = check(cash);
    if (c) return setError(c);
    const r = roster.find((x) => x.id === to);
    if (!r) return setError('Pick who it’s for.');
    setBusy(true);
    const ok = await locker.offerMany(storageId, things, cash, { id: r.id, name: r.name }, note);
    setBusy(false);
    if (!ok) return setError('Those aren’t there any more.');
    onClose();
  }
  return (
    <Modal title="New trade" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="To">
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>
            {roster
              .filter((r) => r.id !== me.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
          </select>
        </Field>
        <Basket locker={locker} itemName={itemName} storageId={storageId} setStorageId={setStorageId} picks={picks} setPicks={setPicks} cash={cash} setCash={setCash} />
        <Field label="Message">
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} placeholder="Optional, e.g. for the job tonight" />
        </Field>
        <p className="text-xs text-smoke">Your things leave your locker now and are held until they answer. They can accept, decline, or offer something back.</p>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            <Handshake className="size-4" /> Offer
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Answer with something back. */
function Counter({ locker, itemName, t, onClose }: { locker: Locker; itemName: (id: string) => string; t: Trade2; onClose: () => void }) {
  const { narco } = useHub();
  const check = useCashCheck();
  const [storageId, setStorageId] = useState(locker.storages[0]?.id ?? 'onme');
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [cash, setCash] = useState<Cash>(NO_CASH);
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title={`Counter ${t.fromName}`} onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const back = picked(locker, storageId, picks, itemName);
          if (!back.length && !hasCash(cash)) return setError('Add something or some cash, or just accept.');
          const c = check(cash);
          if (c) return setError(c);
          await locker.counter(t, storageId, back, cash, reply);
          onClose();
        }}
      >
        <p className="text-sm text-ash">
          They offer <b className="text-gold-100">{[thingsText(t.things, narco), cashText(t.cash)].filter(Boolean).join(' + ')}</b>. What do you give back? It’s held until they confirm; what they sent lands in the storage you pick here.
        </p>
        <Basket locker={locker} itemName={itemName} storageId={storageId} setStorageId={setStorageId} picks={picks} setPicks={setPicks} cash={cash} setCash={setCash} />
        <Field label="Message">
          <input className="input" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={80} placeholder="Optional" />
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">
            <ArrowLeftRight className="size-4" /> Send counter
          </button>
        </div>
      </form>
    </Modal>
  );
}

const Side = ({ things, cash }: { things?: Thing[]; cash?: Cash }) => {
  const { narco } = useHub();
  const parts = [thingsText(things, narco), cashText(cash)].filter(Boolean);
  return <b className="text-gold-100">{parts.length ? parts.join(' + ') : 'nothing'}</b>;
};

/** Open trades, both ways, with one-line messages. */
export function TradesPanel({ locker, itemName }: { locker: Locker; itemName: (id: string) => string }) {
  const { memberById } = useHub();
  const [into, setInto] = useState<Record<string, string>>({});
  const [reply, setReply] = useState<Record<string, string>>({});
  const [countering, setCountering] = useState<Trade2 | null>(null);
  const v2 = (rows: unknown[]) => rows.filter((t) => (t as Trade2).v === 2) as Trade2[];
  const inbox = v2(locker.tradesIn).filter((t) => t.status === 'pending' || t.status === 'countered');
  const outbox = v2(locker.tradesOut).filter((t) => t.status === 'pending' || t.status === 'countered');
  const recent = [...v2(locker.tradesIn), ...v2(locker.tradesOut)]
    .filter((t) => (t.status === 'done' || t.status === 'declined') && t.closedAt && Date.now() - t.closedAt.toMillis() < 3 * 86400e3)
    .sort((a, b) => (b.closedAt?.toMillis() ?? 0) - (a.closedAt?.toMillis() ?? 0))
    .slice(0, 5);
  if (!inbox.length && !outbox.length && !recent.length) return null;
  const pick = (id: string) => (
    <select className="input w-auto py-1 text-sm" value={into[id] ?? locker.storages[0]!.id} onChange={(e) => setInto({ ...into, [id]: e.target.value })}>
      {locker.storages.map((s) => (
        <option key={s.id} value={s.id}>
          Into {s.name}
        </option>
      ))}
    </select>
  );
  return (
    <Panel title="Trades" className="mb-6">
      <ul className="space-y-2">
        {inbox.map((t) => (
          <li key={t.id} className="border border-gold-700/50 bg-gold-400/5 px-3 py-2">
            <div className="flex items-start gap-3">
              <Avatar member={memberById.get(t.from)} />
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  <b className="text-gold-100">{t.fromName}</b> offers <Side things={t.things} cash={t.cash} />
                  {t.note && <span className="text-smoke"> · “{t.note}”</span>}
                </p>
                {t.status === 'countered' && (
                  <p className="mt-0.5 text-ash">
                    You countered with <Side things={t.back} cash={t.backCash} />. Waiting on them to confirm.
                  </p>
                )}
                <p className="text-xs text-smoke">{ago(t.at)}</p>
              </div>
            </div>
            {t.status === 'pending' && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input min-w-40 flex-1 py-1 text-sm" placeholder="Message back (optional)" maxLength={80} value={reply[t.id] ?? ''} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} />
                {pick(t.id)}
                <button className="btn-gold btn-sm" onClick={() => locker.acceptAsIs(t, into[t.id] ?? locker.storages[0]!.id, reply[t.id] ?? '')}>
                  <Check className="size-3.5" /> Accept
                </button>
                <button className="btn-ghost btn-sm" onClick={() => setCountering(t)}>
                  <ArrowLeftRight className="size-3.5" /> Counter
                </button>
                <button className="btn-danger btn-sm" onClick={() => locker.declineTrade(t, reply[t.id] ?? '')}>
                  <X className="size-3.5" /> Decline
                </button>
              </div>
            )}
          </li>
        ))}
        {outbox.map((t) => (
          <li key={t.id} className="border border-line-soft px-3 py-2">
            <div className="flex items-start gap-3">
              <Avatar member={memberById.get(t.to)} />
              <div className="min-w-0 flex-1 text-sm">
                <p>
                  You offered <b className="text-gold-100">{t.toName}</b> <Side things={t.things} cash={t.cash} />
                </p>
                {t.status === 'countered' ? (
                  <p className="mt-0.5 text-ash">
                    They want to give you <Side things={t.back} cash={t.backCash} /> back
                    {t.reply && <span className="text-smoke"> · “{t.reply}”</span>}
                  </p>
                ) : (
                  <p className="text-xs text-smoke">Waiting on them · {ago(t.at)}</p>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
              {t.status === 'countered' ? (
                <>
                  {pick(t.id)}
                  <button className="btn-gold btn-sm" onClick={() => locker.confirmCounter(t, into[t.id] ?? t.fromStorage)}>
                    <Handshake className="size-3.5" /> Deal
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => locker.declineCounter(t)}>
                    <X className="size-3.5" /> No deal
                  </button>
                </>
              ) : (
                <button className="btn-ghost btn-sm" onClick={() => locker.cancelOffer(t)}>
                  <Undo2 className="size-3.5" /> Cancel
                </button>
              )}
            </div>
          </li>
        ))}
        {recent.map((t) => {
          const mine = t.from === locker.meId;
          return (
            <li key={t.id} className="flex items-center gap-2 px-1 text-xs text-smoke">
              <MessageSquare className="size-3.5 shrink-0" />
              <span>
                {t.status === 'done' ? 'Done' : 'Turned down'}: {mine ? `you ↔ ${t.toName}` : `${t.fromName} ↔ you`}
                {t.reply && <span className="text-ash"> · “{t.reply}”</span>} · {ago(t.closedAt)}
              </span>
            </li>
          );
        })}
      </ul>
      {countering && <Counter locker={locker} itemName={itemName} t={countering} onClose={() => setCountering(null)} />}
    </Panel>
  );
}

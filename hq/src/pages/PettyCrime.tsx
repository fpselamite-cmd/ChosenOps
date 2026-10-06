import { Check, HandCoins, Minus, Plus, Send, Trash2, Trophy, X } from 'lucide-react';
import { collection, query, where } from 'firebase/firestore';
import { useMemo, useState, type FormEvent } from 'react';
import { Avatar } from '../components/Avatar';
import { Empty, ErrorText, Field } from '../components/Field';
import { MemberName } from '../components/MemberName';
import { Modal } from '../components/Modal';
import { PageHeader, Panel, Stat } from '../components/Page';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import { ago } from '../lib/format';
import { adjustRep, confirmTransfer, deleteCrime, logCrime, rejectTransfer, requestTransfer } from '../lib/petty';
import { PETTY_CRIMES, type PettyCrime as Crime, type PettyRep, type RepTransfer } from '../lib/types';

const n = (v: number) => v.toLocaleString('en-US');
const money = (v: number) => `$${v.toLocaleString('en-US')}`;

function LogCrime({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const [crime, setCrime] = useState(PETTY_CRIMES[0]!);
  const [other, setOther] = useState('');
  const [rep, setRep] = useState('');
  const [cash, setCash] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = Math.round(Number(rep) || 0);
    const c = Math.round(Number(cash) || 0);
    if (r < 0 || c < 0) return setError('Numbers can’t be negative.');
    const name = crime === 'Other' ? other.trim() || 'Other' : crime;
    try {
      await logCrime(memberId, { crime: name, rep: r, cash: c, notes: notes.trim() });
      onClose();
    } catch {
      setError('Couldn’t save that. Try again.');
    }
  }
  return (
    <Modal title="Log a crime" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="What">
          <div className="flex flex-wrap gap-1.5">
            {PETTY_CRIMES.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCrime(c)}
                className={`chip px-3 py-1.5 text-xs ${crime === c ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </Field>
        {crime === 'Other' && (
          <Field label="Name it">
            <input className="input" value={other} onChange={(e) => setOther(e.target.value)} maxLength={40} autoFocus />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Rep earned">
            <input className="input font-mono" inputMode="numeric" value={rep} onChange={(e) => setRep(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </Field>
          <Field label="Cash made">
            <input className="input font-mono" inputMode="numeric" value={cash} onChange={(e) => setCash(e.target.value.replace(/\D/g, ''))} placeholder="$0" />
          </Field>
        </div>
        <Field label="Notes">
          <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={140} placeholder="Optional" />
        </Field>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold">Log it</button>
        </div>
      </form>
    </Modal>
  );
}

function SendToFamily({ memberId, available, onClose }: { memberId: string; available: number; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const a = Math.round(Number(amount) || 0);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (a <= 0) return setError('Enter how much rep to send.');
    if (a > available) return setError(`You only have ${n(available)} petty rep.`);
    try {
      await requestTransfer(memberId, a);
      onClose();
    } catch {
      setError('Couldn’t send that. Try again.');
    }
  }
  return (
    <Modal title="Send rep to the family" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-ash">
          It leaves your petty rep now and waits for a Lieutenant or above to confirm it in the city. If they turn it down, you get it back.
        </p>
        <Field label={`Amount · you have ${n(available)}`}>
          <input className="input font-mono text-lg" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} autoFocus />
        </Field>
        <div className="flex flex-wrap gap-1.5">
          {[25, 50, 100].map((p) => (
            <button type="button" key={p} className="btn-ghost btn-sm" onClick={() => setAmount(String(Math.floor((available * p) / 100)))}>
              {p === 100 ? 'All' : `${p}%`}
            </button>
          ))}
        </div>
        <ErrorText error={error} />
        <button className="btn-gold w-full py-3">
          <Send className="size-4" /> Send {a > 0 ? n(a) : ''} rep
        </button>
      </form>
    </Modal>
  );
}

const STATUS = {
  pending: 'bg-warn/20 text-amber-300',
  confirmed: 'bg-ok/15 text-green-300',
  rejected: 'bg-danger/20 text-red-300',
};

export default function PettyCrime() {
  const { me, can, familyRep, memberById, myRank } = useHub();
  const reps = useCollection<PettyRep>('petty') ?? [];
  const transfers = useCollection<RepTransfer>('repTransfers') ?? [];
  const mineQuery = useMemo(() => query(collection(db, 'pettyLog'), where('memberId', '==', me.id)), [me.id]);
  const myCrimes = (useCollection<Crime>(mineQuery) ?? []).sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now()));
  const [logging, setLogging] = useState(false);
  const [sending, setSending] = useState(false);
  const [custom, setCustom] = useState('');

  const myRep = reps.find((r) => r.id === me.id)?.rep ?? 0;
  const mine = transfers.filter((t) => t.memberId === me.id).sort((a, b) => (b.at?.toMillis() ?? 0) - (a.at?.toMillis() ?? 0));
  const sent = mine.filter((t) => t.status === 'confirmed').reduce((s, t) => s + t.amount, 0);
  const waiting = mine.filter((t) => t.status === 'pending').reduce((s, t) => s + t.amount, 0);
  const pending = transfers.filter((t) => t.status === 'pending').sort((a, b) => (a.at?.toMillis() ?? 0) - (b.at?.toMillis() ?? 0));
  const confirmer = can('confirmRep');

  const repBoard = reps.filter((r) => r.rep > 0 && memberById.get(r.id)?.status === 'active').sort((a, b) => b.rep - a.rep).slice(0, 8);
  const givers = [...transfers.filter((t) => t.status === 'confirmed').reduce((m, t) => m.set(t.memberId, (m.get(t.memberId) ?? 0) + t.amount), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  const bump = (d: number) => {
    if (myRep + d < 0) return;
    adjustRep(me.id, d);
  };

  return (
    <>
      <PageHeader
        icon={HandCoins}
        kicker="Street"
        title="Petty Crime"
        sub="Track your own petty rep and send some to the family. Every bit you send builds The Chosen’s gang rep."
        actions={
          <>
            <button className="btn-ghost" onClick={() => setLogging(true)}>
              <Plus className="size-4" /> Log a crime
            </button>
            <button className="btn-gold" onClick={() => setSending(true)} disabled={myRep <= 0}>
              <Send className="size-4" /> Send to family
            </button>
          </>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="hud px-4 py-3 sm:col-span-2 lg:col-span-1">
          <p className="label">Your petty rep</p>
          <p className="mt-1 font-mono text-4xl font-semibold text-gold-100">{n(myRep)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {[-10, -1, 1, 10].map((d) => (
              <button key={d} className="btn-ghost btn-sm px-2 font-mono" onClick={() => bump(d)} disabled={myRep + d < 0}>
                {d > 0 ? <Plus className="size-3" /> : <Minus className="size-3" />}
                {Math.abs(d)}
              </button>
            ))}
          </div>
          <form
            className="mt-2 flex gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Math.round(Number(custom));
              if (Number.isFinite(v) && v !== 0) bump(v);
              setCustom('');
            }}
          >
            <input className="input py-1 font-mono text-xs" placeholder="±amount" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d-]/g, ''))} />
            <button className="btn-ghost btn-sm">Apply</button>
          </form>
        </div>
        <Stat label="Family rep" value={n(familyRep)} sub="The Chosen’s gang rep" />
        <Stat label="You’ve sent" value={n(sent)} sub="Confirmed to the family" />
        <Stat label="Waiting" value={n(waiting)} sub="Sent, not confirmed yet" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {confirmer && (
            <Panel title={`To confirm · ${pending.length}`}>
              {pending.length ? (
                <ul className="divide-y divide-line-soft">
                  {pending.map((t) => {
                    const own = t.memberId === me.id && myRank?.order !== 0;
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5">
                        <Avatar member={memberById.get(t.memberId)} />
                        <span className="min-w-0 flex-1">
                          <MemberName id={t.memberId} /> <span className="text-ash">is sending</span>{' '}
                          <span className="font-mono font-semibold text-gold-200">{n(t.amount)}</span> <span className="text-ash">rep</span>
                          <span className="block text-xs text-smoke">{ago(t.at)}</span>
                        </span>
                        {own ? (
                          <span className="text-xs text-smoke">Someone else confirms yours</span>
                        ) : (
                          <span className="flex gap-1.5">
                            <button className="btn-gold btn-sm" onClick={() => confirmTransfer(t, me.id)}>
                              <Check className="size-3.5" /> Confirm
                            </button>
                            <button className="btn-danger btn-sm" onClick={() => rejectTransfer(t, me.id)}>
                              <X className="size-3.5" /> Reject
                            </button>
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-smoke">Nothing waiting.</p>
              )}
            </Panel>
          )}

          <Panel title="Your crimes">
            {myCrimes.length ? (
              <ul className="divide-y divide-line-soft">
                {myCrimes.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-gold-100">{c.crime}</span>
                      {c.notes && <span className="text-sm text-smoke"> · {c.notes}</span>}
                      <span className="block text-xs text-smoke">{ago(c.at)}</span>
                    </span>
                    <span className="text-right font-mono text-sm">
                      <span className="block text-gold-200">+{n(c.rep)} rep</span>
                      {c.cash > 0 && <span className="block text-green-300">{money(c.cash)}</span>}
                    </span>
                    <button className="p-1 text-smoke hover:text-red-300" title="Remove" onClick={() => deleteCrime(c, myRep)}>
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={<HandCoins className="size-7" />} title="No crimes logged">
                Log a job to keep track of the rep and cash it brought in, or just use the +/− buttons.
              </Empty>
            )}
          </Panel>

          <Panel title="Your transfers">
            {mine.length ? (
              <ul className="divide-y divide-line-soft">
                {mine.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <span className="font-mono font-semibold text-gold-200">{n(t.amount)}</span>
                    <span className="flex-1 text-sm text-smoke">
                      {ago(t.at)}
                      {t.decidedBy && (
                        <>
                          {' '}
                          · {t.status} by <MemberName id={t.decidedBy} />
                        </>
                      )}
                    </span>
                    <span className={`chip ${STATUS[t.status]}`}>{t.status}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-smoke">You haven’t sent any rep to the family yet.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Top petty rep" right={<Trophy className="size-4 text-gold-400" />}>
            <ol className="space-y-2">
              {repBoard.map((r, i) => (
                <li key={r.id} className="flex items-center gap-3">
                  <span className="w-5 font-mono text-sm text-gold-500">{i + 1}</span>
                  <Avatar member={memberById.get(r.id)} size="xs" />
                  <MemberName id={r.id} className="flex-1 truncate" />
                  <span className="font-mono text-sm text-gold-200">{n(r.rep)}</span>
                </li>
              ))}
              {!repBoard.length && <li className="text-sm text-smoke">Nobody yet.</li>}
            </ol>
          </Panel>
          <Panel title="Gave the most to the family">
            <ol className="space-y-2">
              {givers.map(([id, total], i) => (
                <li key={id} className="flex items-center gap-3">
                  <span className="w-5 font-mono text-sm text-gold-500">{i + 1}</span>
                  <Avatar member={memberById.get(id)} size="xs" />
                  <MemberName id={id} className="flex-1 truncate" />
                  <span className="font-mono text-sm text-gold-200">{n(total)}</span>
                </li>
              ))}
              {!givers.length && <li className="text-sm text-smoke">Nobody yet.</li>}
            </ol>
          </Panel>
        </div>
      </div>

      {logging && <LogCrime memberId={me.id} onClose={() => setLogging(false)} />}
      {sending && <SendToFamily memberId={me.id} available={myRep} onClose={() => setSending(false)} />}
    </>
  );
}

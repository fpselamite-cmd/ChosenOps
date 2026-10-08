import { ArrowLeft, Crown, LogIn, LogOut, Plus, Users } from 'lucide-react';
import { useState } from 'react';
import { Field } from '../../../components/Field';
import { Modal } from '../../../components/Modal';
import { Panel } from '../../../components/Page';
import { useCollection } from '../../../hooks/useCollection';
import { useHub } from '../../../hooks/useHub';
import { chipsFmt } from '../../../lib/casino';
import { closeTable, LIVE_GAMES, openTable, sit, stand, takeOver, type LiveGame, type LiveTable } from '../../../lib/tables';
import { useChips } from '../common';
import LiveBlackjack, { type BlackjackRound } from './LiveBlackjack';
import LivePoker, { type PokerRound } from './LivePoker';
import LiveRoulette, { type RouletteRound } from './LiveRoulette';
import LiveSlots from './LiveSlots';
import { useTable } from './useLive';

function NewTable({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const { me } = useHub();
  const { min } = useChips();
  const [game, setGame] = useState<LiveGame>('poker');
  const [name, setName] = useState('');
  const [minBet, setMinBet] = useState(Math.max(min, 25));
  return (
    <Modal title="Open a table" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ref = await openTable(me, game, name, minBet);
          onOpen(ref.id);
        }}
      >
        <Field label="Game">
          <div className="grid grid-cols-2 gap-2">
            {LIVE_GAMES.map((g) => (
              <button key={g.id} type="button" className={`chip px-3 py-2 text-sm ${game === g.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`} onClick={() => setGame(g.id)}>
                {g.name} · {g.seats} seats
              </button>
            ))}
          </div>
        </Field>
        <Field label="Table name (optional)">
          <input className="input" value={name} maxLength={40} placeholder={`${me.name}'s table`} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={game === 'poker' ? 'Ante' : 'Minimum bet'}>
          <input className="input w-32 font-mono" inputMode="numeric" value={minBet || ''} onChange={(e) => setMinBet(Number(e.target.value.replace(/\D/g, '')) || 0)} />
        </Field>
        <div className="flex justify-end">
          <button className="btn-gold" disabled={minBet < min}>
            <Plus className="size-4" /> Open it
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Open tables on the floor. */
export function Lobby({ open }: { open: (id: string) => void }) {
  const tables = (useCollection<LiveTable>('casinoTables') ?? []).filter((t) => t.status === 'open').sort((a, b) => Object.keys(b.seats).length - Object.keys(a.seats).length);
  const [making, setMaking] = useState(false);
  return (
    <Panel
      title={`Live tables · ${tables.length}`}
      right={
        <button className="btn-gold btn-sm" onClick={() => setMaking(true)}>
          <Plus className="size-3.5" /> Open a table
        </button>
      }
    >
      {tables.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tables.map((t) => {
            const g = LIVE_GAMES.find((x) => x.id === t.game)!;
            const n = Object.keys(t.seats).length;
            return (
              <button key={t.id} className="live-lobby" onClick={() => open(t.id)}>
                <span className="label text-[9px] text-gold-500">{g.name}</span>
                <b>{t.name}</b>
                <span className="flex items-center gap-1.5 text-xs text-smoke">
                  <Users className="size-3.5" /> {n}/{t.maxSeats} · {t.game === 'poker' ? 'ante' : 'min'} {chipsFmt(t.minBet)} · dealt by {t.hostName}
                </span>
                <span className="text-xs text-gold-100/70">{Object.values(t.seats).map((s) => s.name).join(', ')}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-smoke">No tables open. Open one and the family can sit down with you.</p>
      )}
      {making && <NewTable onClose={() => setMaking(false)} onOpen={(id) => (setMaking(false), open(id))} />}
    </Panel>
  );
}

/** One live table: seats along the top, the game below. */
export function TableView({ id, onBack }: { id: string; onBack: () => void }) {
  const { me, isLead } = useHub();
  const { t, seated, isHost, quiet } = useTable<unknown>(id);
  if (t === undefined) return <p className="text-smoke">Finding the table…</p>;
  if (!t)
    return (
      <div className="space-y-3">
        <p className="text-smoke">That table has closed.</p>
        <button className="btn-ghost btn-sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" /> Back to the floor
        </button>
      </div>
    );
  const g = LIVE_GAMES.find((x) => x.id === t.game)!;
  const full = Object.keys(t.seats).length >= t.maxSeats;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="flex items-center gap-1.5 text-sm text-smoke hover:text-gold-200" onClick={onBack}>
          <ArrowLeft className="size-4" /> The floor
        </button>
        <span className="flex-1 text-center">
          <span className="label text-[9px] text-gold-500">{g.name}</span>
          <b className="block font-display text-xl text-gold-100">{t.name}</b>
        </span>
        {seated ? (
          <button className="btn-ghost btn-sm" onClick={() => stand(t, me.id).then(onBack)}>
            <LogOut className="size-3.5" /> Leave
          </button>
        ) : (
          <button className="btn-gold btn-sm" disabled={full} onClick={() => sit(t, me)}>
            <LogIn className="size-3.5" /> {full ? 'Table full' : 'Sit down'}
          </button>
        )}
        {(isHost || isLead) && (
          <button className="text-xs text-smoke hover:text-red-300" onClick={() => confirm('Close this table for everyone?') && closeTable(t.id).then(onBack)}>
            Close
          </button>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {Object.entries(t.seats).map(([sid, s]) => (
          <span key={sid} data-seat={sid} className={`chip px-2.5 py-1 text-xs ${sid === me.id ? 'border-gold-400 text-gold-200' : 'text-ash'}`}>
            {sid === t.host && <Crown className="mr-1 inline size-3 text-gold-300" />}
            {s.name}
          </span>
        ))}
      </div>
      {seated && quiet && !isHost && (
        <div className="hud flex flex-wrap items-center gap-3 border-yellow-400/50 p-3 text-sm">
          <span className="flex-1">The dealer ({t.hostName}) has gone quiet.</span>
          <button className="btn-gold btn-sm" onClick={() => takeOver(t, me)}>
            Take over dealing
          </button>
        </div>
      )}
      {!seated ? (
        <p className="text-center text-sm text-smoke">Sit down to play. You can watch from here.</p>
      ) : null}
      {/* Watchers see the table; only seated players can bet or act. */}
      <div className={seated ? '' : 'pointer-events-none select-none'}>
        {t.game === 'roulette' && <LiveRoulette t={t as LiveTable<RouletteRound>} isHost={isHost} />}
        {t.game === 'blackjack' && <LiveBlackjack t={t as LiveTable<BlackjackRound>} isHost={isHost} />}
        {t.game === 'poker' && <LivePoker t={t as LiveTable<PokerRound>} isHost={isHost} />}
      </div>
      {t.game === 'slots' && seated && <LiveSlots t={t} />}
    </div>
  );
}

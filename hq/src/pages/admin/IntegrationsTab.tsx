import { limitToLast, onValue, query, ref } from 'firebase/database';
import { Cannabis, Check, ExternalLink, Link2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { ago } from '../../lib/format';
import { accessFor, noelNameOf, setNoelName } from '../../lib/noelAccess';
import type { Member } from '../../lib/types';
import { NOELOPS_URL, noelDb, noelRef, useNoel } from '../../lib/noelops';

/** Is the live NoelOps link up, can we read it, and when did anything last happen there? */
function NoelStatus() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [last, setLast] = useState<number | null | undefined>(undefined);
  const main = useNoel<{ name?: string }>('settings/mainStash');
  useEffect(() => onValue(ref(noelDb(), '.info/connected'), (s) => setConnected(s.val() === true)), []);
  useEffect(
    () =>
      onValue(
        query(noelRef('activity'), limitToLast(1)),
        (s) => {
          let ts: number | null = null;
          s.forEach((c) => {
            const v = c.val() as { ts?: number; at?: number } | null;
            ts = v?.ts ?? v?.at ?? null;
          });
          setLast(ts);
        },
        () => setLast(null),
      ),
    [],
  );
  const readable = main.data !== undefined && !main.error;
  const ok = connected && readable;
  const rows: [string, string, boolean | null][] = [
    ['Connection', connected === null ? 'Checking…' : connected ? 'Live' : 'Offline', connected],
    ['Reading stock', main.data === undefined ? 'Checking…' : readable ? 'Working' : 'Blocked', main.data === undefined ? null : readable],
    ['Last NoelOps activity', last === undefined ? 'Checking…' : last ? ago(new Date(last)) : 'Nothing recent', last ? true : null],
  ];
  return (
    <Panel title="NoelOps link" right={<Cannabis className="size-4 text-gold-500" />}>
      <div className="mb-3 flex items-center gap-3">
        <span className={`status-light ${ok ? 'ok' : connected === null ? '' : 'warn'}`} aria-hidden />
        <p className="font-hud text-sm font-bold tracking-[0.2em] text-gold-100 uppercase">{ok ? 'Two-way sync is live' : connected === null ? 'Checking…' : 'Sync needs a look'}</p>
      </div>
      <ul className="divide-y divide-line-soft text-sm">
        {rows.map(([k, v, good]) => (
          <li key={k} className="flex items-center justify-between py-1.5">
            <span className="text-smoke">{k}</span>
            <span className={good === null ? 'text-ash' : good ? 'text-ok' : 'text-red-300'}>{v}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-smoke">Drug counts, grows, cooks and runs live in NoelOps; the HQ reads and writes them as they happen.</p>
      <a href={NOELOPS_URL} target="_blank" rel="noopener" className="btn-ghost btn-sm mt-3">
        Open NoelOps <ExternalLink className="size-3.5" />
      </a>
    </Panel>
  );
}

function NameBox({ m, crewNames }: { m: Member; crewNames: string[] }) {
  const [v, setV] = useState(m.noelName ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => setV(m.noelName ?? ''), [m.noelName]);
  const save = async () => {
    if (v.trim() === (m.noelName ?? '')) return;
    await setNoelName(m.id, v);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  return (
    <span className="flex items-center gap-1.5">
      <input className="input w-40 py-1 text-sm" value={v} placeholder={m.name} maxLength={30} list="noel-crew-names" onChange={(e) => setV(e.target.value)} onBlur={save} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()} aria-label={`NoelOps name for ${m.name}`} />
      {saved ? <Check className="size-4 text-ok" /> : <span className="size-4" />}
      <datalist id="noel-crew-names">
        {crewNames.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </span>
  );
}

/**
 * Leadership links each member to the name they go by in NoelOps (often just a first name), so their NoelOps
 * stats and history stay theirs. Access itself comes from the Narco role and leadership.
 */
function NoelNames() {
  const { roster, rankById, holders } = useHub();
  const crew = useNoel<Record<string, { name?: string }>>('crew');
  const holderOf = new Map(holders.map((h) => [h.id, h]));
  const rows = roster
    .map((m) => ({ m, a: accessFor(m, rankById.get(m.rankId ?? ''), holderOf.get(m.id)) }))
    .filter((r) => r.a)
    .sort((x, y) => (x.a!.lvl === y.a!.lvl ? x.m.name.localeCompare(y.m.name) : x.a!.lvl === 'member' ? 1 : y.a!.lvl === 'member' ? -1 : 0));
  const crewNames = [...new Set(Object.values(crew.data ?? {}).map((c) => c?.name?.trim()).filter((n): n is string => !!n))].sort();
  const linked = new Set(rows.map((r) => noelNameOf(r.m).toLowerCase()));
  const unlinked = crewNames.filter((n) => !linked.has(n.toLowerCase()));
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.filter((r) => r.a!.lvl !== 'member' || r.m.noelName);
  return (
    <Panel title="NoelOps names" right={<Link2 className="size-4 text-gold-500" />} className="mt-6">
      <p className="mb-3 text-sm text-ash">
        The name each person goes by in NoelOps. Leave it blank if it's the same as their HQ name. Getting in comes from the <b>Narco</b> role (or leadership); this just keeps their NoelOps stats and history theirs.
      </p>
      {unlinked.length > 0 && (
        <p className="mb-3 rounded border border-yellow-400/40 bg-yellow-400/5 p-2 text-xs text-yellow-100">
          NoelOps crew not linked to anyone yet: <b>{unlinked.join(', ')}</b>
        </p>
      )}
      <ul className="divide-y divide-line-soft">
        {shown.map(({ m, a }) => (
          <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <b className="text-gold-100">{m.name}</b>
              <span className="ml-2 text-xs text-smoke">{rankById.get(m.rankId ?? '')?.name}</span>
            </span>
            <span className={`chip px-2 py-0.5 text-[10px] ${a!.lvl === 'manage' ? 'text-gold-200' : a!.lvl === 'edit' ? 'text-ok' : 'text-smoke'}`}>{a!.lvl === 'manage' ? 'Leadership' : a!.lvl === 'edit' ? 'Narco' : 'No access'}</span>
            <NameBox m={m} crewNames={crewNames} />
          </li>
        ))}
      </ul>
      <button className="mt-2 text-xs text-smoke hover:text-gold-200" onClick={() => setAll(!all)}>
        {all ? 'Only Narco and leadership' : `Show everyone (${rows.length})`}
      </button>
    </Panel>
  );
}

export default function IntegrationsTab() {
  return (
    <div className="max-w-2xl">
      <NoelStatus />
      <NoelNames />
    </div>
  );
}

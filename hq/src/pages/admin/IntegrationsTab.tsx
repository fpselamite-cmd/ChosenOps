import { limitToLast, onValue, query, ref } from 'firebase/database';
import { Cannabis, ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Panel } from '../../components/Page';
import { ago } from '../../lib/format';
import { NOELOPS_URL, noelDb, noelRef, useNoel } from '../../lib/noelops';
import DiscordTab from './DiscordTab';

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

export default function IntegrationsTab() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
      <div>
        <DiscordTab />
      </div>
      <NoelStatus />
    </div>
  );
}

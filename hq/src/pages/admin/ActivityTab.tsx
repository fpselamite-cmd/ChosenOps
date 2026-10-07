import { collection, limit, orderBy, query } from 'firebase/firestore';
import { Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Empty } from '../../components/Field';
import { MemberName } from '../../components/MemberName';
import { Panel } from '../../components/Page';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { FeedEntry, FeedKind } from '../../lib/adminData';
import { db } from '../../lib/firebase';
import { ago, fmtDate, fmtTime } from '../../lib/format';

const KINDS: { id: FeedKind | ''; label: string }[] = [
  { id: '', label: 'Everything' },
  { id: 'join', label: 'Joins' },
  { id: 'rank', label: 'Ranks & status' },
  { id: 'fix', label: 'Admin fixes' },
  { id: 'merge', label: 'Merges' },
  { id: 'delete', label: 'Deletes' },
  { id: 'settings', label: 'Settings' },
  { id: 'price', label: 'Prices' },
  { id: 'list', label: 'Lists' },
  { id: 'stash', label: 'Stash' },
];
const TONE: Partial<Record<FeedKind, string>> = { delete: 'text-red-300', merge: 'text-red-200', fix: 'text-sky-300', join: 'text-ok', price: 'text-green-300' };

/** Big actions across the HQ, newest first. Admins only. */
export default function ActivityTab() {
  const { roster } = useHub();
  const q = useMemo(() => query(collection(db, 'adminFeed'), orderBy('at', 'desc'), limit(300)), []);
  const rows = useCollection<FeedEntry>(q);
  const [kind, setKind] = useState<FeedKind | ''>('');
  const [who, setWho] = useState('');
  const [text, setText] = useState('');
  const list = (rows ?? []).filter((r) => (!kind || r.kind === kind || (kind === 'rank' && r.kind === 'status')) && (!who || r.by === who || r.target === who) && (!text || `${r.text} ${r.reason ?? ''}`.toLowerCase().includes(text.toLowerCase())));
  // Group by day.
  const days = new Map<string, FeedEntry[]>();
  list.forEach((r) => {
    const d = r.at ? fmtDate(r.at) : 'Just now';
    days.set(d, [...(days.get(d) ?? []), r]);
  });
  return (
    <Panel title={`Activity · ${list.length}`} right={<Activity className="size-4 text-gold-500" />}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select className="input w-auto" value={kind} onChange={(e) => setKind(e.target.value as FeedKind | '')}>
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Anyone</option>
          {roster.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <input className="input max-w-xs" placeholder="Search" value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {rows === null ? (
        <p className="text-sm text-smoke">Loading…</p>
      ) : !list.length ? (
        <Empty title="Nothing yet">Joins, rank changes, admin fixes, merges, settings and price changes show up here.</Empty>
      ) : (
        <div className="space-y-4">
          {[...days.entries()].map(([d, items]) => (
            <div key={d}>
              <p className="label mb-1 text-gold-500">{d}</p>
              <ul className="divide-y divide-line-soft border border-line-soft">
                {items.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2 text-sm">
                    <span className="w-16 shrink-0 font-mono text-[11px] text-smoke" title={ago(r.at)}>
                      {r.at ? fmtTime(r.at).replace(/ \w+$/, '') : ''}
                    </span>
                    <span className={`label w-16 shrink-0 text-[9px] ${TONE[r.kind] ?? 'text-gold-400'}`}>{r.kind}</span>
                    <span className="min-w-0 flex-1 text-ash">
                      <MemberName id={r.by} className="text-sm" /> · {r.text}
                      {r.reason && <span className="block text-xs text-smoke italic">“{r.reason}”</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

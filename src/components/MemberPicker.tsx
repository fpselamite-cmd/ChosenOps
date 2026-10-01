import { useState } from 'react';
import { useHub } from '../hooks/useHub';
import { displayName } from '../lib/format';
import { Avatar } from './Avatar';

/** Choose several members (characters) — used to tag lore and chronicle entries. */
export function MemberPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const { members, memberById } = useHub();
  const [q, setQ] = useState('');
  const active = members.filter((m) => m.status === 'active');
  const matches = q.trim()
    ? active
        .filter((m) => !value.includes(m.id))
        .filter((m) => [displayName(m), m.username, m.character?.alias].some((s) => s?.toLowerCase().includes(q.trim().toLowerCase())))
        .slice(0, 6)
    : [];

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2">
        {value.map((id) => {
          const m = memberById.get(id);
          return (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-coal py-0.5 pl-0.5 pr-2 text-sm">
              <Avatar member={m} size="xs" />
              {displayName(m)}
              <button type="button" className="ml-1 text-smoke hover:text-red-400" onClick={() => onChange(value.filter((v) => v !== id))} aria-label="Remove">
                ×
              </button>
            </span>
          );
        })}
        {!value.length && <span className="text-xs text-smoke">No characters tagged.</span>}
      </div>
      <div className="relative">
        <input className="input" placeholder="Tag a character…" value={q} onChange={(e) => setQ(e.target.value)} />
        {matches.length > 0 && (
          <ul className="panel absolute inset-x-0 top-full z-20 mt-1 overflow-hidden p-1">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    onChange([...value, m.id]);
                    setQ('');
                  }}
                >
                  <Avatar member={m} size="xs" />
                  {displayName(m)} <span className="text-xs text-smoke">@{m.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

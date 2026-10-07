import { Lock, ShieldHalf, Users } from 'lucide-react';
import { useHub } from '../hooks/useHub';
import { audienceLabel, ranksFrom, type AudienceDraft, type Scope } from '../lib/audience';

/** Just me / the family / limited to ranks and crews. `limited` can be switched off (non-leadership on the map). */
export function AudiencePicker({ value, onChange, limited = true }: { value: AudienceDraft; onChange: (v: AudienceDraft) => void; limited?: boolean }) {
  const { ranks, crews, rankById, crewById } = useHub();
  const set = (patch: Partial<AudienceDraft>) => {
    const next = { ...value, ...patch };
    next.ranks = next.scope === 'limited' ? ranksFrom(ranks, next.minRank) : [];
    if (next.scope !== 'limited') next.crewIds = [];
    onChange(next);
  };
  const opts: { id: Scope; label: string; icon: typeof Lock }[] = [
    { id: 'personal', label: 'Just me', icon: Lock },
    { id: 'gang', label: 'The family', icon: Users },
    ...(limited ? [{ id: 'limited' as Scope, label: 'Ranks only', icon: ShieldHalf }] : []),
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {opts.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => set({ scope: o.id, minRank: o.id === 'limited' ? (value.minRank ?? null) : null })}
            className={`chip inline-flex items-center gap-1.5 px-3 py-1.5 text-xs ${value.scope === o.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash hover:text-gold-200'}`}
          >
            <o.icon className="size-3.5" /> {o.label}
          </button>
        ))}
      </div>
      {value.scope === 'limited' && (
        <div className="space-y-2 border border-line-soft p-3">
          <label className="block text-sm">
            <span className="label">Ranks that see it</span>
            <select className="input mt-1" value={value.minRank ?? ''} onChange={(e) => set({ minRank: e.target.value || null })}>
              <option value="">Leadership only</option>
              {ranks.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} and up
                </option>
              ))}
            </select>
          </label>
          {crews.length > 0 && (
            <div>
              <span className="label">Plus these crews</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {crews.map((c) => {
                  const on = value.crewIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => set({ crewIds: on ? value.crewIds.filter((x) => x !== c.id) : [...value.crewIds, c.id].slice(0, 10) })}
                      className="chip px-2.5 py-1 text-xs"
                      style={on ? { background: c.color, color: '#0a0a0b' } : { border: `1px solid ${c.color}66`, color: c.color }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      <p className="text-xs text-smoke">Who sees it: {audienceLabel(value, rankById, crewById)}</p>
    </div>
  );
}

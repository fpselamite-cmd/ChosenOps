import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AvatarStack } from '../../components/AvatarStack';
import { Empty, PageHeader } from '../../components/Field';
import { MemberName } from '../../components/MemberName';
import { useHub } from '../../hooks/useHub';
import { useLore } from '../../hooks/useLore';
import { excerpt, timeAgo } from '../../lib/format';
import type { LoreEntry } from '../../lib/types';

export default function LoreIndex() {
  const { settings, can } = useHub();
  const { lore } = useLore();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const category = params.get('c') ?? 'All';
  const canonOnly = params.get('canon') === '1';
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
  };

  const q = search.trim().toLowerCase();
  const categories = ['All', ...new Set([...settings.loreCategories, ...lore.map((l) => l.category)])];
  const shown = lore
    .filter((l) => category === 'All' || l.category === category)
    .filter((l) => !canonOnly || l.canon)
    .filter((l) => !q || [l.title, l.summary, l.body, l.category].some((s) => s?.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.canon) - Number(a.canon) || (b.updatedAt?.toMillis() ?? Infinity) - (a.updatedAt?.toMillis() ?? Infinity));

  return (
    <div>
      <PageHeader
        title="The Archive"
        subtitle={`${lore.length} ${lore.length === 1 ? 'entry' : 'entries'} in the family record.`}
        actions={
          can('writeLore') && (
            <Link to="/archive/new" className="btn-gold">
              ✦ Write lore
            </Link>
          )
        }
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-wrap gap-1.5">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setParam('c', c === 'All' ? null : c)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${
                category === c ? 'border-gold-400 bg-gold-400 font-semibold text-ink' : 'border-edge text-smoke hover:border-gold-700 hover:text-bone'
              }`}
            >
              {c}
            </button>
          ))}
          <button
            onClick={() => setParam('canon', canonOnly ? null : '1')}
            className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs ${canonOnly ? 'border-gold-300 text-gold-200' : 'border-edge text-smoke hover:text-bone'}`}
          >
            ✦ Canon only
          </button>
        </div>
        <input className="input sm:w-60" placeholder="Search the Archive…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {shown.length === 0 ? (
        <Empty>
          {lore.length ? 'Nothing in the Archive matches that.' : 'The Archive is empty. Every legend starts with someone writing it down.'}
        </Empty>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((l) => (
            <LoreCard key={l.id} entry={l} />
          ))}
        </div>
      )}
    </div>
  );
}

export function LoreCard({ entry, compact = false }: { entry: LoreEntry; compact?: boolean }) {
  return (
    <article className={`panel group relative flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-gold-500/70 hover:shadow-[0_0_40px_-12px_rgba(212,175,55,.55)] ${entry.canon ? 'border-gold-700/80' : ''}`}>
      <Link to={`/archive/${entry.id}`} className="absolute inset-0 z-0" aria-label={entry.title} />
      <div className={`pointer-events-none relative ${compact ? 'h-28' : 'h-40'} overflow-hidden bg-night`}>
        {entry.thumb ? (
          <img src={entry.thumb} alt="" className="h-full w-full object-cover opacity-90 transition group-hover:scale-105 group-hover:opacity-100" />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(212,175,55,.15),transparent_65%)]">
            <span className="font-display text-4xl text-gold-700">✦</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-panel to-transparent" />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold-200">{entry.category}</span>
          {entry.canon && <span className="rounded-full bg-gold-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">Canon</span>}
        </div>
      </div>
      <div className="pointer-events-none relative flex flex-1 flex-col p-4 pt-1">
        <h3 className="font-display text-lg font-bold leading-snug text-bone group-hover:text-gold-50">{entry.title}</h3>
        {!compact && <p className="mt-1.5 line-clamp-3 font-serif text-[1.05rem] leading-snug text-parchment/80">{entry.summary || excerpt(entry.body, 160)}</p>}
        <div className="pointer-events-auto relative z-10 mt-auto flex items-center justify-between gap-2 pt-3 text-xs text-smoke">
          <span className="truncate">
            by <MemberName id={entry.authorId} className="text-xs" /> · {timeAgo(entry.updatedAt)}
          </span>
          <AvatarStack ids={entry.characters} max={4} />
        </div>
      </div>
    </article>
  );
}

import { doc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar';
import { Empty } from '../../components/Field';
import { LoreText } from '../../components/LoreText';
import { MemberName } from '../../components/MemberName';
import { Ornament, SectionTitle } from '../../components/Ornament';
import { useAuth } from '../../hooks/useAuth';
import { useHub } from '../../hooks/useHub';
import { useLore } from '../../hooks/useLore';
import { db } from '../../lib/firebase';
import { displayName, formatDate, timeAgo } from '../../lib/format';
import { liveQuery } from '../../lib/live';
import { deleteLore, setCanon } from '../../lib/lore';
import { LoreCard } from './LoreIndex';

export default function LoreArticle() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const { can, memberById } = useHub();
  const { loreById, chronicle, lore } = useLore();
  const entry = loreById.get(id);
  const [cover, setCover] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCover(null);
    if (!entry?.thumb) return;
    return liveQuery(doc(db, 'loreCovers', id), (snap) => setCover((snap.data()?.image as string) ?? null));
  }, [id, entry?.thumb]);

  if (!entry) return <Empty>This page of the Archive is missing — it may have been removed.</Empty>;

  const isAuthor = entry.authorId === me?.id;
  const curator = can('editAllLore');
  const canEdit = curator || (isAuthor && can('writeLore'));
  const events = chronicle.filter((e) => e.loreId === entry.id);
  // Other entries that link here with [[Title]].
  const needle = `[[${entry.title.toLowerCase()}`;
  const backlinks = lore.filter((l) => l.id !== entry.id && l.body.toLowerCase().includes(needle));
  const act = (fn: () => Promise<unknown>) => fn().catch((e) => setError((e as Error).message));

  return (
    <article className="mx-auto max-w-4xl">
      <Link to="/archive" className="text-sm text-smoke hover:text-gold-200">
        ← The Archive
      </Link>

      <header className="relative mt-3 overflow-hidden rounded-2xl border border-edge">
        <div className="relative h-56 bg-night sm:h-80">
          {cover || entry.thumb ? (
            <img src={cover || entry.thumb!} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-[radial-gradient(circle_at_50%_30%,rgba(212,175,55,.18),transparent_60%)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-transparent" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <div className="mb-2 flex flex-wrap gap-2">
            <Link
              to={`/archive?c=${encodeURIComponent(entry.category)}`}
              className="rounded-full bg-black/70 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-gold-200 hover:text-gold-50"
            >
              {entry.category}
            </Link>
            {entry.canon && <span className="rounded-full bg-gold-400 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink">✦ Canon</span>}
          </div>
          <h1 className="gold-text text-3xl font-black leading-tight sm:text-5xl">{entry.title}</h1>
          {entry.summary && <p className="mt-2 max-w-2xl font-serif text-xl italic text-parchment/90">{entry.summary}</p>}
        </div>
      </header>

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-smoke">
        <span className="flex items-center gap-2">
          <MemberName id={entry.authorId}>
            <Avatar member={memberById.get(entry.authorId)} size="sm" />
          </MemberName>
          <span>
            Recorded by <MemberName id={entry.authorId} /> · {formatDate(entry.createdAt)}
          </span>
        </span>
        {entry.updatedBy && entry.updatedAt && (entry.updatedBy !== entry.authorId || entry.updatedAt.toMillis() - (entry.createdAt?.toMillis() ?? 0) > 60_000) && (
          <span>
            Last edited by <MemberName id={entry.updatedBy} /> {timeAgo(entry.updatedAt)}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {curator && (
            <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => act(() => setCanon(entry.id, !entry.canon, me!.id))}>
              {entry.canon ? 'Remove from canon' : '✦ Mark as canon'}
            </button>
          )}
          {canEdit && (
            <Link to={`/archive/${entry.id}/edit`} className="btn-gold px-3 py-1.5 text-xs">
              Edit
            </Link>
          )}
          {canEdit && (
            <button
              className="btn-danger px-3 py-1.5 text-xs"
              onClick={() => confirm(`Remove "${entry.title}" from the Archive? This can't be undone.`) && act(async () => { await deleteLore(entry.id); navigate('/archive'); })}
            >
              Delete
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {entry.characters.length > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {entry.characters.map((cid) => (
            <MemberName key={cid} id={cid} className="group inline-flex items-center gap-2 rounded-full border border-edge bg-panel/80 py-1 pl-1 pr-3 text-sm hover:border-gold-500">
              <Avatar member={memberById.get(cid)} size="xs" />
              <span className="text-bone group-hover:text-gold-200">{displayName(memberById.get(cid))}</span>
            </MemberName>
          ))}
        </div>
      )}

      <Ornament className="my-8" />
      <LoreText dropCap className="mx-auto max-w-[70ch]">
        {entry.body}
      </LoreText>
      <Ornament className="my-10" />

      {events.length > 0 && (
        <section className="mb-10">
          <SectionTitle>In the Chronicle</SectionTitle>
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link to={`/chronicle#${e.id}`} className="panel flex items-center gap-4 p-3 hover:border-gold-500">
                  <span className="w-40 shrink-0 font-display text-xs uppercase tracking-wider text-gold-300">{e.whenLabel || e.when}</span>
                  <span className="text-bone">{e.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {backlinks.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Mentioned in</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {backlinks.slice(0, 6).map((l) => (
              <LoreCard key={l.id} entry={l} compact />
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

import { ArrowLeft, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from '../../hooks/useHub';
import { react, REACTS, type DinnerNote, type Lore, type React as Reaction } from '../../lib/archives';
import { oldDate } from './useArchives';

/** Paragraphs of written text; the first gets a drop cap when asked. */
export function Prose({ text, drop }: { text: string; drop?: boolean }) {
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <>
      {paras.map((p, i) => (
        <p key={i} className={`tome-p ${drop && i === 0 ? 'tome-drop' : ''}`}>
          {p}
        </p>
      ))}
    </>
  );
}
export const Orn = () => <p className="tome-orn">✦ ✦ ✦</p>;
export const Sec = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="tome-sec">
    <p className="tome-label">{title}</p>
    {children}
  </div>
);

function Reactions({ target, reacts }: { target: string; reacts: Reaction[] }) {
  const { me, memberById } = useHub();
  const here = reacts.filter((r) => r.target === target);
  const mine = here.find((r) => r.memberId === me.id)?.emoji;
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5">
      {REACTS.map((e) => {
        const who = here.filter((r) => r.emoji === e);
        return (
          <button
            key={e}
            className={`tome-react ${mine === e ? 'on' : ''}`}
            title={who.map((r) => memberById.get(r.memberId)?.name).filter(Boolean).join(', ')}
            onClick={() => react(me.id, target, mine === e ? null : e)}
          >
            <span>{e}</span>
            {!!who.length && <b>{who.length}</b>}
          </button>
        );
      })}
    </div>
  );
}

/** The open leather book: two parchment pages (one on a phone), a ribbon, reactions at the foot. */
export function Tome({
  id,
  children,
  onBack,
  back = 'Back to the shelves',
  prev,
  next,
  onEdit,
  reacts,
  long = true,
}: {
  id: string;
  /** Long pieces read across both pages; short ones on a single page. */
  long?: boolean;
  children: ReactNode;
  onBack: () => void;
  back?: string;
  prev?: () => void;
  next?: () => void;
  onEdit?: () => void;
  reacts?: Reaction[];
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button className="flex items-center gap-1.5 text-sm text-smoke hover:text-gold-200" onClick={onBack}>
          <ArrowLeft className="size-4" /> {back}
        </button>
        <span className="flex-1" />
        {onEdit && (
          <button className="btn-ghost btn-sm" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </button>
        )}
        <button className="btn-ghost btn-sm" disabled={!prev} onClick={prev} aria-label="Previous">
          <ChevronLeft className="size-4" />
        </button>
        <button className="btn-ghost btn-sm" disabled={!next} onClick={next} aria-label="Next">
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="tome">
        <span className="tome-ribbon" aria-hidden />
        <div key={id} className={`tome-spread ${long ? '' : 'single'}`}>
          <div className="tome-pages">{children}</div>
        </div>
      </div>
      {reacts && <Reactions target={id} reacts={reacts} />}
    </div>
  );
}

// ---------- what goes on the pages ----------

export function NotePages({ n }: { n: DinnerNote }) {
  const { memberById } = useHub();
  const name = (id: string) => memberById.get(id)?.name ?? 'Someone';
  return (
    <>
      <h2 className="tome-title">{n.title || 'Family Dinner'}</h2>
      <p className="tome-sub">
        {oldDate(n.date)} · recorded by {n.byName}
        {n.status === 'draft' && <b className="tome-draft"> · draft</b>}
      </p>
      <Sec title={`At the table · ${n.present.length}`}>
        <p className="tome-chips">
          {n.present.map((id) => (
            <i key={id}>{name(id)}</i>
          ))}
        </p>
        {!!n.excused.length && <p className="tome-small">Excused: {n.excused.map(name).join(', ')}</p>}
        {!!n.absent.length && <p className="tome-small">Absent: {n.absent.map(name).join(', ')}</p>}
      </Sec>
      {n.topics && (
        <Sec title="What was said">
          <Prose text={n.topics} drop />
        </Sec>
      )}
      {n.decisions && (
        <Sec title="Decided">
          <Prose text={n.decisions} />
        </Sec>
      )}
      {!!n.ranks.length && (
        <Sec title="Blooded in & promoted">
          {n.ranks.map((r) => (
            <p key={r.memberId + r.rankName} className="tome-p">
              {r.name}, {r.kind === 'joined' ? 'joined as' : 'raised to'} {r.rankName}.
            </p>
          ))}
        </Sec>
      )}
      {n.announcements && (
        <Sec title="Announced">
          <Prose text={n.announcements} />
        </Sec>
      )}
      {n.minutes && (
        <Sec title="The minutes">
          <Prose text={n.minutes} />
        </Sec>
      )}
      {n.quote && (
        <>
          <Orn />
          <p className="tome-quote">“{n.quote}”</p>
          {n.quoteBy && <p className="tome-quote-by">— {n.quoteBy}</p>}
        </>
      )}
    </>
  );
}

export function LorePages({ l, chapter }: { l: Lore; chapter?: string }) {
  const { memberById } = useHub();
  const m = l.memberId ? memberById.get(l.memberId) : undefined;
  return (
    <>
      {chapter && <p className="tome-label text-center">{chapter}</p>}
      <h2 className="tome-title">{l.title || 'Untitled'}</h2>
      <p className="tome-sub">
        {[l.era, l.credit ? `as told by ${l.credit}` : `recorded by ${l.byName}`].filter(Boolean).join(' · ')}
        {l.status !== 'published' && <b className="tome-draft"> · {l.status}</b>}
      </p>
      {m && (
        <p className="tome-small text-center">
          <Link to={`/members/${m.id}`} className="underline decoration-dotted">
            {m.name}’s character sheet
          </Link>
        </p>
      )}
      {l.images.slice(0, 1).map((src, i) => (
        <img key={i} src={src} alt="" className="tome-img" />
      ))}
      <Prose text={l.body} drop />
      {l.images.slice(1).map((src, i) => (
        <img key={i} src={src} alt="" className="tome-img" />
      ))}
      <Orn />
    </>
  );
}

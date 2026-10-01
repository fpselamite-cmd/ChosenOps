import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { deleteJournal, saveJournal } from '../lib/lore';
import { excerpt, formatDate } from '../lib/format';
import type { JournalEntry } from '../lib/types';
import { Avatar } from './Avatar';
import { Field } from './Field';
import { LoreText } from './LoreText';
import { MarkdownEditor } from './MarkdownEditor';
import { MemberName } from './MemberName';
import { Modal } from './Modal';

/** One journal entry. `showAuthor` for the family-wide feed; collapsed shows an excerpt. */
export function JournalCard({ entry, showAuthor = false, collapsed = false }: { entry: JournalEntry; showAuthor?: boolean; collapsed?: boolean }) {
  const { me } = useAuth();
  const { can, memberById } = useHub();
  const [open, setOpen] = useState(!collapsed);
  const [editing, setEditing] = useState(false);
  const mine = entry.authorId === me?.id;

  return (
    <article id={`j-${entry.id}`} className="panel relative overflow-hidden p-5">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-gold-500/70 via-gold-700/30 to-transparent" />
      <header className="flex flex-wrap items-start gap-3">
        {showAuthor && (
          <MemberName id={entry.authorId}>
            <Avatar member={memberById.get(entry.authorId)} size="sm" />
          </MemberName>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold text-bone">{entry.title}</h3>
          <p className="text-xs text-smoke">
            {showAuthor && (
              <>
                <MemberName id={entry.authorId} className="text-xs" /> ·{' '}
              </>
            )}
            {entry.whenLabel ? <span className="text-gold-300">{entry.whenLabel}</span> : formatDate(entry.createdAt)}
          </p>
        </div>
        {(mine || can('editAllLore')) && (
          <div className="flex gap-3 text-xs">
            {mine && (
              <button className="text-gold-300 hover:underline" onClick={() => setEditing(true)}>
                Edit
              </button>
            )}
            <button className="text-smoke hover:text-red-400" onClick={() => confirm('Delete this journal entry?') && deleteJournal(entry.id)}>
              Delete
            </button>
          </div>
        )}
      </header>
      <div className="mt-3">
        {open ? (
          <LoreText className="compact">{entry.body}</LoreText>
        ) : (
          <p className="font-serif text-[1.08rem] leading-snug text-parchment/85">{excerpt(entry.body, 260)}</p>
        )}
        {collapsed && (
          <div className="mt-2 flex gap-4 text-xs">
            <button className="text-gold-300 hover:underline" onClick={() => setOpen(!open)}>
              {open ? 'Show less' : 'Read entry'}
            </button>
            {showAuthor && (
              <Link to={`/members/${entry.authorId}?tab=journal`} className="text-smoke hover:text-gold-200">
                Their journal →
              </Link>
            )}
          </div>
        )}
      </div>
      {editing && <JournalForm entry={entry} onClose={() => setEditing(false)} />}
    </article>
  );
}

export function JournalForm({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const { me } = useAuth();
  const [title, setTitle] = useState(entry?.title ?? '');
  const [whenLabel, setWhenLabel] = useState(entry?.whenLabel ?? '');
  const [body, setBody] = useState(entry?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return setError('Write something first.');
    setBusy(true);
    try {
      await saveJournal(entry, { title, body, whenLabel }, me!.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title={entry ? 'Edit Journal Entry' : 'New Journal Entry'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Title">
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required autoFocus placeholder="The night everything changed" />
          </Field>
          <Field label="In-world date (optional)">
            <input className="input" value={whenLabel} onChange={(e) => setWhenLabel(e.target.value)} maxLength={80} placeholder="3rd of the Frost Moon" />
          </Field>
        </div>
        <MarkdownEditor value={body} onChange={setBody} maxLength={30000} rows={12} placeholder="Written in your character's own voice…" />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            {entry ? 'Save' : 'Add to journal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

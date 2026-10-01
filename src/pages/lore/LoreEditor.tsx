import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Empty, Field } from '../../components/Field';
import { MarkdownEditor } from '../../components/MarkdownEditor';
import { MemberPicker } from '../../components/MemberPicker';
import { useAuth } from '../../hooks/useAuth';
import { useHub } from '../../hooks/useHub';
import { useLore } from '../../hooks/useLore';
import { db } from '../../lib/firebase';
import { compressImage } from '../../lib/image';
import { saveLore, type LoreDraft } from '../../lib/lore';

export default function LoreEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const { can, settings } = useHub();
  const { loreById, loreByTitle } = useLore();
  const existing = id ? (loreById.get(id) ?? null) : null;

  const [draft, setDraft] = useState<LoreDraft>(() => ({
    title: existing?.title ?? '',
    category: existing?.category ?? settings.loreCategories[0] ?? 'Legends',
    summary: existing?.summary ?? '',
    body: existing?.body ?? '',
    characters: existing?.characters ?? (me ? [me.id] : []),
  }));
  // undefined = unchanged, null = removed, object = new image
  const [images, setImages] = useState<{ cover: string; thumb: string } | null | undefined>(undefined);
  const [currentCover, setCurrentCover] = useState<string | null>(existing?.thumb ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!existing?.thumb) return;
    getDoc(doc(db, 'loreCovers', existing.id)).then((s) => s.exists() && setCurrentCover(s.data().image as string));
  }, [existing?.id, existing?.thumb]);

  if (id && !existing) return <Empty>That Archive entry doesn't exist.</Empty>;
  const allowed = existing ? can('editAllLore') || (existing.authorId === me?.id && can('writeLore')) : can('writeLore');
  if (!allowed) return <Empty>Your rank can't {existing ? 'edit this entry' : 'write lore'}.</Empty>;

  const set = <K extends keyof LoreDraft>(k: K, v: LoreDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const clash = loreByTitle.get(draft.title.trim().toLowerCase());
  const titleTaken = !!clash && clash.id !== existing?.id;
  const preview = images ? images.cover : images === null ? null : currentCover;

  async function pickCover(file: File) {
    setError('');
    try {
      const [cover, thumb] = await Promise.all([compressImage(file, 1400, false), compressImage(file, 560, false)]);
      setImages({ cover, thumb });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (titleTaken) return setError('Another entry already has that title. Titles must be unique so [[links]] work.');
    if (!draft.body.trim()) return setError('Write something first.');
    setBusy(true);
    setError('');
    try {
      const newId = await saveLore(existing, draft, me!.id, images);
      navigate(`/archive/${newId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={existing ? `/archive/${existing.id}` : '/archive'} className="text-sm text-smoke hover:text-gold-200">
            ← {existing ? 'Back to entry' : 'The Archive'}
          </Link>
          <h1 className="gold-text mt-1 text-3xl font-black">{existing ? 'Revise the Record' : 'Write Lore'}</h1>
        </div>
        <div className="flex gap-2">
          <Link to={existing ? `/archive/${existing.id}` : '/archive'} className="btn-ghost">
            Cancel
          </Link>
          <button className="btn-gold" disabled={busy || !draft.title.trim()}>
            {busy ? 'Saving…' : existing ? 'Save changes' : 'Add to the Archive'}
          </button>
        </div>
      </div>
      {error && <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}

      <section className="panel overflow-hidden">
        <div className="relative h-48 bg-night sm:h-64">
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-sm text-smoke">No cover image</div>
          )}
          <div className="absolute bottom-3 right-3 flex gap-2">
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pickCover(f); }} />
            <button type="button" className="btn-ghost bg-black/70" onClick={() => fileInput.current?.click()}>
              {preview ? 'Change cover' : 'Add cover image'}
            </button>
            {preview && (
              <button type="button" className="btn-ghost bg-black/70" onClick={() => setImages(null)}>
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-[1fr_220px]">
          <Field label="Title">
            <input
              className="input font-display text-lg"
              value={draft.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={120}
              required
              autoFocus={!existing}
              placeholder="The Night of Broken Glass"
            />
            {titleTaken && <span className="mt-1 block text-xs text-red-400">Another entry already uses this title.</span>}
          </Field>
          <Field label="Category">
            <select className="input" value={draft.category} onChange={(e) => set('category', e.target.value)}>
              {[...new Set([...settings.loreCategories, draft.category])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Summary (one line, shown on cards)" className="sm:col-span-2">
            <input className="input font-serif text-lg italic" value={draft.summary} onChange={(e) => set('summary', e.target.value)} maxLength={400} placeholder="How the family first came to the docks." />
          </Field>
          <div className="sm:col-span-2">
            <span className="label">Characters in this story</span>
            <MemberPicker value={draft.characters} onChange={(v) => set('characters', v)} />
          </div>
        </div>
      </section>

      <MarkdownEditor
        value={draft.body}
        onChange={(v) => set('body', v)}
        maxLength={60000}
        rows={20}
        placeholder={'It was raining the night @username first walked into [[The Velvet Room]]...'}
      />
    </form>
  );
}

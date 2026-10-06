import { useState, type FormEvent } from 'react';
import { useHub } from '../hooks/useHub';
import { createCrew, suggestTag, updateCrew } from '../lib/crews';
import { CREW_COLORS, PAGES, type Crew, type PageId, type PageMap } from '../lib/types';
import { CrewEmblem } from './CrewEmblem';
import { ErrorText, Field } from './Field';
import { Modal } from './Modal';

/** Create a crew, or edit one. Crew leaders can change the motto and color; leadership can change everything. */
export function CrewForm({ crew, onClose, onCreated }: { crew?: Crew; onClose: () => void; onCreated?: (id: string) => void }) {
  const { roster, can } = useHub();
  const full = can('manageCrews');
  const [name, setName] = useState(crew?.name ?? '');
  const [tag, setTag] = useState(crew?.tag ?? '');
  const [tagTouched, setTagTouched] = useState(!!crew);
  const [color, setColor] = useState(crew?.color ?? CREW_COLORS[0]);
  const [motto, setMotto] = useState(crew?.motto ?? '');
  const [leaderId, setLeaderId] = useState(crew?.leaderId ?? '');
  const [pages, setPages] = useState<PageMap>(crew?.pages ?? {});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shownTag = tagTouched ? tag : suggestTag(name);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (full && (!name.trim() || !shownTag.trim())) return setError('Give the crew a name and a tag.');
    setBusy(true);
    try {
      if (crew) {
        await updateCrew(crew.id, full ? { name: name.trim(), tag: shownTag.trim(), color, motto: motto.trim(), pages } : { color, motto: motto.trim() });
      } else {
        const id = await createCrew({ name: name.trim(), tag: shownTag.trim(), color, motto: motto.trim(), leaderId: leaderId || null, pages });
        onCreated?.(id);
      }
      onClose();
    } catch {
      setError("Couldn't save. You may not have permission.");
      setBusy(false);
    }
  }

  return (
    <Modal title={crew ? `Edit ${crew.name}` : 'New crew'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-4">
          <CrewEmblem crew={{ tag: shownTag || '?', color, emblem: crew?.emblem }} size="lg" />
          <div className="flex-1 space-y-3">
            <Field label="Crew name">
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!full} maxLength={30} autoFocus={!crew} />
            </Field>
            <Field label="Tag" hint="2 to 4 letters, shown on chips">
              <input
                className="input font-hud font-bold tracking-widest uppercase"
                value={shownTag}
                onChange={(e) => {
                  setTagTouched(true);
                  setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
                }}
                disabled={!full}
              />
            </Field>
          </div>
        </div>
        <Field label="Color">
          <div className="flex flex-wrap gap-2">
            {CREW_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setColor(c)}
                className={`size-8 notch-sm ${color === c ? 'ring-2 ring-bone ring-offset-2 ring-offset-panel' : ''}`}
                style={{ background: c }}
                aria-label={c}
              />
            ))}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="size-8 cursor-pointer bg-transparent" />
          </div>
        </Field>
        <Field label="Motto">
          <input className="input" value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={80} placeholder="Optional" />
        </Field>
        {full && (
          <Field label="Role: being in this crew unlocks" hint="On top of what each member's rank already shows.">
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
              {(Object.keys(PAGES) as PageId[]).map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm text-ash">
                  <input
                    type="checkbox"
                    className="accent-gold-400"
                    checked={!!pages[p]}
                    onChange={(e) => setPages({ ...pages, [p]: e.target.checked })}
                  />
                  {PAGES[p]}
                </label>
              ))}
            </div>
          </Field>
        )}
        {!crew && (
          <Field label="Crew leader" hint="You can change this later.">
            <select className="input" value={leaderId} onChange={(e) => setLeaderId(e.target.value)}>
              <option value="">No leader yet</option>
              {roster.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            {crew ? 'Save' : 'Create crew'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

import { Check, Copy, Eye, EyeOff, Pencil, Radio as RadioIcon, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { RADIOS, saveRadio, type Radio, type RadioId } from '../lib/radio';
import { useWelcomeAccess } from '../pages/welcome/useWelcome';

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="radio-key"
      aria-label={`Copy ${label}`}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1400)));
      }}
    >
      {done ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}

/** One channel, drawn as a handheld radio: antenna, speaker grille and a little LCD. */
function RadioCard({ id, r, canEdit }: { id: RadioId; r: Radio | null | undefined; canEdit: boolean }) {
  const { me } = useHub();
  const meta = RADIOS.find((x) => x.id === id)!;
  const [show, setShow] = useState(false);
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ freq: r?.freq ?? '', password: r?.password ?? '', note: r?.note ?? '', active: !!r?.active });
  useEffect(() => setF({ freq: r?.freq ?? '', password: r?.password ?? '', note: r?.note ?? '', active: !!r?.active }), [r]);
  const live = id !== 'heist' || !!r?.active;
  return (
    <div className={`radio ${live ? '' : 'radio-off'}`} style={{ ['--tone' as string]: meta.tone }}>
      <span className="radio-antenna" aria-hidden />
      <div className="radio-body">
        <div className="radio-top">
          <span className="radio-led" aria-hidden />
          <span className="radio-name">{meta.label}</span>
          {canEdit && !editing && (
            <button type="button" className="radio-key ml-auto" onClick={() => setEditing(true)} aria-label={`Edit ${meta.label}`}>
              <Pencil className="size-3" />
            </button>
          )}
        </div>
        {editing ? (
          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRadio(me, id, f).then(() => setEditing(false));
            }}
          >
            <input className="input !py-1 font-mono text-sm" placeholder="Frequency, e.g. 601.11" value={f.freq} maxLength={20} onChange={(e) => setF({ ...f, freq: e.target.value })} />
            <input className="input !py-1 font-mono text-sm" placeholder="Password" value={f.password} maxLength={40} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <input className="input !py-1 text-xs" placeholder="Note (optional)" value={f.note} maxLength={100} onChange={(e) => setF({ ...f, note: e.target.value })} />
            {id === 'heist' && (
              <label className="flex items-center gap-2 text-xs text-ash">
                <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Heist is on (soldiers and up see this channel)
              </label>
            )}
            <div className="flex justify-end gap-1.5">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(false)}>
                <X className="size-3.5" />
              </button>
              <button className="btn-gold btn-sm">Save</button>
            </div>
          </form>
        ) : (
          <>
            <div className="radio-lcd">
              {r?.freq ? (
                <>
                  <span className="radio-row">
                    <span className="radio-k">CH</span>
                    <b className="radio-freq">{r.freq}</b>
                    <CopyBtn text={r.freq} label="frequency" />
                  </span>
                  <span className="radio-row">
                    <span className="radio-k">PW</span>
                    <b className="radio-pw">{show ? r.password || '—' : '•'.repeat(Math.max(4, Math.min(10, r.password?.length ?? 4)))}</b>
                    <button type="button" className="radio-key" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
                      {show ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                    </button>
                    {r.password && <CopyBtn text={r.password} label="password" />}
                  </span>
                </>
              ) : (
                <span className="radio-row text-xs">No channel set{canEdit ? ' · tap the pencil' : ''}</span>
              )}
              {id === 'heist' && !r?.active && <span className="radio-row text-[10px] opacity-70">Off air · shows when a heist is on</span>}
            </div>
            {r?.note && <p className="mt-1.5 text-[11px] text-ash">{r.note}</p>}
          </>
        )}
        <span className="radio-grille" aria-hidden />
      </div>
    </div>
  );
}

/**
 * The header's Radio button. Associates see the associate channel only; soldiers and up see the
 * family channel, plus the heist channel while a heist is on. The rules enforce the same split.
 */
export function RadioButton() {
  const { isLead } = useHub();
  const { isAssoc, isHandler } = useWelcomeAccess();
  const assocR = useDoc<Radio>('radio/associate');
  const mainR = useDoc<Radio>('radio/main', !isAssoc);
  const heistR = useDoc<Radio>('radio/heist', !isAssoc);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  const heistOn = !isAssoc && !!heistR?.active;
  const shown: [RadioId, Radio | null | undefined][] = isAssoc
    ? [['associate', assocR]]
    : [
        ['main', mainR],
        ...(heistOn || isLead ? ([['heist', heistR]] as [RadioId, Radio | null | undefined][]) : []),
        // The Welcome Committee hands the associate channel out, so they see it too.
        ...(isHandler ? ([['associate', assocR]] as [RadioId, Radio | null | undefined][]) : []),
      ];
  const canEdit = (id: RadioId) => isLead || (id === 'associate' && isHandler);
  return (
    <div ref={box} className="sm:relative">
      <button
        onClick={() => setOpen(!open)}
        title="Radio"
        aria-expanded={open}
        className={`relative flex flex-col items-center gap-0.5 px-2 py-0.5 font-hud text-[10px] font-semibold tracking-wider uppercase transition ${open ? 'text-gold-200' : 'text-smoke hover:text-gold-200'}`}
      >
        <RadioIcon className="size-4" />
        Radio
        {heistOn && <span className="radio-heist-dot" aria-label="Heist channel is live" />}
      </button>
      {open && (
        <div className="poll-drop radio-drop">
          <p className="label mb-2 text-gold-400">{isAssoc ? 'Your radio' : heistOn ? 'Radios · heist is on' : 'Radios'}</p>
          <div className="space-y-3">
            {shown.map(([id, r]) => (
              <RadioCard key={id} id={id} r={r} canEdit={canEdit(id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

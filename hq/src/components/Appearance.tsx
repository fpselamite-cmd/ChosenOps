import { doc, updateDoc } from 'firebase/firestore';
import { Palette } from 'lucide-react';
import { useHub } from '../hooks/useHub';
import { ACCENTS, applyPrefs, DEFAULT_PREFS, SKIES, type Prefs } from '../lib/appearance';
import { db } from '../lib/firebase';
import { Panel } from './Page';

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className="flex w-full items-center justify-between gap-3 py-2 text-left">
      <span>
        <span className="block text-sm text-gold-100">{label}</span>
        <span className="block text-xs text-smoke">{hint}</span>
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full border transition ${on ? 'border-gold-400 bg-gold-400/25 shadow-[0_0_10px_rgb(var(--acc)/0.4)]' : 'border-line bg-coal'}`}>
        <span className={`absolute top-0.5 size-4.5 rounded-full transition-all ${on ? 'left-[22px] bg-gold-300' : 'left-0.5 bg-smoke'}`} />
      </span>
    </button>
  );
}

/** Your own look: accent, sky, motion, text size. Only you see it. */
export function Appearance({ bare }: { bare?: boolean } = {}) {
  const { me } = useHub();
  const p = { ...DEFAULT_PREFS, ...(me.prefs ?? {}) };
  const set = (patch: Prefs) => {
    const next = { ...(me.prefs ?? {}), ...patch };
    applyPrefs(next); // instant, before the save comes back
    updateDoc(doc(db, 'members', me.id), { prefs: next }).catch(() => {});
  };
  const body = (
      <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div>
          <p className="label mb-2">Accent</p>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => set({ accent: a.id })}
                className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] transition ${p.accent === a.id ? 'border-gold-300 text-gold-100 shadow-[0_0_12px_rgb(var(--acc)/0.4)]' : 'border-line text-smoke hover:border-gold-600'}`}
              >
                <span className="size-8 rounded-full ring-1 ring-black/40" style={{ background: a.swatch }} />
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-2">Sky</p>
          <div className="grid grid-cols-3 gap-2">
            {SKIES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => set({ sky: s.id })}
                className={`overflow-hidden rounded-md border text-left transition ${p.sky === s.id ? 'border-gold-300 shadow-[0_0_12px_rgb(var(--acc)/0.4)]' : 'border-line hover:border-gold-600'}`}
              >
                <span
                  className="block h-12"
                  style={{
                    background:
                      s.id === 'plain'
                        ? '#060607'
                        : s.id === 'deep'
                          ? "url('/brand/stars-dust.svg') 0 0/240px, radial-gradient(circle at 75% 20%, rgba(110,60,150,.22), transparent 60%), radial-gradient(circle at 15% 90%, rgba(40,80,150,.18), transparent 60%), #020202"
                          : "url('/brand/stars-bright.svg') 0 0/300px, url('/brand/stars-dust.svg') 0 0/240px, #040404",
                  }}
                />
                <span className="block px-2 py-1 text-[11px] text-gold-100">{s.label}</span>
                <span className="block px-2 pb-1.5 text-[10px] text-smoke">{s.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="divide-y divide-line-soft">
        <Toggle on={p.motion === 'on'} onChange={(v) => set({ motion: v ? 'on' : 'off' })} label="Motion" hint="Panels drifting in, twinkling stars, glows." />
        <Toggle on={p.shooting === 'on'} onChange={(v) => set({ shooting: v ? 'on' : 'off' })} label="Shooting stars" hint="One streaks across the sky now and then." />
        <Toggle on={p.wheel === 'on'} onChange={(v) => set({ wheel: v ? 'on' : 'off' })} label="Zodiac wheel" hint="The seal turning slowly behind the page." />
        <Toggle on={p.text === 'large'} onChange={(v) => set({ text: v ? 'large' : 'normal' })} label="Bigger text" hint="Everything a little larger." />
      </div>
    </div>
  );
  return bare ? body : <Panel title={<span className="inline-flex items-center gap-1.5"><Palette className="size-3.5" /> Appearance · only you see this</span>}>{body}</Panel>;
}

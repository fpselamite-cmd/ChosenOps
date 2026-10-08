import { doc, updateDoc } from 'firebase/firestore';
import { Coins, Lock, Palette } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHonors } from '../pages/honors/useHonors';
import { HIGH_TIER, HUE_SLOTS, RARITIES, rarityOf, saveLoadout, type Honor, type Loadout } from '../lib/honors';
import { HueDot } from './HonorArt';
import { useStreak } from '../lib/streak';
import { setStar, type Sheet } from '../lib/sheet';
import { STARS } from '../lib/stars';
import { useDoc } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { barKey, usePhoneBar } from '../hooks/useNav';
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

const tier = (h: Honor) => RARITIES.findIndex((r) => r.id === h.rarity);

/** The color hues from honors: what you've unlocked to wear, and what's still out there. */
function HueColors() {
  const { me, preview } = useHub();
  const { honors, has, loadoutOf } = useHonors();
  const [slot, setSlot] = useState<(typeof HUE_SLOTS)[number]['id']>('accentHue');
  const [peek, setPeek] = useState<Honor | null>(null);
  const l = loadoutOf(me.id);
  const hues = honors
    .filter((h) => h.kind === 'hue' && h.color && h.status === 'active')
    .map((h) => ({ h, mine: has(me.id, h.id) }))
    .sort((a, b) => Number(b.mine) - Number(a.mine) || tier(a.h) - tier(b.h) || a.h.name.localeCompare(b.h.name));
  const owned = hues.filter((x) => x.mine).length;
  const wear = (patch: Omit<Loadout, 'id'>) => !preview && void saveLoadout(me.id, patch).catch(() => {});
  const colorOf = (id?: string | null) => (id && has(me.id, id) ? hues.find((x) => x.h.id === id)?.h.color : undefined);
  const how = (h: Honor) =>
    h.price ? `Chip shop · ${h.price.toLocaleString('en-US')} chips` : h.secret || HIGH_TIER.includes(h.rarity) ? 'Keep at it to find out' : h.source === 'honor' ? 'Given by High Table' : h.description;
  const cur = HUE_SLOTS.find((s) => s.id === slot)!;
  return (
    <div className="border-t border-line-soft pt-5 md:col-span-2">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="label">
          Unlockable colors · <span className="text-gold-200">{owned}</span>/{hues.length} unlocked
        </p>
        <Link to={`/members/${me.id}?view=honors`} className="label text-[10px] hover:text-gold-200">
          Your Honorwall →
        </Link>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {HUE_SLOTS.map((s) => {
          const c = colorOf(l[s.id] as string | null);
          return (
            <button key={s.id} type="button" onClick={() => setSlot(s.id)} className={`chip px-3 py-1.5 text-xs ${slot === s.id ? 'border-gold-400 bg-gold-500/10 text-gold-200' : 'text-smoke'}`}>
              <span className="size-3 rounded-full ring-1 ring-black/50" style={{ background: c ?? 'linear-gradient(135deg,#fdf6dd,#d4af37 50%,#6e5516)' }} />
              {s.label}
            </button>
          );
        })}
      </div>
      <p className="mb-3 text-[11px] text-smoke">
        {cur.label}: {cur.hint.toLowerCase()}.{slot === 'accentHue' && ' Takes over from the accent above while it is on.'}
      </p>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
        <button
          type="button"
          onClick={() => wear({ [slot]: null })}
          className={`flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition ${!colorOf(l[slot] as string | null) ? 'border-gold-300 text-gold-100 shadow-[0_0_12px_rgb(var(--acc)/0.4)]' : 'border-line text-smoke hover:border-gold-600'}`}
        >
          <span className="size-9 rounded-full ring-1 ring-black/40" style={{ background: 'repeating-conic-gradient(#1c1a14 0 25%, #0b0a07 0 50%) 0 0 / 10px 10px' }} />
          Default
        </button>
        {hues.map(({ h, mine }) => {
          const on = mine && l[slot] === h.id;
          return (
            <button
              key={h.id}
              type="button"
              aria-disabled={!mine}
              onClick={() => (mine ? (wear({ [slot]: h.id }), setPeek(null)) : setPeek(h))}
              title={mine ? `${h.name} · ${rarityOf(h.rarity).label}` : `${h.secret ? '???' : h.name} · ${how(h)}`}
              className={`relative flex flex-col items-center gap-1 rounded-md border p-2 text-[10px] transition ${on ? 'border-gold-300 text-gold-100 shadow-[0_0_12px_rgb(var(--acc)/0.4)]' : peek?.id === h.id ? 'border-gold-600 text-smoke' : 'border-line text-smoke hover:border-gold-600'}`}
            >
              <span className={mine ? '' : 'opacity-35 grayscale-[0.6]'}>
                <HueDot color={h.color!} rarity={h.rarity} size={36} />
              </span>
              <span className={`max-w-full truncate ${mine ? 'text-gold-100' : ''}`}>{!mine && h.secret ? '???' : h.name}</span>
              <span className="text-[9px] tracking-wider uppercase" style={{ color: rarityOf(h.rarity).color }}>
                {rarityOf(h.rarity).label}
              </span>
              {!mine && (
                <span className="absolute top-1 right-1 text-smoke">{h.price ? <Coins className="size-3 text-gold-500" /> : <Lock className="size-2.5" />}</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-2 min-h-4 text-[11px] text-smoke">
        {peek ? (
          <>
            <Lock className="mr-1 inline size-3" />
            <b className="text-gold-200">{peek.secret ? '???' : peek.name}</b> ({rarityOf(peek.rarity).label}) · {how(peek)}
          </>
        ) : (
          "Locked colors unlock as you hit milestones, from High Table, or in the casino's chip shop. Tap one to see how."
        )}
      </p>
    </div>
  );
}

/** The phone bar: pick the two pages left of the Dashboard and the one to its right. */
function PhoneBarPicker({ save }: { save: (bar: string[]) => void }) {
  const { pool, picks } = usePhoneBar();
  const keys = picks.map(barKey);
  const slots = ['Left', 'Left of Dashboard', 'Right of Dashboard'];
  return (
    <div className="pt-3">
      <p className="label mb-2">Phone bottom bar</p>
      <div className="grid grid-cols-3 gap-2">
        {slots.map((label, n) => (
          <label key={label} className="block text-[11px] text-smoke">
            {label}
            <select
              className="input mt-1 !px-2 !py-1.5 text-xs"
              value={keys[n] ?? ''}
              onChange={(e) => {
                const next = [...keys];
                const was = next.indexOf(e.target.value);
                if (was >= 0) next[was] = next[n]!; // picking one that's already on the bar swaps them
                next[n] = e.target.value;
                save(next);
              }}
            >
              {pool.map((i) => (
                <option key={barKey(i)} value={barKey(i)}>
                  {i.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-smoke">The Dashboard sits in the middle and the menu on the far right.</p>
    </div>
  );
}

/** Your own look: accent, sky, motion, text size. Only you see it. */
export function Appearance({ bare }: { bare?: boolean } = {}) {
  const { me } = useHub();
  const best = useStreak(me.id)?.best ?? 0;
  const myStar = useDoc<Sheet>(`sheets/${me.id}`)?.star ?? 'gold';
  const p = { ...DEFAULT_PREFS, ...(me.prefs ?? {}) };
  const { loadoutOf, has } = useHonors();
  const hueAccent = loadoutOf(me.id).accentHue;
  const hueOn = !!hueAccent && has(me.id, hueAccent);
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
                disabled={!!a.unlock && best < a.unlock}
                onClick={() => {
                  set({ accent: a.id });
                  // An honor color would cover it up; picking an accent here takes it off.
                  if (hueOn) void saveLoadout(me.id, { accentHue: null }).catch(() => {});
                }}
                title={a.unlock && best < a.unlock ? `Unlocks at a ${a.unlock}-day login streak` : undefined}
                className={`relative flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] transition disabled:cursor-not-allowed disabled:opacity-45 ${p.accent === a.id && !hueOn ? 'border-gold-300 text-gold-100 shadow-[0_0_12px_rgb(var(--acc)/0.4)]' : 'border-line text-smoke hover:border-gold-600'}`}
              >
                <span className="size-8 rounded-full ring-1 ring-black/40" style={{ background: a.swatch, filter: a.unlock && best < a.unlock ? 'grayscale(0.7)' : undefined }} />
                {a.label}
                {a.unlock && best < a.unlock && (
                  <span className="absolute top-1 right-1 flex items-center gap-0.5 text-[9px] text-smoke">
                    <Lock className="size-2.5" />
                    {a.unlock}d
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-2">Your star · how you shine in the Family sky</p>
          <div className="flex flex-wrap gap-2">
            {STARS.map((st) => (
              <button
                key={st.id}
                type="button"
                disabled={st.locked}
                onClick={() => setStar(me.id, st.id)}
                title={st.locked ? `${st.label}: a reward for later` : st.label}
                className={`relative grid size-10 place-items-center rounded-full border transition disabled:cursor-not-allowed ${myStar === st.id ? 'border-gold-300 shadow-[0_0_12px_rgb(var(--acc)/0.5)]' : 'border-line hover:border-gold-600'} ${st.locked ? 'opacity-40' : ''}`}
              >
                <span className="size-3 rounded-full" style={{ background: st.core, boxShadow: `0 0 10px 3px ${st.glow}` }} />
                {st.locked && <Lock className="absolute -right-1 -bottom-1 size-3 text-smoke" />}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-smoke">The locked ones are rewards for later.</p>
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
        <PhoneBarPicker save={(bar) => set({ bar })} />
      </div>
      <HueColors />
    </div>
  );
  return bare ? body : <Panel title={<span className="inline-flex items-center gap-1.5"><Palette className="size-3.5" /> Appearance · only you see this</span>}>{body}</Panel>;
}

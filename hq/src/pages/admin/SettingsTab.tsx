import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Check, Clock, ImagePlus, Megaphone, Palette, SlidersHorizontal, X } from 'lucide-react';
import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Field } from '../../components/Field';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { BUILT_IN, feed, saveDefaults, useDefaults, ZONES } from '../../lib/adminData';
import { ACCENTS } from '../../lib/appearance';
import { db } from '../../lib/firebase';
import { squareImage } from '../../lib/image';
import { useMoney, useMoneyOps } from '../../lib/money';
import type { GangSettings } from '../../lib/types';

const digits = (v: string) => v.replace(/[^0-9]/g, '');

function Saved({ on }: { on: boolean }) {
  return on ? (
    <span className="flex items-center gap-1 text-sm text-ok">
      <Check className="size-4" /> Saved
    </span>
  ) : null;
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Panel title={title} right={icon}>
      {children}
    </Panel>
  );
}

function Gang() {
  const { settings, me } = useHub();
  const [name, setName] = useState(settings.name);
  const [motto, setMotto] = useState(settings.motto);
  const [logo, setLogo] = useState<string | null>(settings.logo ?? null);
  const [accent, setAccent] = useState<GangSettings['accent']>(settings.accent ?? 'gold');
  const [saved, setSaved] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  async function save(e: FormEvent) {
    e.preventDefault();
    await setDoc(doc(db, 'settings', 'gang'), { name: name.trim(), motto: motto.trim(), logo: logo ?? null, accent: accent ?? 'gold' });
    void feed(me, 'settings', `Updated the gang name, motto, logo or colors`);
    setSaved(true);
  }
  return (
    <Card title="The gang" icon={<Palette className="size-4 text-gold-500" />}>
      <form className="space-y-4" onSubmit={save} onChange={() => setSaved(false)}>
        <div className="flex items-center gap-4">
          <img src={logo || '/brand/logo-192.png'} alt="" className="size-20 rounded-full border border-gold-600/50 object-cover" />
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => file.current?.click()}>
              <ImagePlus className="size-3.5" /> {logo ? 'Change logo' : 'Upload logo'}
            </button>
            {logo && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => (setLogo(null), setSaved(false))}>
                <X className="size-3.5" /> Use the seal
              </button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) setLogo(await squareImage(f, 192, 0.85));
                setSaved(false);
              }}
            />
          </div>
        </div>
        <Field label="Gang name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </Field>
        <Field label="Motto">
          <input className="input" value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={80} />
        </Field>
        <div>
          <p className="label mb-1.5">Default accent</p>
          <div className="flex flex-wrap gap-2">
            {ACCENTS.filter((a) => !a.unlock).map((a) => (
              <button
                type="button"
                key={a.id}
                onClick={() => (setAccent(a.id), setSaved(false))}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${accent === a.id ? 'border-gold-300 text-gold-100' : 'border-line text-smoke hover:border-gold-600'}`}
              >
                <span className="size-4 rounded-full" style={{ background: a.swatch }} /> {a.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-smoke">What everyone sees until they pick their own in Appearance.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-gold">Save</button>
          <Saved on={saved} />
        </div>
      </form>
    </Card>
  );
}

function Announcement() {
  const { announcement, me, can } = useHub();
  const [text, setText] = useState(announcement?.text ?? '');
  const [saved, setSaved] = useState(false);
  if (!can('postAnnouncements')) return null;
  return (
    <Card title="Word from the top" icon={<Megaphone className="size-4 text-gold-500" />}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          await setDoc(doc(db, 'settings', 'announcement'), { text: text.trim(), by: me.id, at: serverTimestamp() });
          setSaved(true);
        }}
      >
        <textarea className="input min-h-24" maxLength={500} value={text} onChange={(e) => (setText(e.target.value), setSaved(false))} placeholder="Shows at the top of everyone's Dashboard." />
        <div className="flex items-center gap-3">
          <button className="btn-gold">Post</button>
          <Saved on={saved} />
        </div>
      </form>
    </Card>
  );
}

function Defaults() {
  const { me, isAdmin, can } = useHub();
  const d = useDefaults();
  const m = useMoney();
  const mops = useMoneyOps();
  const [v, setV] = useState({ callInCost: String(d.callInCost), weeklyGoal: d.weeklyGoal ? String(d.weeklyGoal) : '', snapDays: String(d.snapDays), wash: String(m.washPct) });
  const [saved, setSaved] = useState(false);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => (setV({ ...v, [k]: digits(e.target.value) }), setSaved(false));
  return (
    <Card title="Defaults" icon={<SlidersHorizontal className="size-4 text-gold-500" />}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveDefaults({
            callInCost: Number(v.callInCost) || BUILT_IN.callInCost,
            weeklyGoal: Number(v.weeklyGoal) || 0,
            snapDays: Math.min(365, Math.max(7, Number(v.snapDays) || BUILT_IN.snapDays)),
          });
          if ((isAdmin || can('money')) && Number(v.wash) !== m.washPct) await mops.saveSettings({ washPct: Math.min(100, Number(v.wash) || 0) });
          void feed(me, 'settings', `Defaults: call-in ${v.callInCost} rep, weekly goal ${v.weeklyGoal || 'none'}, snapshots ${v.snapDays} days, wash ${v.wash}%`);
          setSaved(true);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Blacksite call-in cost (rep)">
            <input className="input font-mono" inputMode="numeric" value={v.callInCost} onChange={set('callInCost')} />
          </Field>
          <Field label="Lost in the wash %" hint="50 means half comes back clean.">
            <input className="input font-mono" inputMode="numeric" value={v.wash} onChange={set('wash')} />
          </Field>
          <Field label="Weekly petty goal (rep)" hint="For members who haven't set their own. Blank = none.">
            <input className="input font-mono" inputMode="numeric" value={v.weeklyGoal} onChange={set('weeklyGoal')} />
          </Field>
          <Field label="Keep stash snapshots (days)">
            <input className="input font-mono" inputMode="numeric" value={v.snapDays} onChange={set('snapDays')} />
          </Field>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-gold">Save defaults</button>
          <Saved on={saved} />
        </div>
      </form>
    </Card>
  );
}

function CityClock() {
  const { me } = useHub();
  const d = useDefaults();
  const [zone, setZone] = useState(d.zone);
  const [label, setLabel] = useState(d.zoneLabel);
  const [from, setFrom] = useState(String(d.nightFrom));
  const [to, setTo] = useState(String(d.nightTo));
  const [saved, setSaved] = useState(false);
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const hl = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  const now = (() => {
    try {
      return new Date().toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
    } catch {
      return '?';
    }
  })();
  return (
    <Card title="City clock" icon={<Clock className="size-4 text-gold-500" />}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await saveDefaults({ zone, zoneLabel: label.trim().slice(0, 5) || 'ET', nightFrom: Number(from), nightTo: Number(to) });
          void feed(me, 'settings', `City clock set to ${zone} (${label}), night ${hl(Number(from))}–${hl(Number(to))}`);
          setSaved(true);
        }}
        onChange={() => setSaved(false)}
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Time zone">
            <select
              className="input"
              value={zone}
              onChange={(e) => {
                setZone(e.target.value);
                setLabel(ZONES.find(([z]) => z === e.target.value)?.[1] ?? label);
              }}
            >
              {ZONES.map(([z, l]) => (
                <option key={z} value={z}>
                  {z.replace('_', ' ')} ({l})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Label">
            <input className="input w-24" value={label} maxLength={5} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </div>
        <p className="text-sm text-ash">
          Right now: <b className="font-mono text-gold-200">{now} {label}</b>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Night on the map from">
            <select className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hl(h)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="until">
            <select className="input w-auto" value={to} onChange={(e) => setTo(e.target.value)}>
              {hours.map((h) => (
                <option key={h} value={h}>
                  {hl(h)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="text-xs text-smoke">Calendar days, events, the clock and the map follow this. NoelOps keeps its own Eastern clock.</p>
        <div className="flex items-center gap-3">
          <button className="btn-gold">Save clock</button>
          <Saved on={saved} />
        </div>
      </form>
    </Card>
  );
}

export default function SettingsTab() {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Gang />
      <div className="space-y-6">
        <Defaults />
        <CityClock />
        <Announcement />
      </div>
    </div>
  );
}

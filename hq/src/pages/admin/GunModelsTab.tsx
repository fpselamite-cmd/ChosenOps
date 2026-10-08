import { deleteField, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Check, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { GunStill } from '../../components/Gun3D';
import { Modal } from '../../components/Modal';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { useCatalog } from '../../lib/catalog';
import { db } from '../../lib/firebase';
import type { ItemType } from '../../lib/items';
import { specOf } from '../Gear';

/** The pack's guns, grouped the way they look. File names stay as the pack has them. */
const GROUPS: { id: string; label: string; cls: string[]; models: string[] }[] = [
  { id: 'pistol', label: 'Pistols', cls: ['pistol'], models: ['Pistol_1', 'Pistol_2', 'Pistol_3', 'Pistol_4', 'Pistol_5', 'Pistol_6'] },
  { id: 'revolver', label: 'Revolvers', cls: ['pistol'], models: ['Revolver_1', 'Revolver_2', 'Revolver_3', 'Revolver_4', 'Revolver_5'] },
  { id: 'smg', label: 'SMGs', cls: ['smg'], models: ['SubmachineGun_1', 'SubmachineGun_2', 'SubmachineGun_3', 'SubmachineGun_4', 'SubmachineGun_5'] },
  { id: 'ak', label: 'Rifles (AK style)', cls: ['rifle'], models: ['AssaultRifle_1', 'AssaultRifle_2', 'AssaultRifle_3', 'AssaultRifle_4', 'AssaultRifle_5'] },
  { id: 'ar', label: 'Rifles (AR style)', cls: ['rifle'], models: ['AssaultRifle2_1', 'AssaultRifle2_2', 'AssaultRifle2_3', 'AssaultRifle2_4'] },
  { id: 'bullpup', label: 'Bullpups', cls: ['rifle', 'shotgun'], models: ['Bullpup_1', 'Bullpup_2', 'Bullpup_3'] },
  { id: 'shotgun', label: 'Shotguns', cls: ['shotgun'], models: ['Shotgun_1', 'Shotgun_2', 'Shotgun_3', 'Shotgun_4', 'Shotgun_ShortStock', 'Shotgun_SawedOff'] },
  { id: 'sniper', label: 'Sniper rifles', cls: ['sniper'], models: ['SniperRifle_1', 'SniperRifle_2', 'SniperRifle_3', 'SniperRifle_4', 'SniperRifle_5', 'SniperRifle_6'] },
];
const fileOf = (m: string) => `pack/${m}.glb`;
const CLASSES = [
  { id: '', label: 'All' },
  { id: 'pistol', label: 'Pistols' },
  { id: 'smg', label: 'SMGs' },
  { id: 'rifle', label: 'Rifles' },
  { id: 'shotgun', label: 'Shotguns' },
  { id: 'sniper', label: 'Snipers' },
];

/** A model's name for people: "Shotgun_SawedOff" → "Shotgun SawedOff", "AssaultRifle2_3" → "AssaultRifle2 3". */
export const modelLabel = (file: string) => (file ? file.replace(/^pack\//, '').replace(/\.glb$/, '').replace(/_/g, ' ') : 'Built in code');

/** Leadership picks which 3D model each gun shows across the app (Gunsmith, build cards, kits). */
export default function GunModelsTab() {
  const cat = useCatalog();
  const { me } = useHub();
  const [q, setQ] = useState('');
  const [cls, setCls] = useState('');
  const [open, setOpen] = useState<ItemType | null>(null);
  const [defaults, setDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    let on = true;
    void import('../../components/gun3d').then(async (g) => {
      const pairs = await Promise.all(cat.weapons.map(async (w) => [w.id, await g.defaultModel(w.id, w.gunClass ?? 'rifle')] as const));
      if (on) setDefaults(Object.fromEntries(pairs));
    });
    return () => {
      on = false;
    };
  }, [cat.weapons]);

  const list = useMemo(
    () => cat.weapons.filter((w) => (!cls || w.gunClass === cls) && (!q || w.name.toLowerCase().includes(q.toLowerCase()))),
    [cat.weapons, cls, q],
  );
  const save = (weaponId: string, file: string | null) =>
    setDoc(doc(db, 'settings/gunModels'), { weapons: { [weaponId]: file === null ? deleteField() : file }, by: me.id, at: serverTimestamp() }, { merge: true });

  return (
    <Panel title="Gun models" right={<span className="text-xs text-smoke">{Object.keys(cat.gunModels).length} picked</span>}>
      <p className="mb-4 text-sm text-ash">
        Pick the 3D model each gun shows everywhere in the app: the Gunsmith bench, build cards and kits. Guns you leave alone use the default. Fitted parts (sights, suppressors, grips, lights) sit on whichever model you pick.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="input flex w-full items-center gap-2 sm:w-64">
          <Search className="size-4 text-smoke" />
          <input className="w-full bg-transparent outline-none" placeholder="Find a gun" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {CLASSES.map((c) => (
          <button key={c.id} onClick={() => setCls(c.id)} className={`chip px-2.5 py-1 text-xs ${cls === c.id ? 'bg-gold-400 text-void' : 'bg-raised text-ash'}`}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((w) => {
          const picked = cat.gunModels[w.id];
          return (
            <button key={w.id} onClick={() => setOpen(w)} className="hud overflow-hidden text-left transition hover:ring-1 hover:ring-gold-400/60">
              <GunStill spec={specOf(cat, w.id, {})} w={360} h={180} />
              <span className="block px-3 py-2">
                <b className="block text-gold-100">{w.name}</b>
                <span className="text-xs text-smoke">
                  {picked !== undefined ? <span className="text-gold-300">Picked: {modelLabel(picked)}</span> : `Default: ${defaults[w.id] === undefined ? '…' : modelLabel(defaults[w.id]!)}`}
                </span>
              </span>
            </button>
          );
        })}
        {!list.length && <p className="text-sm text-smoke">No guns match.</p>}
      </div>
      {open && <Picker weapon={open} picked={cat.gunModels[open.id]} fallback={defaults[open.id]} onPick={(f) => void save(open.id, f)} onClose={() => setOpen(null)} />}
    </Panel>
  );
}

function Picker({ weapon, picked, fallback, onPick, onClose }: { weapon: ItemType; picked?: string; fallback?: string; onPick: (file: string | null) => void; onClose: () => void }) {
  const cat = useCatalog();
  const base = specOf(cat, weapon.id, {});
  const current = picked ?? fallback;
  // The gun's own kind first, then everything else.
  const groups = [...GROUPS].sort((a, b) => Number(!a.cls.includes(weapon.gunClass ?? '')) - Number(!b.cls.includes(weapon.gunClass ?? '')));
  const option = (file: string, label: string) => (
    <button key={file || 'code'} onClick={() => onPick(file)} className={`relative overflow-hidden rounded text-left ring-1 transition ${current === file ? 'ring-2 ring-gold-400' : 'ring-line hover:ring-gold-400/60'}`}>
      <GunStill spec={{ ...base, model: file }} w={240} h={135} />
      <span className="block truncate px-2 py-1 text-[11px] text-ash">{label}</span>
      {current === file && (
        <span className="absolute top-1 right-1 rounded-full bg-gold-400 p-0.5 text-void">
          <Check className="size-3" />
        </span>
      )}
    </button>
  );
  return (
    <Modal title={`Model for ${weapon.name}`} onClose={onClose} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-smoke">
        <span>
          Now: <b className="text-gold-200">{current === undefined ? '…' : modelLabel(current)}</b> {picked === undefined && '(default)'}
        </span>
        {picked !== undefined && (
          <button className="btn-ghost btn-sm ml-auto" onClick={() => onPick(null)}>
            <RotateCcw className="size-3.5" /> Back to default{fallback !== undefined ? ` (${modelLabel(fallback)})` : ''}
          </button>
        )}
      </div>
      {groups.map((g) => (
        <section key={g.id} className="mb-4">
          <p className="label mb-2 text-[10px]">{g.label}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {g.models.map((m) => option(fileOf(m), modelLabel(fileOf(m))))}
          </div>
        </section>
      ))}
      <section>
        <p className="label mb-2 text-[10px]">Other</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {option('', 'Built in code (the old look)')}
        </div>
      </section>
    </Modal>
  );
}

import { doc, updateDoc } from 'firebase/firestore';
import { useState, type FormEvent } from 'react';
import { Field } from '../../components/Field';
import { DEFAULT_LOGO } from '../../components/Crest';
import { ImagePicker } from '../../components/ImagePicker';
import { useAuth } from '../../hooks/useAuth';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';

export default function FamilySettingsTab() {
  const { branding } = useAuth();
  const { settings } = useHub();
  const [name, setName] = useState(branding.name);
  const [motto, setMotto] = useState(branding.motto);
  const [logo, setLogo] = useState<string | null>(branding.logo ?? null);
  const [loreCats, setLoreCats] = useState(settings.loreCategories.join(', '));
  const [status, setStatus] = useState('');

  const split = (s: string) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))];

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus('Saving…');
    try {
      await Promise.all([
        updateDoc(doc(db, 'settings', 'branding'), { name: name.trim() || 'The Chosen', motto: motto.trim(), logo }),
        updateDoc(doc(db, 'settings', 'family'), { loreCategories: split(loreCats) }),
      ]);
      setStatus('Saved ✓');
    } catch (err) {
      setStatus((err as Error).message);
    }
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="panel grid gap-6 p-5 md:grid-cols-[auto_1fr]">
        <div className="flex flex-col items-center gap-3">
          <img src={logo || DEFAULT_LOGO} alt="Logo" className="h-32 w-32 object-contain" />
          <ImagePicker onPick={setLogo} label="Upload logo" square={false} size={512} />
          {logo && (
            <button type="button" className="text-xs text-smoke hover:text-red-400" onClick={() => setLogo(null)}>
              Use the family seal
            </button>
          )}
        </div>
        <div className="space-y-4">
          <Field label="Family name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Motto">
            <input className="input" value={motto} onChange={(e) => setMotto(e.target.value)} maxLength={80} />
          </Field>
          <p className="text-xs text-smoke">The name, motto and logo also appear on the sign-in screen.</p>
        </div>
      </section>
      <section className="panel space-y-4 p-5">
        <Field label="Archive categories (comma separated)">
          <input className="input" value={loreCats} onChange={(e) => setLoreCats(e.target.value)} />
        </Field>
        <p className="text-xs text-smoke">Renaming a category doesn't move existing entries; they keep their old category until edited.</p>
      </section>
      <div className="flex items-center gap-3">
        <button className="btn-gold">Save settings</button>
        <span className="text-sm text-smoke">{status}</span>
      </div>
    </form>
  );
}

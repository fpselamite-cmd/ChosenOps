import { doc, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import { Field } from '../../components/Field';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';

export default function SettingsTab() {
  const { settings } = useHub();
  const [name, setName] = useState(settings.name);
  const [motto, setMotto] = useState(settings.motto);
  const [saved, setSaved] = useState(false);
  return (
    <Panel title="Gang" className="max-w-xl">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await setDoc(doc(db, 'settings', 'gang'), { name: name.trim(), motto: motto.trim() });
          setSaved(true);
        }}
      >
        <Field label="Gang name">
          <input className="input" value={name} onChange={(e) => (setName(e.target.value), setSaved(false))} maxLength={40} />
        </Field>
        <Field label="Motto">
          <input className="input" value={motto} onChange={(e) => (setMotto(e.target.value), setSaved(false))} maxLength={80} />
        </Field>
        <button className="btn-gold">{saved ? 'Saved' : 'Save'}</button>
      </form>
    </Panel>
  );
}

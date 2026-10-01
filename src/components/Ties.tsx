import { useState, type FormEvent } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { useLore } from '../hooks/useLore';
import { displayName } from '../lib/format';
import { addTie, removeTie } from '../lib/lore';
import { RELATIONSHIP_TYPES, type Relationship, type RelationshipType } from '../lib/types';
import { Avatar } from './Avatar';
import { Field } from './Field';
import { MemberName } from './MemberName';
import { Modal } from './Modal';

const GROUP_COLOR: Record<string, string> = { Blood: 'text-blood', Bond: 'text-bond', Feud: 'text-feud' };

/** "A is ___ of B" choices, each mapped to a stored type and whether A/B swap. */
const CHOICES: { label: string; type: RelationshipType; swap: boolean }[] = [
  { label: 'Parent of', type: 'parent', swap: false },
  { label: 'Child of', type: 'parent', swap: true },
  { label: 'Sibling of', type: 'sibling', swap: false },
  { label: 'Spouse of', type: 'spouse', swap: false },
  { label: 'Sworn kin of', type: 'sworn', swap: false },
  { label: 'Mentor of', type: 'mentor', swap: false },
  { label: 'Protégé of', type: 'mentor', swap: true },
  { label: 'Ally of', type: 'ally', swap: false },
  { label: 'Rival of', type: 'rival', swap: false },
  { label: 'Sworn enemy of', type: 'enemy', swap: false },
];

/** How a tie reads from `viewer`'s side, e.g. "Child of". */
export function tieLabel(t: Relationship, viewer: string) {
  const def = RELATIONSHIP_TYPES[t.type];
  return t.a === viewer ? def.forward : def.backward;
}

/** Ties of one member, grouped Blood / Bond / Feud. */
export function TieList({ memberId }: { memberId: string }) {
  const { me } = useAuth();
  const { can, memberById } = useHub();
  const { tiesOf } = useLore();
  const ties = tiesOf(memberId).filter((t) => memberById.has(t.a === memberId ? t.b : t.a));
  const groups = ['Blood', 'Bond', 'Feud'] as const;
  if (!ties.length) return <p className="text-sm text-smoke">No ties recorded.</p>;

  return (
    <div className="space-y-5">
      {groups.map((g) => {
        const list = ties.filter((t) => RELATIONSHIP_TYPES[t.type].group === g);
        if (!list.length) return null;
        return (
          <div key={g}>
            <h3 className={`mb-2 font-display text-xs uppercase tracking-[0.25em] ${GROUP_COLOR[g]}`}>{g}</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {list.map((t) => {
                const other = t.a === memberId ? t.b : t.a;
                const removable = can('editAllLore') || t.a === me?.id || t.b === me?.id;
                return (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg border border-edge bg-coal/70 p-2.5">
                    <MemberName id={other}>
                      <Avatar member={memberById.get(other)} size="sm" />
                    </MemberName>
                    <div className="min-w-0 flex-1">
                      <div className={`text-[11px] uppercase tracking-wider ${GROUP_COLOR[g]}`}>{tieLabel(t, memberId)}</div>
                      <MemberName id={other} className="text-sm" />
                      {t.note && <div className="truncate font-serif text-sm italic text-parchment/70">{t.note}</div>}
                    </div>
                    {removable && (
                      <button
                        className="text-smoke hover:text-red-400"
                        title="Remove tie"
                        onClick={() => confirm(`Remove this tie with ${displayName(memberById.get(other))}?`) && removeTie(t.id)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/** Add a tie. Members can only tie themselves; curators can tie anyone. */
export function TieForm({ from, onClose }: { from?: string; onClose: () => void }) {
  const { me } = useAuth();
  const { can, members } = useHub();
  const curator = can('editAllLore');
  const active = members.filter((m) => m.status === 'active').sort((a, b) => displayName(a).localeCompare(displayName(b)));
  const [a, setA] = useState(from && (curator || from === me?.id) ? from : me!.id);
  const [choice, setChoice] = useState(0);
  const [b, setB] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!b || a === b) return setError('Pick two different people.');
    const c = CHOICES[choice];
    setBusy(true);
    try {
      await addTie(c.swap ? b : a, c.swap ? a : b, c.type, note, me!.id);
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const select = (value: string, onChange: (v: string) => void, disabled = false, placeholder?: string) => (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} required>
      {placeholder && <option value="">{placeholder}</option>}
      {active.map((m) => (
        <option key={m.id} value={m.id}>
          {displayName(m)} (@{m.username})
        </option>
      ))}
    </select>
  );

  return (
    <Modal title="Record a Tie" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="This character">{select(a, setA, !curator)}</Field>
        <Field label="is the">
          <select className="input" value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
            {CHOICES.map((c, i) => (
              <option key={c.label} value={i}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Character">{select(b, setB, false, 'Choose…')}</Field>
        <Field label="Note (optional)">
          <input className="input font-serif italic" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="Blood oath sworn at the Old Pier" />
        </Field>
        {!curator && <p className="text-xs text-smoke">You can record ties for your own character. Curators can record ties between anyone.</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-gold" disabled={busy}>
            Record tie
          </button>
        </div>
      </form>
    </Modal>
  );
}

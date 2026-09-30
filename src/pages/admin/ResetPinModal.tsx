import { useState, type FormEvent } from 'react';
import { Field } from '../../components/Field';
import { Modal } from '../../components/Modal';
import { resetMemberPin } from '../../lib/auth';
import { displayName } from '../../lib/format';
import type { Member } from '../../lib/types';

const randomPin = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0');

export function ResetPinModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const [pin, setPin] = useState(randomPin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await resetMemberPin(member.id, pin);
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reset PIN — ${displayName(member)}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-smoke">
            Done. Tell <span className="text-gold-200">@{member.username}</span> their new PIN in private:
          </p>
          <div className="font-display text-4xl font-bold tracking-[0.4em] text-gold-200" data-testid="new-pin">
            {pin}
          </div>
          <p className="text-xs text-smoke">They've been signed out everywhere and must use this PIN from now on.</p>
          <button className="btn-gold" onClick={onClose}>
            Close
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-smoke">
            Set a new PIN for <span className="text-gold-200">@{member.username}</span>. Their old PIN will stop working immediately.
          </p>
          <Field label="New PIN (4–8 digits)">
            <div className="flex gap-2">
              <input
                className="input text-center font-display text-xl tracking-[0.4em]"
                inputMode="numeric"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />
              <button type="button" className="btn-ghost" onClick={() => setPin(randomPin())} title="Generate a random PIN">
                ⟳
              </button>
            </div>
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold" disabled={busy || pin.length < 4}>
              {busy ? 'Resetting…' : 'Reset PIN'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

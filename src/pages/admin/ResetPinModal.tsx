import { useState } from 'react';
import { Modal } from '../../components/Modal';
import { useAuth } from '../../hooks/useAuth';
import { issueResetCode } from '../../lib/auth';
import { displayName } from '../../lib/format';
import type { Member } from '../../lib/types';

export function ResetPinModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { me } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState<{ code: string; expiresAt: Date } | null>(null);

  async function issue() {
    setBusy(true);
    setError('');
    try {
      setIssued(await issueResetCode(member.id, me!.id));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Reset PIN — ${displayName(member)}`} onClose={onClose}>
      {issued ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-smoke">
            Give <span className="text-gold-200">@{member.username}</span> this code in private:
          </p>
          <div className="select-all font-display text-4xl font-bold tracking-[0.25em] text-gold-200" data-testid="reset-code">
            {issued.code}
          </div>
          <p className="text-xs text-smoke">
            They go to the sign-in page → <span className="text-bone">“Forgot your PIN? … enter it here”</span>, type the code and choose a
            new PIN. Works once, until {issued.expiresAt.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.
            Their old PIN stops working as soon as they use it.
          </p>
          <button className="btn-gold" onClick={onClose}>
            Done
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-smoke">
            This creates a one-time reset code for <span className="text-gold-200">@{member.username}</span>, valid for 24 hours. Their current
            PIN keeps working until they use it. Making a new code cancels any earlier one.
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-gold" disabled={busy} onClick={issue}>
              {busy ? 'Creating…' : 'Create reset code'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

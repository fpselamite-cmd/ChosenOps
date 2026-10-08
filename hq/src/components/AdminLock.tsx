import { Lock, LockOpen } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';

// Signing in from the sign-in page swaps the whole screen to the Dashboard mid-way, so the
// result is handed over to the Dashboard's lock, which opens to show it.
const HANDOFF = 'chosenops.adminLock';
const handoff = (v: 'pending' | 'ok' | 'bad') => {
  try {
    sessionStorage.setItem(HANDOFF, v);
  } catch {
    // ignore
  }
};
import { Link } from 'react-router-dom';
import { claimAdmin, stepDown } from '../lib/admin';
import { AuthError, login, memberIdFor } from '../lib/auth';
import { ErrorText, Field } from './Field';
import { Modal } from './Modal';

/** The quiet gold lock in the footers. No label: only people who know what it is use it. */
/**
 * The little lock in the footer: the only way into Admin. Anyone whose rank or roles let them run
 * part of Admin gets an Open Admin button; full admin access still needs the admin password.
 * `badge` is how many things in Admin are waiting.
 */
export function AdminLock({ signedIn, canOpen, badge = 0 }: { signedIn?: { id: string; admin?: boolean }; canOpen?: boolean; badge?: number }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const signedInId = signedIn?.id;
  useEffect(() => {
    if (!signedInId) return;
    const read = () => {
      try {
        return sessionStorage.getItem(HANDOFF);
      } catch {
        return null;
      }
    };
    const settle = (v: string | null) => {
      try {
        sessionStorage.removeItem(HANDOFF);
      } catch {
        // ignore
      }
      setWaiting(false);
      if (v === 'ok') setDone(true);
      else setError('You’re signed in, but that admin password isn’t it. Try again here.');
    };
    const first = read();
    if (!first) return;
    setOpen(true);
    if (first !== 'pending') return settle(first);
    setWaiting(true);
    let n = 0;
    const t = setInterval(() => {
      const v = read();
      if (v !== 'pending' || ++n > 40) {
        clearInterval(t);
        settle(v === 'pending' ? 'bad' : v);
      }
    }, 250);
    return () => clearInterval(t);
  }, [signedInId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const uid = signedIn?.id ?? (await memberIdFor(name));
      if (!signedIn) {
        handoff('pending');
        await login(name, pin);
      }
      const ok = uid ? await claimAdmin(uid, password) : false;
      if (!signedIn) handoff(ok ? 'ok' : 'bad');
      if (!ok) setError(signedIn ? 'That’s not it.' : 'Signed in, but that admin password isn’t it.');
      else setDone(true);
    } catch (err) {
      try {
        sessionStorage.removeItem(HANDOFF);
      } catch {
        // ignore
      }
      setError(err instanceof AuthError ? err.message : 'Couldn’t do that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => (setOpen(true), setDone(false), setError(null))}
        className="relative inline-grid size-6 place-items-center rounded-full text-gold-600/70 transition hover:text-gold-300 hover:drop-shadow-[0_0_6px_rgb(var(--acc-hi)/0.8)]"
        aria-label={badge ? `Admin · ${badge} waiting` : 'Lock'}
        title={canOpen || signedIn?.admin ? 'Admin' : undefined}
      >
        <Lock className="size-3" />
        {!!badge && (
          <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-red-500/90 px-1 text-center font-mono text-[9px] leading-4 font-bold text-white shadow-[0_0_8px_rgba(239,68,68,0.6)]">{badge}</span>
        )}
      </button>
      {open && (
        <Modal title="Admin" onClose={() => setOpen(false)}>
          {waiting ? (
            <p className="text-sm text-ash">Checking…</p>
          ) : signedIn?.admin && !done ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-ash">
                <LockOpen className="size-4 text-gold-300" /> You have admin access.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link to="/admin" className="btn-gold" onClick={() => setOpen(false)}>
                  Open Admin
                </Link>
                <button className="btn-ghost" onClick={() => stepDown(signedIn.id).then(() => setOpen(false))}>
                  Give up admin access
                </button>
              </div>
            </div>
          ) : done ? (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm text-ash">
                <LockOpen className="size-4 text-gold-300" /> Admin access is on.
              </p>
              <Link to="/admin" className="btn-gold" onClick={() => setOpen(false)}>
                Open Admin
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {signedIn && canOpen && (
                <div className="space-y-3 border-b border-line-soft pb-4">
                  <p className="text-sm text-ash">Your rank lets you run parts of Admin.{badge ? ` ${badge} thing${badge === 1 ? ' is' : 's are'} waiting.` : ''}</p>
                  <Link to="/admin" className="btn-gold" onClick={() => setOpen(false)}>
                    Open Admin
                  </Link>
                  <p className="text-xs text-smoke">Full admin access needs the admin password:</p>
                </div>
              )}
              {!signedIn && (
                <>
                  <Field label="Name">
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" required />
                  </Field>
                  <Field label="PIN">
                    <input className="input font-mono tracking-[0.4em]" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} autoComplete="current-password" required />
                  </Field>
                </>
              )}
              <Field label="Admin password">
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" required autoFocus={!!signedIn} />
              </Field>
              <ErrorText error={error} />
              <button className="btn-gold w-full" disabled={busy}>
                {busy ? 'Checking…' : 'Unlock'}
              </button>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

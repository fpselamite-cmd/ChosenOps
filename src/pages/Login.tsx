import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Crest } from '../components/Crest';
import { useAuth } from '../hooks/useAuth';
import { login, register } from '../lib/auth';

export default function Login({ mode }: { mode: 'login' | 'register' }) {
  const { branding } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (isRegister && pin !== pin2) return setError('PINs do not match.');
    setBusy(true);
    try {
      if (isRegister) {
        await register(username, pin);
        navigate('/', { replace: true });
      } else await login(username, pin);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const pinProps = {
    type: 'password',
    inputMode: 'numeric' as const,
    pattern: '\\d*',
    maxLength: 8,
    autoComplete: isRegister ? 'new-password' : 'current-password',
    className: 'input text-center font-display text-2xl tracking-[0.6em]',
    placeholder: '••••',
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Crest className="h-28 w-28" />
          <h1 className="gold-text mt-4 text-4xl font-black">{branding.name}</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.35em] text-smoke">{branding.motto}</p>
        </div>

        <form onSubmit={submit} className="panel space-y-4 p-6">
          <div className="text-center">
            <h2 className="font-display text-lg text-bone">{isRegister ? 'Request a Seat at the Table' : 'Identify Yourself'}</h2>
            <p className="mt-1 text-xs text-smoke">
              {isRegister ? 'Pick a username and a private PIN. Leadership will vouch for you.' : 'Username and PIN.'}
            </p>
          </div>
          <label className="block">
            <span className="label">Username</span>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              maxLength={20}
            />
          </label>
          <label className="block">
            <span className="label">PIN</span>
            <input {...pinProps} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} required />
          </label>
          {isRegister && (
            <label className="block">
              <span className="label">Confirm PIN</span>
              <input {...pinProps} value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))} required />
            </label>
          )}
          {error && <p className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-sm text-red-300">{error}</p>}
          <button className="btn-gold w-full py-2.5 font-display tracking-widest" disabled={busy}>
            {busy ? '…' : isRegister ? 'Join the Family' : 'Enter'}
          </button>
          <div className="divider-gold" />
          <p className="text-center text-sm text-smoke">
            {isRegister ? (
              <>
                Already family?{' '}
                <Link to="/login" className="text-gold-300 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              <>
                First time here?{' '}
                <Link to="/register" className="text-gold-300 hover:underline">
                  Create your account
                </Link>
              </>
            )}
          </p>
        </form>
        <p className="mt-6 text-center text-[11px] text-smoke/60">Forgot your PIN? Ask leadership to reset your account.</p>
      </div>
    </div>
  );
}

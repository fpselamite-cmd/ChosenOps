import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ErrorText, Field } from '../components/Field';
import { AuthError, login, redeemResetCode, register } from '../lib/auth';

type Mode = 'login' | 'register' | 'reset';

const COPY: Record<Mode, { title: string; button: string }> = {
  login: { title: 'Identify yourself', button: 'Enter HQ' },
  register: { title: 'Request to join', button: 'Request access' },
  reset: { title: 'Reset your PIN', button: 'Set new PIN' },
};

export default function Login({ mode }: { mode: Mode }) {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode !== 'login' && pin !== pin2) return setError("The PINs don't match.");
    setBusy(true);
    try {
      if (mode === 'login') await login(name, pin);
      else if (mode === 'register') await register(name, pin);
      else await redeemResetCode(name, code, pin);
      nav('/');
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="relative">
            <div className="absolute -inset-4 rounded-full bg-gold-400/10 blur-2xl" />
            <img src="/brand/logo.png" alt="The Chosen" className="relative size-36 animate-[seal-spin_60s_linear_infinite]" />
          </div>
          <h1 className="foil foil-animate mt-6 font-display text-4xl font-black tracking-[0.1em]">CHOSENOPS</h1>
          <p className="label mt-2 text-gold-600">The Chosen · Headquarters</p>
        </div>

        <form onSubmit={submit} className="hud space-y-4 p-6">
          <p className="font-hud text-lg font-bold tracking-wide text-gold-200">{COPY[mode].title}</p>
          <Field label="Name">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="username" autoFocus required />
          </Field>
          {mode === 'reset' && (
            <Field label="Reset code" hint="From an officer, like ABCD-2345">
              <input className="input font-mono uppercase" value={code} onChange={(e) => setCode(e.target.value)} required />
            </Field>
          )}
          <Field label={mode === 'reset' ? 'New PIN' : 'PIN'} hint={mode === 'login' ? undefined : '4 to 8 digits'}>
            <input
              className="input font-mono tracking-[0.4em]"
              type="password"
              inputMode="numeric"
              pattern="\d{4,8}"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </Field>
          {mode !== 'login' && (
            <Field label="PIN again">
              <input
                className="input font-mono tracking-[0.4em]"
                type="password"
                inputMode="numeric"
                value={pin2}
                onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                autoComplete="new-password"
                required
              />
            </Field>
          )}
          <ErrorText error={error} />
          <button className="btn-gold w-full py-3" disabled={busy}>
            {busy ? 'One moment…' : COPY[mode].button}
          </button>
        </form>

        <div className="mt-5 space-y-2 text-center text-sm text-smoke">
          {mode === 'login' ? (
            <>
              <p>
                New here?{' '}
                <Link to="/register" className="text-gold-300 hover:underline">
                  Request to join
                </Link>
              </p>
              <p>
                Forgot your PIN? Ask an officer for a reset code, then{' '}
                <Link to="/reset-pin" className="text-gold-300 hover:underline">
                  enter it here
                </Link>
                .
              </p>
            </>
          ) : (
            <p>
              <Link to="/login" className="text-gold-300 hover:underline">
                Back to sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

import { KeyRound, ShieldCheck, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Avatar } from '../../components/Avatar';
import { RankBadge } from '../../components/Badges';
import { Field } from '../../components/Field';
import { MemberName } from '../../components/MemberName';
import { Panel } from '../../components/Page';
import { useHub } from '../../hooks/useHub';
import { setAdmin, setAdminPassword } from '../../lib/admin';

/** Owners only: the admin password, and who has admin access. */
export default function AccessTab() {
  const { me, roster, rankById } = useHub();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState('');
  const [grant, setGrant] = useState('');
  const admins = roster.filter((m) => m.admin);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setMsg('Use at least 8 characters.');
    if (pw !== pw2) return setMsg('The two don’t match.');
    await setAdminPassword(me.id, pw);
    setPw('');
    setPw2('');
    setMsg('Saved. Anyone who enters it from the gold lock gets admin access. People who already have it keep it until you take it away.');
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Admin password">
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-smoke">
            Give this to someone you trust (e.g. the gang leader). They open the small gold lock at the bottom of the Dashboard or the sign-in page and enter it. Only owners can see this page.
          </p>
          <Field label="New admin password">
            <input className="input" type="password" value={pw} onChange={(e) => (setPw(e.target.value), setMsg(''))} autoComplete="new-password" />
          </Field>
          <Field label="Again">
            <input className="input" type="password" value={pw2} onChange={(e) => (setPw2(e.target.value), setMsg(''))} autoComplete="new-password" />
          </Field>
          <button className="btn-gold">
            <KeyRound className="size-4" /> Set password
          </button>
          {msg && <p className="text-sm text-gold-300">{msg}</p>}
        </form>
      </Panel>

      <Panel title={`Admin access · ${admins.length}`}>
        <ul className="divide-y divide-line-soft">
          {admins.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2">
              <Avatar member={m} size="sm" />
              <span className="min-w-0 flex-1">
                <MemberName id={m.id} /> {m.id === me.id && <span className="text-xs text-smoke">(you)</span>}
                <span className="block">
                  <RankBadge rank={rankById.get(m.rankId ?? '')} />
                </span>
              </span>
              {m.id !== me.id && (
                <button className="btn-danger btn-sm" onClick={() => confirm(`Take admin access away from ${m.name}?`) && setAdmin(m.id, false)}>
                  <X className="size-3.5" /> Take away
                </button>
              )}
            </li>
          ))}
          {!admins.length && <li className="py-4 text-center text-sm text-smoke">Nobody yet.</li>}
        </ul>
        <div className="mt-4 flex gap-2">
          <select className="input" value={grant} onChange={(e) => setGrant(e.target.value)}>
            <option value="">Give admin access to…</option>
            {roster
              .filter((m) => !m.admin)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
          <button className="btn-gold" disabled={!grant} onClick={() => setAdmin(grant, true).then(() => setGrant(''))}>
            <ShieldCheck className="size-4" /> Give
          </button>
        </div>
      </Panel>
    </div>
  );
}

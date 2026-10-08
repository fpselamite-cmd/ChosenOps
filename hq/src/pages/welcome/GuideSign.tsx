import { Check, PenLine } from 'lucide-react';
import { useState } from 'react';
import { SignaturePad } from '../../components/SignaturePad';
import { useHub } from '../../hooks/useHub';
import { fmtDate, fmtTime } from '../../lib/format';
import { DEFAULT_PLEDGE, signGuide, type GuideSig, type WelcomeSettings } from '../../lib/welcome';

const same = (a: string, b: string) => a.trim().toLowerCase().replace(/\s+/g, ' ') === b.trim().toLowerCase().replace(/\s+/g, ' ');

/** The signed contract: their pledge, their typed name in script, the drawn signature and the date. */
export function SignedCopy({ sig, small }: { sig: GuideSig; small?: boolean }) {
  return (
    <div className={`contract ${small ? 'contract-sm' : ''}`}>
      <span className="contract-seal" aria-hidden>
        <Check className="size-4" strokeWidth={3} />
      </span>
      {!small && <p className="contract-kicker">The Guide · signed</p>}
      <p className="contract-pledge">“{sig.pledge}”</p>
      <div className="contract-sign">
        <img src={sig.img} alt={`${sig.name}'s signature`} className="contract-ink" />
        <span className="contract-line" />
        <span className="contract-under">
          <span className="contract-name">{sig.name}</span>
          <span>{sig.at ? `${fmtDate(sig.at)} · ${fmtTime(sig.at)}` : 'just now'}</span>
        </span>
      </div>
    </div>
  );
}

/** Under the Guide: once they've been through every slide, they type their name, sign, and it ticks the checklist. */
export function GuideContract({ w, sig }: { w: WelcomeSettings; sig: GuideSig | null | undefined }) {
  const { me, preview } = useHub();
  const [read, setRead] = useState(false);
  const [name, setName] = useState('');
  const [img, setImg] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (sig) return <SignedCopy sig={sig} />;
  const pledge = (w.pledge || DEFAULT_PLEDGE).trim();
  const nameOk = same(name, me.name);
  return (
    <div className="contract">
      <p className="contract-kicker">Sign off on the Guide</p>
      <label className="contract-check">
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
        I've gone through every slide of the guide.
      </label>
      {read && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!nameOk || !img || preview) return;
            setBusy(true);
            setErr('');
            try {
              await signGuide(me, w.rulesVersion, me.name, img, pledge);
            } catch {
              setErr("That didn't save. Try again.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="contract-pledge">“{pledge}”</p>
          <label className="block">
            <span className="contract-label">Type your name ({me.name})</span>
            <input className="contract-input" value={name} maxLength={60} autoComplete="off" onChange={(e) => setName(e.target.value)} placeholder={me.name} />
            {name && !nameOk && <span className="mt-1 block text-xs text-red-800">It has to match your name in HQ.</span>}
          </label>
          <div>
            <span className="contract-label">Your signature</span>
            <SignaturePad onChange={setImg} />
          </div>
          {err && <p className="text-xs text-red-800">{err}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-stone-600">Signing ticks "Go through the guide and accept the rules". It can't be undone; ask the Welcome Committee if you made a mistake.</span>
            <button className="contract-btn" disabled={!nameOk || !img || busy || !!preview}>
              <PenLine className="size-4" /> Sign
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

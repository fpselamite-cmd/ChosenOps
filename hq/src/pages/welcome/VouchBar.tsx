import { Flag, ThumbsUp } from 'lucide-react';
import { useState } from 'react';
import { useHub } from '../../hooks/useHub';
import type { Member } from '../../lib/types';
import { vouch, type Vouch } from '../../lib/welcome';
import { useWelcomeAccess } from './useWelcome';

/** On an associate's profile: any member can vouch for them or raise a flag. Only handlers read these. */
export function VouchBar({ m }: { m: Member }) {
  const { me } = useHub();
  const { assocRank } = useWelcomeAccess();
  const [kind, setKind] = useState<Vouch['kind'] | null>(null);
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  if (!assocRank || m.rankId !== assocRank.id || m.id === me.id) return null;
  return (
    <div className="no-print hud mb-4 flex flex-wrap items-center gap-2 p-3 text-sm">
      <span className="flex-1 text-ash">{sent ? 'Sent to the Welcome Committee. Thanks.' : `${m.name} is an associate. Know them? Let the Welcome Committee know.`}</span>
      {!kind && !sent && (
        <>
          <button className="btn-ghost btn-sm" onClick={() => setKind('vouch')}>
            <ThumbsUp className="size-3.5" /> Vouch
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setKind('flag')}>
            <Flag className="size-3.5" /> Flag
          </button>
        </>
      )}
      {kind && (
        <form
          className="flex w-full gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await vouch(me, m.id, kind, text.trim());
            setKind(null);
            setText('');
            setSent(true);
          }}
        >
          <input className="input py-1 text-sm" autoFocus maxLength={200} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'vouch' ? 'Why you vouch for them (optional)' : 'What the handlers should know'} required={kind === 'flag'} />
          <button className="btn-gold btn-sm">{kind === 'vouch' ? 'Vouch' : 'Flag'}</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setKind(null)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { ago } from '../lib/format';
import { Avatar } from './Avatar';
import { RankBadge } from './Badges';
import { Modal } from './Modal';

/** Header pill: who's on right now. Opens the full list. */
export function WhoIsOnline() {
  const { roster, isOnline, presence, rankById } = useHub();
  const [open, setOpen] = useState(false);
  const online = roster.filter((m) => isOnline(m.id));
  const offline = roster.filter((m) => !isOnline(m.id));

  return (
    <>
      <button onClick={() => setOpen(true)} className="flex items-center gap-2 border border-line bg-panel px-2.5 py-1 hover:border-gold-600">
        <span className="hidden sm:flex">
          {online.slice(0, 4).map((m) => (
            <span key={m.id} className="-ml-1.5 first:ml-0">
              <Avatar member={m} size="xs" />
            </span>
          ))}
        </span>
        <span className="online-dot size-2 rounded-full bg-ok sm:hidden" />
        <span className="font-hud text-sm font-bold text-ok">{online.length}</span>
        <span className="label hidden sm:inline">online</span>
      </button>
      {open && (
        <Modal title="Who's online" onClose={() => setOpen(false)}>
          <div className="space-y-4">
            {[
              { label: `Online · ${online.length}`, list: online, on: true },
              { label: `Offline · ${offline.length}`, list: offline, on: false },
            ].map((g) => (
              <div key={g.label}>
                <p className="label mb-2">{g.label}</p>
                <ul className="space-y-1.5">
                  {g.list.map((m) => (
                    <li key={m.id}>
                      <Link
                        to={`/members/${m.id}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/[0.03]"
                      >
                        <Avatar member={m} online={g.on} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-gold-100">{m.name}</span>
                          <span className="text-xs text-smoke">
                            {g.on ? presence.get(m.id)?.status || 'Online' : `Last seen ${ago(presence.get(m.id)?.at)}`}
                          </span>
                        </span>
                        <span className="flex flex-wrap justify-end gap-1">
                          <RankBadge rank={rankById.get(m.rankId ?? '')} />
                        </span>
                      </Link>
                    </li>
                  ))}
                  {!g.list.length && <li className="px-2 text-sm text-smoke">Nobody.</li>}
                </ul>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}

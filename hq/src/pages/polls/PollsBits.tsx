import { Vote } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Panel } from '../../components/Page';
import { PollCard } from './PollCard';
import { pollOpen } from '../../lib/polls';
import { useNow, usePolls, useUnvoted } from './usePolls';

/** Polls waiting on me, plus any I've just voted on here (so the result and the chips flash stay put). */
function useWaiting(reset?: unknown) {
  const unvoted = useUnvoted();
  const polls = usePolls();
  const now = useNow();
  const seen = useRef(new Set<string>());
  const last = useRef(reset);
  if (last.current !== reset) (last.current = reset), (seen.current = new Set());
  unvoted.forEach((p) => seen.current.add(p.id));
  const waiting = new Set(unvoted.map((p) => p.id));
  const done = (polls ?? []).filter((p) => seen.current.has(p.id) && pollOpen(p, now) && !waiting.has(p.id));
  return { count: unvoted.length, shown: [...unvoted, ...done] };
}

/** The header's Polls button: a count of polls waiting on my vote, and a drop-down to vote right there. */
export function PollsButton() {
  const [open, setOpen] = useState(false);
  const { count, shown } = useWaiting(open);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest('[role=dialog]') && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <div ref={box} className="sm:relative">
      <button
        onClick={() => setOpen(!open)}
        title="Polls"
        aria-expanded={open}
        className={`relative flex flex-col items-center gap-0.5 px-2 py-0.5 font-hud text-[10px] font-semibold tracking-wider uppercase transition ${
          open || pathname === '/polls' ? 'text-gold-200' : 'text-smoke hover:text-gold-200'
        }`}
      >
        <Vote className="size-4" />
        Polls
        {!!count && <span className="poll-badge">{count}</span>}
      </button>
      {open && (
        <div className="poll-drop">
          <div className="mb-2 flex items-center justify-between">
            <span className="label text-gold-400">{count ? `Waiting on your vote · ${count}` : 'Polls'}</span>
            <Link to="/polls" className="label text-[10px] hover:text-gold-200">
              All polls →
            </Link>
          </div>
          {shown.length ? (
            <div className="space-y-3">
              {shown.map((p) => (
                <PollCard key={p.id} p={p} compact />
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-smoke">You're all caught up. Nothing waiting on your vote.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Dashboard: open polls I haven't voted on, to vote inline. Gone once I'm caught up. */
export function OpenPolls() {
  const { count, shown } = useWaiting();
  if (!shown.length) return null;
  return (
    <Panel
      className="mb-6"
      title={count ? `Your vote · ${count}` : 'Your vote · all caught up'}
      right={
        <Link to="/polls" className="label hover:text-gold-300">
          All polls →
        </Link>
      }
    >
      <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p) => (
          <PollCard key={p.id} p={p} compact />
        ))}
      </div>
    </Panel>
  );
}

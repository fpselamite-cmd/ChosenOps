import { CalendarClock, MapPin, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useVisible } from '../lib/audience';
import { addDays, keyOf, occurrences, timeLabel, TZ_LABEL, type CalEvent } from '../lib/calendar';

const SEEN = 'chosenops.banner.dismissed';
const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '[]');
  } catch {
    return [];
  }
};

/** "Starting soon": any event I can see, from an hour before until 15 minutes in. */
export function EventBanner() {
  const events = useVisible<CalEvent>('events') ?? [];
  const [now, setNow] = useState(Date.now());
  const [dismissed, setDismissed] = useState<string[]>(read);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30e3);
    return () => clearInterval(t);
  }, []);
  const today = keyOf(now);
  const soon = events
    .flatMap((e) => occurrences(e, addDays(today, -1), addDays(today, 1)))
    .filter((o) => o.at.getTime() - now <= 3600e3 && now - o.at.getTime() <= 15 * 60e3 && !dismissed.includes(o.key))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  if (!soon) return null;
  const mins = Math.round((soon.at.getTime() - now) / 60e3);
  const dismiss = () => {
    const next = [...dismissed, soon.key].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(SEEN, JSON.stringify(next));
    } catch {
      /* fine */
    }
  };
  return (
    <div className="event-banner no-print mb-5 flex flex-wrap items-center gap-3 px-4 py-2.5" style={{ '--c': soon.color } as React.CSSProperties}>
      <CalendarClock className="size-5 shrink-0 text-gold-200" />
      <span className="min-w-0 flex-1 text-sm">
        <b className="text-gold-50">{soon.title}</b>{' '}
        <span className="text-gold-200">{mins > 0 ? `starts in ${mins} min` : mins === 0 ? 'is starting now' : 'is happening now'}</span>
        <span className="text-ash"> · {timeLabel(soon.at)} {TZ_LABEL}{soon.sub ? ` · ${soon.sub}` : ''}</span>
      </span>
      {soon.event?.pinId && !soon.event.pinId.startsWith('spot:') && (
        <Link to={`/map?pin=${soon.event.pinId}`} className="btn-ghost btn-sm">
          <MapPin className="size-3.5" /> Map
        </Link>
      )}
      <Link to="/calendar" className="btn-gold btn-sm">
        Open
      </Link>
      <button className="text-gold-200/70 hover:text-gold-50" onClick={dismiss} aria-label="Dismiss">
        <X className="size-4" />
      </button>
    </div>
  );
}

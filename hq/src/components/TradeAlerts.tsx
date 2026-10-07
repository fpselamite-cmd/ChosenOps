import { collection, query, where } from 'firebase/firestore';
import { Handshake, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCollection } from '../hooks/useCollection';
import { useHub } from '../hooks/useHub';
import { db } from '../lib/firebase';
import type { Trade2 } from '../lib/trades';

const SEEN = 'chosenops.tradesSeen';
const read = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(SEEN) ?? '[]') as string[];
  } catch {
    return [];
  }
};

/** A toast anywhere in HQ when someone sends you a trade, or answers yours. */
export function TradeAlerts() {
  const { me } = useHub();
  const inQ = useMemo(() => query(collection(db, 'trades'), where('to', '==', me.id), where('status', '==', 'pending')), [me.id]);
  const outQ = useMemo(() => query(collection(db, 'trades'), where('from', '==', me.id), where('status', 'in', ['countered', 'done', 'declined'])), [me.id]);
  const incoming = useCollection<Trade2>(inQ);
  const answered = useCollection<Trade2>(outQ);
  const [shown, setShown] = useState<{ key: string; text: string } | null>(null);
  useEffect(() => {
    if (!incoming || !answered) return;
    const seen = new Set(read());
    const first = seen.size === 0 && !localStorage.getItem(SEEN);
    const fresh = [
      ...incoming.map((t) => ({ key: `${t.id}:in`, text: `${t.fromName} sent you a trade offer.` })),
      ...answered
        .filter((t) => t.v === 2 && t.closedAt && Date.now() - t.closedAt.toMillis() < 86400e3)
        .map((t) => ({ key: `${t.id}:${t.status}`, text: t.status === 'countered' ? `${t.toName} countered your trade.` : t.status === 'done' ? `${t.toName} took your trade.` : `${t.toName} turned down your trade.` })),
    ].filter((x) => !seen.has(x.key));
    // On the very first run, don't flood: just remember what's already there.
    if (first) {
      localStorage.setItem(SEEN, JSON.stringify(fresh.map((f) => f.key)));
      return;
    }
    if (fresh.length) {
      setShown(fresh.length === 1 ? fresh[0]! : { key: fresh.map((f) => f.key).join(','), text: `${fresh.length} trade updates are waiting.` });
      localStorage.setItem(SEEN, JSON.stringify([...seen, ...fresh.map((f) => f.key)].slice(-200)));
    }
  }, [incoming, answered]);
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), 9000);
    return () => clearTimeout(t);
  }, [shown]);
  if (!shown) return null;
  return (
    <div className="trade-alert fixed right-4 bottom-24 z-50 flex max-w-xs items-center gap-3 border border-gold-500/70 bg-coal px-4 py-3 shadow-2xl lg:bottom-6">
      <Handshake className="size-5 shrink-0 text-gold-300" />
      <Link to="/locker" className="flex-1 text-sm text-gold-100 hover:underline" onClick={() => setShown(null)}>
        {shown.text}
      </Link>
      <button onClick={() => setShown(null)} aria-label="Dismiss" className="text-smoke hover:text-gold-200">
        <X className="size-4" />
      </button>
    </div>
  );
}

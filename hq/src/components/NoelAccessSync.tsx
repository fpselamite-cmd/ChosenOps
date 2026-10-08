import { useEffect, useState } from 'react';
import { useHub } from '../hooks/useHub';
import { accessChanges, sendQueued, wantedAccess, watchAccess, watchOutbox, writeAccess, type AccessEntry } from '../lib/noelAccess';

/**
 * Leadership only: keeps NoelOps' access list in step with ranks and roles (so the database lets the right
 * people in), and sends NoelOps' queued Discord messages. Any leadership page does it; only changes are written.
 */
export function NoelAccessSync() {
  const { ready, realMe, isLead, preview, members, rankById, holders } = useHub();
  const on = ready && isLead && !preview && realMe.status === 'active';
  const [have, setHave] = useState<Record<string, AccessEntry> | null>(null);
  useEffect(() => (on ? watchAccess((v) => setHave(v)) : undefined), [on]);

  useEffect(() => {
    if (!on || !have) return;
    const t = setTimeout(() => {
      const holderOf = new Map(holders.map((h) => [h.id, h]));
      const changes = accessChanges(have, wantedAccess(members, rankById, holderOf));
      if (Object.keys(changes).length) writeAccess(changes).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [on, have, members, rankById, holders]);

  useEffect(() => {
    if (!on) return;
    return watchOutbox((queue) => {
      Object.keys(queue).forEach((id) => void sendQueued(id).catch(() => {}));
    });
  }, [on]);

  return null;
}

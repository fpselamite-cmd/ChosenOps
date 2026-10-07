import { collection, query, where } from 'firebase/firestore';
import { useMemo } from 'react';
import { useCollection } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import type { Blacksite } from '../../lib/blacksites';
import { db } from '../../lib/firebase';
import type { Signout } from '../../lib/locker';
import type { WashRequest } from '../../lib/money';
import type { RepTransfer } from '../../lib/types';

export interface Attention {
  id: string;
  label: string;
  n: number;
  to: string;
}

/** What's waiting on admins and leadership right now. The Admin menu badge is the total. */
export function useAttention(): Attention[] {
  const { members, can, isLead } = useHub();
  const repQ = useMemo(() => query(collection(db, 'repTransfers'), where('status', '==', 'pending')), []);
  const reps = useCollection<RepTransfer>(repQ, can('confirmRep')) ?? [];
  const sites = useCollection<Blacksite>('blacksites', can('confirmRep')) ?? [];
  const washQ = useMemo(() => query(collection(db, 'washRequests'), where('status', '==', 'open')), []);
  const washes = useCollection<WashRequest>(washQ, can('washMoney')) ?? [];
  const outQ = useMemo(() => query(collection(db, 'signouts'), where('status', '==', 'out')), []);
  const out = useCollection<Signout>(outQ, isLead) ?? [];
  const stale = out.filter((s) => Date.now() - (s.at?.toMillis() ?? Date.now()) > 3 * 86400e3).length;
  const list: Attention[] = [
    { id: 'door', label: 'Waiting at the door', n: can('approveMembers') ? members.filter((m) => m.status === 'pending').length : 0, to: '/admin?tab=pending' },
    { id: 'rep', label: 'Petty rep to confirm', n: reps.length, to: '/petty-crime' },
    { id: 'site', label: 'Blacksite rep claims', n: sites.filter((s) => s.repStatus === 'pending' && s.rep > 0).length, to: '/blacksites' },
    { id: 'wash', label: 'Open wash requests', n: washes.length, to: '/blackmarket?tab=washing' },
    { id: 'out', label: 'Signed out 3+ days', n: stale, to: '/stash?tab=out' },
  ];
  return list;
}

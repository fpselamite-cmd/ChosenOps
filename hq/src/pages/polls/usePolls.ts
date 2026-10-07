import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCollection, useDoc } from '../../hooks/useCollection';
import { useHub } from '../../hooks/useHub';
import { db } from '../../lib/firebase';
import { canSeeResults, logResult, pollOpen, type Ballot, type Poll, type Vote } from '../../lib/polls';
import { useArchiveAccess } from '../archives/useArchives';

/** Ticks so deadlines close on screen without a reload. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

/** Every poll I'm in the audience for, newest first. */
export function usePolls() {
  const { isLead } = useHub();
  const { blooded } = useArchiveAccess();
  const q = useMemo(
    () => (isLead ? collection(db, 'polls') : query(collection(db, 'polls'), where('audience', 'in', blooded ? ['all', 'members'] : ['all']))),
    [isLead, blooded],
  );
  const rows = useCollection<Poll>(q);
  return useMemo(() => rows && [...rows].sort((a, b) => (b.at?.toMillis() ?? Date.now()) - (a.at?.toMillis() ?? Date.now())), [rows]);
}

/** Open polls I haven't voted on: official ones first, then whatever closes soonest. */
export function useUnvoted() {
  const { me } = useHub();
  const polls = usePolls();
  const now = useNow();
  return useMemo(
    () =>
      (polls ?? [])
        .filter((p) => pollOpen(p, now) && !p.voters.includes(me.id))
        .sort((a, b) => Number(b.official) - Number(a.official) || (a.closesAt?.toMillis() ?? Infinity) - (b.closesAt?.toMillis() ?? Infinity)),
    [polls, now, me.id],
  );
}

/** My own vote on a poll, through my ballot. */
export function useMyVote(p: Poll) {
  const { me } = useHub();
  const voted = p.voters.includes(me.id);
  const ballot = useDoc<Ballot>(`pollBallots/${p.id}_${me.id}`, voted);
  const vote = useDoc<Vote>(`polls/${p.id}/votes/${ballot?.voteId ?? '_'}`, !!ballot?.voteId);
  return { voted, voteId: ballot?.voteId, vote: voted ? vote : null };
}

/** Everyone's votes, once the poll lets me see them. */
export function useVotes(p: Poll) {
  const { me } = useHub();
  const now = useNow();
  const shows = canSeeResults(p, me.id, now);
  const votes = useCollection<Vote>(`polls/${p.id}/votes`, shows);
  return shows ? (votes ?? []) : null;
}

/** How many people a poll is for. */
export function useEligible(p: Pick<Poll, 'audience'>) {
  const { roster, rankById } = useHub();
  return useMemo(() => {
    if (p.audience === 'all') return roster.length;
    if (p.audience === 'members') return roster.filter((m) => m.rankId !== 'associate').length;
    return roster.filter((m) => {
      const r = rankById.get(m.rankId ?? '');
      return m.admin || r?.order === 0 || r?.leadership;
    }).length;
  }, [p.audience, roster, rankById]);
}

/** Leadership's browser writes each closed official result into the Archives timeline, once. */
export function PollKeeper() {
  const { me, isLead, preview } = useHub();
  const polls = usePolls();
  const now = useNow(60_000);
  const done = useRef(new Set<string>());
  useEffect(() => {
    if (!isLead || preview || !polls) return;
    for (const p of polls) {
      if (!p.official || p.logged || pollOpen(p, now) || done.current.has(p.id)) continue;
      done.current.add(p.id);
      void getDocs(collection(db, 'polls', p.id, 'votes'))
        .then((s) => logResult(me, p, s.docs.map((d) => ({ id: d.id, ...d.data() }) as Vote)))
        .catch(() => done.current.delete(p.id));
    }
  }, [polls, now, isLead, preview, me]);
  return null;
}

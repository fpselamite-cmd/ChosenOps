import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { db } from '../lib/firebase';
import { outranks, pageOpen, rankCan, rankOrder } from '../lib/permissions';
import type { Announcement, Crew, FamilyRep, GangSettings, Member, PageId, Permission, Presence, Rank } from '../lib/types';
import { useAuth } from './useAuth';
import { useCollection, useDoc } from './useCollection';

/** Someone counts as online if their page checked in within this window. */
const ONLINE_MS = 3 * 60_000;
const HEARTBEAT_MS = 90_000;

interface Hub {
  ready: boolean;
  me: Member;
  myRank?: Rank;
  members: Member[];
  /** Active members only. */
  roster: Member[];
  memberById: Map<string, Member>;
  ranks: Rank[];
  rankById: Map<string, Rank>;
  crews: Crew[];
  crewById: Map<string, Crew>;
  /** Crews the signed-in member belongs to. */
  myCrews: Crew[];
  crewsOf: (memberId: string) => Crew[];
  presence: Map<string, Presence>;
  isOnline: (memberId: string) => boolean;
  settings: GangSettings;
  announcement: Announcement | null;
  /** Family gang rep: confirmed petty rep transfers plus blacksite rep. */
  familyRep: number;
  can: (p: Permission) => boolean;
  /** Whether my rank or one of my crew roles opens this page. */
  canSee: (page: PageId) => boolean;
  /** Admin access (the admin password, or given by an owner): every power except acting on the top rank. */
  isAdmin: boolean;
  /** An owner of the HQ (set from GitHub): hands out admin. */
  isOwner: boolean;
  /** Whether I can act on people in, or edit, this rank. */
  actsOn: (rank?: Rank) => boolean;
  /**
   * What opened a page for me: 'rank', or the id of a crew whose role grants it.
   * Every ops write carries it as `_via` so the security rules can check it.
   */
  viaFor: (page: PageId) => string | null;
}

const Ctx = createContext<Hub | null>(null);

export function HubProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const members = useCollection<Member>('members');
  const ranks = useCollection<Rank>('hqRanks');
  const crews = useCollection<Crew>('crews');
  const presenceRows = useCollection<Presence>('presence');
  const settings = useDoc<GangSettings>('settings/gang');
  const announcement = useDoc<Announcement>('settings/announcement');
  const familyRep = useDoc<FamilyRep>('stats/familyRep');

  // Check in while the page is open so the crew can see who's around.
  useEffect(() => {
    if (!me) return;
    const beat = () => {
      if (document.visibilityState === 'visible')
        setDoc(doc(db, 'presence', me.id), { at: serverTimestamp() }, { merge: true }).catch(() => {});
    };
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', beat);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [me?.id]);

  // Am I an owner? Only owners can read their own entry, so a denied read just means no.
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (!me) return;
    getDoc(doc(db, 'meta', 'owners'))
      .then((d) => setOwner(((d.data()?.ids as string[]) ?? []).includes(me.id)))
      .catch(() => setOwner(false));
  }, [me?.id]);

  // Keep each member's crewIds in step with the crews, so pins and events shared with a crew
  // reach them. Everyone fixes their own; crew leaders and crew admins fix everyone.
  useEffect(() => {
    if (!me || !members || !crews || !ranks) return;
    const truth = (id: string) => crews.filter((c) => c.memberIds?.includes(id)).map((c) => c.id).sort().slice(0, 5);
    const myRank = ranks.find((r) => r.id === me.rankId);
    const fixAll = rankCan(myRank, 'manageCrews') || crews.some((c) => c.leaderId === me.id);
    for (const m of members) {
      if (m.status !== 'active' || (!fixAll && m.id !== me.id)) continue;
      const want = truth(m.id);
      const have = [...(m.crewIds ?? [])].sort();
      if (want.join() !== have.join()) updateDoc(doc(db, 'members', m.id), { crewIds: want }).catch(() => {});
    }
  }, [me, members, crews, ranks]);

  const value = useMemo<Hub | null>(() => {
    if (!me) return null;
    const ready =
      !!members && !!ranks && !!crews && !!presenceRows && settings !== undefined && announcement !== undefined && familyRep !== undefined;
    const sortedRanks = [...(ranks ?? [])].sort((a, b) => a.order - b.order);
    const rankById = new Map(sortedRanks.map((r) => [r.id, r]));
    const allMembers = members ?? [];
    const memberById = new Map(allMembers.map((m) => [m.id, m]));
    const sortedCrews = [...(crews ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const presence = new Map((presenceRows ?? []).map((p) => [p.id, p]));
    const liveMe = memberById.get(me.id) ?? me;
    const myRank = liveMe.rankId ? rankById.get(liveMe.rankId) : undefined;
    const crewsOf = (id: string) => sortedCrews.filter((c) => c.memberIds?.includes(id));
    const myCrews = crewsOf(me.id);
    return {
      ready,
      me: liveMe,
      myRank,
      members: allMembers,
      roster: allMembers
        .filter((m) => m.status === 'active')
        .sort(
          (a, b) =>
            (rankById.get(a.rankId ?? '')?.order ?? 99) - (rankById.get(b.rankId ?? '')?.order ?? 99) ||
            a.name.localeCompare(b.name),
        ),
      memberById,
      ranks: sortedRanks,
      rankById,
      crews: sortedCrews,
      crewById: new Map(sortedCrews.map((c) => [c.id, c])),
      myCrews,
      crewsOf,
      presence,
      isOnline: (id) => {
        const at = presence.get(id)?.at?.toMillis();
        return !!at && Date.now() - at < ONLINE_MS;
      },
      settings: settings ?? { name: 'The Chosen', motto: '' },
      announcement: announcement ?? null,
      familyRep: familyRep?.total ?? 0,
      can: (p) => liveMe.admin === true || rankCan(myRank, p),
      canSee: (page) => liveMe.admin === true || pageOpen(page, myRank, myCrews),
      viaFor: (page) =>
        liveMe.admin === true || (myRank && (myRank.order === 0 || myRank.pages?.[page])) ? 'rank' : (myCrews.find((c) => c.pages?.[page])?.id ?? null),
      isAdmin: liveMe.admin === true,
      isOwner: owner,
      actsOn: (rank) => (liveMe.admin === true ? rankOrder(rank) > 0 : outranks(myRank, rank)),
    };
  }, [me, members, ranks, crews, presenceRows, settings, announcement, familyRep, owner]);

  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub() {
  const hub = useContext(Ctx);
  if (!hub) throw new Error('useHub outside HubProvider');
  return hub;
}

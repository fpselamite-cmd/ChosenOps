import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { applyPrefs, cachedPrefs, DEFAULT_PREFS } from '../lib/appearance';
import type { Defaults } from '../lib/adminData';
import { db } from '../lib/firebase';
import { setCallInCost } from '../lib/blacksites';
import { setCityClock } from '../lib/format';
import { setReadOnly } from '../lib/guard/state';
import type { Role, RoleHolder } from '../lib/roles';
import { outranks, pageOpen, rankCan, rankOrder } from '../lib/permissions';
import type { Announcement, Crew, FamilyRep, GangSettings, Member, PageId, Permission, Presence, Rank } from '../lib/types';
import { useAuth } from './useAuth';
import { useCollection, useDoc } from './useCollection';

/** Someone counts as online if their page checked in within this window. */
const ONLINE_MS = 3 * 60_000;
const HEARTBEAT_MS = 90_000;

/** View the app as a rank, or as one member. */
export interface Preview {
  rankId?: string;
  memberId?: string;
}

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
  /** Leadership powers: a leadership rank, the top rank, or admin (admin is out-of-character, so any rank). */
  isLead: boolean;
  /** An owner of the HQ (set from GitHub): hands out admin. */
  isOwner: boolean;
  /** Roles (jobs and honors held on top of rank). */
  roles: Role[];
  roleById: Map<string, Role>;
  holders: RoleHolder[];
  rolesOf: (memberId: string) => Role[];
  /** An admin previewing the app as a rank or a member: read-only until they stop. */
  preview: Preview | null;
  setPreview: (p: Preview | null) => void;
  /** Who is really signed in (the same as `me` unless previewing). */
  realMe: Member;
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
  // Crews were retired: nothing in HQ is grouped by crew any more (old crew data is left alone).
  const crews: Crew[] = useMemo(() => [], []);
  const presenceRows = useCollection<Presence>('presence');
  const settings = useDoc<GangSettings>('settings/gang');
  const announcement = useDoc<Announcement>('settings/announcement');
  const familyRep = useDoc<FamilyRep>('stats/familyRep');
  const defaults = useDoc<Defaults>('settings/defaults');
  const roleRows = useCollection<Role>('hqRoles');
  const holderRows = useCollection<RoleHolder>('roleHolders');
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const setPreview = (p: Preview | null) => {
    // Writes stop the moment a preview starts, before anything renders as them.
    setReadOnly(p ? 'previewing as someone else' : null);
    setPreviewState(p);
  };

  // The gang's look: its accent is everyone's default until they pick their own.
  useEffect(() => {
    const accent = settings?.accent;
    if (!accent || DEFAULT_PREFS.accent === accent) return;
    DEFAULT_PREFS.accent = accent;
    applyPrefs(cachedPrefs());
  }, [settings]);

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


  const value = useMemo<Hub | null>(() => {
    if (!me) return null;
    const ready =
      !!members && !!ranks && !!crews && !!presenceRows && settings !== undefined && announcement !== undefined && familyRep !== undefined && defaults !== undefined && !!roleRows && !!holderRows;
    // The city clock, before anything shows a time.
    if (defaults) setCallInCost(defaults.callInCost);
    if (defaults) setCityClock(defaults.zone, defaults.zoneLabel, defaults.nightFrom != null && defaults.nightTo != null ? { from: defaults.nightFrom, to: defaults.nightTo } : undefined);
    const sortedRanks = [...(ranks ?? [])].sort((a, b) => a.order - b.order);
    const rankById = new Map(sortedRanks.map((r) => [r.id, r]));
    const allMembers = members ?? [];
    const memberById = new Map(allMembers.map((m) => [m.id, m]));
    const sortedCrews = [...(crews ?? [])].sort((a, b) => a.name.localeCompare(b.name));
    const presence = new Map((presenceRows ?? []).map((p) => [p.id, p]));
    const realMe = memberById.get(me.id) ?? me;
    const realAdmin = realMe.admin === true;
    // Previewing: everything below is worked out for them, with no admin powers.
    const liveMe: Member =
      preview && realAdmin
        ? preview.memberId
          ? { ...(memberById.get(preview.memberId) ?? realMe), admin: false }
          : { ...realMe, rankId: preview.rankId ?? realMe.rankId, admin: false }
        : realMe;
    const myRank = liveMe.rankId ? rankById.get(liveMe.rankId) : undefined;
    const sortedRoles = [...(roleRows ?? [])].sort((a, b) => a.order - b.order);
    const roleById = new Map(sortedRoles.map((r) => [r.id, r]));
    const holders = holderRows ?? [];
    const holderOf = new Map(holders.map((h) => [h.id, h]));
    // A rank preview has no roles; a member preview has theirs.
    const myRoles = preview && realAdmin && !preview.memberId ? undefined : holderOf.get(liveMe.id);
    const roleCan = (p: Permission) => myRoles?.perms?.[p] === true;
    const rolePage = (page: PageId) => myRoles?.pages?.[page] === true;
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
      can: (p) => liveMe.admin === true || rankCan(myRank, p) || roleCan(p),
      canSee: (page) => liveMe.admin === true || pageOpen(page, myRank, myCrews) || rolePage(page),
      viaFor: (page) =>
        liveMe.admin === true || (myRank && (myRank.order === 0 || myRank.pages?.[page]))
          ? 'rank'
          : rolePage(page)
            ? 'role'
            : (myCrews.find((c) => c.pages?.[page])?.id ?? null),
      isAdmin: liveMe.admin === true,
      isLead: liveMe.admin === true || (!!myRank && (myRank.order === 0 || !!myRank.leadership)) || myRoles?.lead === true,
      roles: sortedRoles,
      roleById,
      holders,
      rolesOf: (id) => (holderOf.get(id)?.roles ?? []).map((r) => roleById.get(r)).filter((r): r is Role => !!r),
      isOwner: owner && !preview,
      preview: realAdmin ? preview : null,
      setPreview,
      realMe,
      actsOn: (rank) => (liveMe.admin === true ? rankOrder(rank) > 0 : outranks(myRank, rank)),
    };
  }, [me, members, ranks, crews, presenceRows, settings, announcement, familyRep, owner, defaults, preview, roleRows, holderRows]);

  if (!value) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHub() {
  const hub = useContext(Ctx);
  if (!hub) throw new Error('useHub outside HubProvider');
  return hub;
}

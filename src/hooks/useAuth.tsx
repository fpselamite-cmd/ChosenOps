import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import { liveQuery } from '../lib/live';
import type { Branding, Member } from '../lib/types';

interface AuthState {
  user: User | null;
  /** The signed-in member's own document; null until it exists. */
  me: Member | null;
  loading: boolean;
  /** Signed in, but this account can no longer read its member file (e.g. PIN was reset elsewhere). */
  lockedOut: boolean;
  branding: Branding;
}

const DEFAULT_BRANDING: Branding = { name: 'The Chosen', motto: 'Blood. Gold. Loyalty.', logo: null };

const AuthContext = createContext<AuthState>({ user: null, me: null, loading: true, lockedOut: false, branding: DEFAULT_BRANDING });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [meReady, setMeReady] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
      }),
    [],
  );

  // After a PIN reset the member signs in with a new account that is linked to
  // their original member id (see firestore.rules); resolve that first.
  const [memberId, setMemberId] = useState<string | null>(null);
  useEffect(() => {
    setMemberId(null);
    if (!user) return;
    return onSnapshot(
      doc(db, 'authLinks', user.uid),
      (snap) => setMemberId(snap.exists() ? (snap.data().memberId as string) : user.uid),
      () => setMemberId(user.uid),
    );
  }, [user]);

  useEffect(() => {
    setMe(null);
    setMeReady(false);
    setLockedOut(false);
    if (!user || !memberId) return;
    return liveQuery(
      doc(db, 'users', memberId),
      (snap) => {
        const data = snap.data() as Omit<Member, 'id'> | undefined;
        // Ignore a member file that has since moved to a different sign-in account.
        const mine = data && (!data.authUid || data.authUid === user.uid);
        setMe(mine ? ({ id: snap.id, ...data } as Member) : null);
        setLockedOut(!!data && !mine);
        setMeReady(true);
      },
      () => {
        setLockedOut(true);
        setMeReady(true);
      },
    );
  }, [user, memberId]);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'settings', 'branding'),
        (snap) => snap.exists() && setBranding({ ...DEFAULT_BRANDING, ...(snap.data() as Branding) }),
        () => {},
      ),
    [],
  );

  const loading = !authReady || (!!user && !meReady);
  return <AuthContext.Provider value={{ user, me, loading, lockedOut, branding }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

import { onAuthStateChanged, type User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import type { Branding, Member } from '../lib/types';

interface AuthState {
  user: User | null;
  /** The signed-in member's own document; null until it exists. */
  me: Member | null;
  loading: boolean;
  branding: Branding;
}

const DEFAULT_BRANDING: Branding = { name: 'The Chosen', motto: 'Blood. Gold. Loyalty.', logo: null };

const AuthContext = createContext<AuthState>({ user: null, me: null, loading: true, branding: DEFAULT_BRANDING });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Member | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [meReady, setMeReady] = useState(false);
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(
    () =>
      onAuthStateChanged(auth, (u) => {
        setUser(u);
        setAuthReady(true);
      }),
    [],
  );

  useEffect(() => {
    setMe(null);
    setMeReady(false);
    if (!user) return;
    return onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        setMe(snap.exists() ? ({ id: snap.id, ...snap.data() } as Member) : null);
        setMeReady(true);
      },
      () => setMeReady(true),
    );
  }, [user]);

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
  return <AuthContext.Provider value={{ user, me, loading, branding }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

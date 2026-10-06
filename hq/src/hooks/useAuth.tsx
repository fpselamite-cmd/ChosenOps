import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, db } from '../lib/firebase';
import type { Member } from '../lib/types';

interface AuthState {
  user: User | null;
  me: Member | null;
  loading: boolean;
  /** Signed in with a sign-in account that a PIN reset has since retired. */
  lockedOut: boolean;
}

const Ctx = createContext<AuthState>({ user: null, me: null, loading: true, lockedOut: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, me: null, loading: true, lockedOut: false });

  useEffect(() => {
    let unsubMember = () => {};
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      unsubMember();
      if (!user) {
        setState({ user: null, me: null, loading: false, lockedOut: false });
        return;
      }
      // A sign-in left over from the old archive app (same site, same project): it has no HQ file.
      if (!user.email?.endsWith('@hq.chosenops.app')) {
        await signOut(auth).catch(() => {});
        return;
      }
      setState({ user, me: null, loading: true, lockedOut: false });
      // After a PIN reset, the sign-in account is linked back to the original member file.
      let memberId = user.uid;
      try {
        const link = await getDoc(doc(db, 'authLinks', user.uid));
        if (link.exists()) memberId = link.data().memberId;
      } catch {
        /* no link */
      }
      // Right after signing up the file may not exist yet; a refused watch stops for good, so
      // keep retrying for a while instead of waiting forever.
      let tries = 0;
      let retry: ReturnType<typeof setTimeout> | undefined;
      let current = () => {};
      unsubMember = () => {
        clearTimeout(retry);
        current();
      };
      const watch = () => {
        current = onSnapshot(
          doc(db, 'members', memberId),
          (snap) => {
            if (!snap.exists()) return setState({ user, me: null, loading: false, lockedOut: false });
            const me = { id: snap.id, ...snap.data() } as Member;
            const bound = (me.authUid ?? me.id) === user.uid;
            setState({ user, me: bound ? me : null, loading: false, lockedOut: !bound });
          },
          () => {
            setState({ user, me: null, loading: false, lockedOut: false });
            if (tries++ < 20) retry = setTimeout(watch, 1500);
          },
        );
      };
      watch();
    });
    return () => {
      unsubAuth();
      unsubMember();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

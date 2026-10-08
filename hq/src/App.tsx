import { useEffect, useState, type ReactNode } from 'react';
import { logout } from './lib/auth';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { NOELOPS_URL } from './lib/noelops';
import type { PageId } from './lib/types';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Field';
import { useAuth } from './hooks/useAuth';
import { HubProvider, useHub } from './hooks/useHub';
import Admin from './pages/admin/Admin';
import Money from './pages/money/Money';
import BlackMarket from './pages/BlackMarket';
import Dashboard from './pages/Dashboard';
import Family from './pages/Family';
import Stash from './pages/Stash';
import PettyCrime from './pages/PettyCrime';
import Locker from './pages/Locker';
import HallOfFame from './pages/HallOfFame';
import Blacksites from './pages/Blacksites';
import Rivals from './pages/rivals/Rivals';
import Welcome from './pages/welcome/Welcome';
import Archives from './pages/archives/Archives';
import Casino from './pages/casino/Casino';
import Polls from './pages/polls/Polls';
import Heists from './pages/Heists';
import { useWelcomeAccess } from './pages/welcome/useWelcome';
import { HonorsProvider } from './pages/honors/useHonors';
import { PartyProvider } from './pages/parties/Parties';
import Gear from './pages/Gear';
import MapPage from './pages/MapPage';
import CalendarPage from './pages/CalendarPage';
import Login from './pages/Login';
import Pending from './pages/Pending';
import Profile from './pages/Profile';

export default function App() {
  const { user, me, loading, lockedOut } = useAuth();
  // Keep the join / reset forms mounted while their account is being created so they can show errors.
  const path = useLocation().pathname;
  const signingUp = path === '/register' || path === '/reset-pin';

  if (!user && loading) return <Loading label="Opening HQ…" />;

  if (!user || (signingUp && !me))
    return (
      <Routes>
        <Route path="/login" element={<Login mode="login" />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="/reset-pin" element={<Login mode="reset" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );

  if (loading) return <Loading label="Opening HQ…" />;
  if (!me && lockedOut) return <Pending locked />;
  if (!me) return <NoFileYet />;
  if (me.status !== 'active') return <Pending />;

  return (
    <HubProvider>
      <MemberRoutes />
    </HubProvider>
  );
}

/** Signed in, but no member file showed up (yet). After a few seconds, offer a way out. */
function NoFileYet() {
  const [late, setLate] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLate(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <Loading label="Setting up your file…">
      {late && (
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-sm text-ash">This is taking too long. Your sign-in may be from before, or the file didn’t save.</p>
          <div className="flex justify-center gap-2">
            <button className="btn-ghost" onClick={() => window.location.reload()}>
              Try again
            </button>
            <button className="btn-gold" onClick={() => logout()}>
              Sign out
            </button>
          </div>
        </div>
      )}
    </Loading>
  );
}

/** Old Narcotics links: NoelOps runs the grows and cooks now, so open it in a new tab. */
function OpenNoelOps() {
  useEffect(() => {
    window.open(NOELOPS_URL, '_blank', 'noopener');
  }, []);
  return <Navigate to="/stash" replace />;
}

function MeRedirect() {
  const { me } = useHub();
  return <Navigate to={`/members/${me.id}`} replace />;
}

/** Soldiers and up only: associates go back to the Dashboard. */
function BloodedOnly({ children }: { children: ReactNode }) {
  const { isAssoc } = useWelcomeAccess();
  return isAssoc ? <Navigate to="/" replace /> : children;
}

/** Associates only ever see their own character page. */
function OwnPageOnly({ children }: { children: ReactNode }) {
  const { me } = useHub();
  const { isAssoc } = useWelcomeAccess();
  const { id } = useParams();
  return isAssoc && id !== me.id ? <Navigate to={`/members/${me.id}`} replace /> : children;
}

/** Sends people back to the Dashboard if their rank and roles don't open this page. */
function Gate({ page, children }: { page: PageId; children: ReactNode }) {
  const { canSee } = useHub();
  return canSee(page) ? children : <Navigate to="/" replace />;
}

function MemberRoutes() {
  const { ready } = useHub();
  if (!ready) return <Loading label="Opening HQ…" />;
  return (
    <Routes>
      <Route
        element={
          <HonorsProvider>
            <PartyProvider>
              <AppShell />
            </PartyProvider>
          </HonorsProvider>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="me" element={<MeRedirect />} />
        <Route path="hall-of-fame" element={<BloodedOnly><HallOfFame /></BloodedOnly>} />
        <Route path="narcotics" element={<BloodedOnly><Gate page="narcotics"><OpenNoelOps /></Gate></BloodedOnly>} />
        <Route path="stash" element={<BloodedOnly><Gate page="stash"><Stash /></Gate></BloodedOnly>} />
        <Route path="timers" element={<BloodedOnly><Gate page="narcotics"><OpenNoelOps /></Gate></BloodedOnly>} />
        <Route path="meth" element={<BloodedOnly><Gate page="narcotics"><OpenNoelOps /></Gate></BloodedOnly>} />
        <Route path="coke" element={<BloodedOnly><Gate page="narcotics"><OpenNoelOps /></Gate></BloodedOnly>} />
        <Route path="blackmarket" element={<BloodedOnly><Gate page="blackmarket"><BlackMarket /></Gate></BloodedOnly>} />
        <Route path="money" element={<Money />} />
        <Route path="blacksites" element={<BloodedOnly><Gate page="blacksites"><Blacksites /></Gate></BloodedOnly>} />
        <Route path="rivals" element={<BloodedOnly><Rivals /></BloodedOnly>} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="archives" element={<BloodedOnly><Archives /></BloodedOnly>} />
        <Route path="casino" element={<Casino />} />
        <Route path="polls" element={<BloodedOnly><Polls /></BloodedOnly>} />
        <Route path="heists" element={<BloodedOnly><Heists /></BloodedOnly>} />
        <Route
          path="gear"
          element={<Gate page="gear"><Gear /></Gate>}
        />
        <Route path="petty-crime" element={<Gate page="pettycrime"><PettyCrime /></Gate>} />
        <Route path="locker" element={<Locker />} />
        <Route path="members/:id" element={<OwnPageOnly><Profile /></OwnPageOnly>} />
        <Route path="family" element={<BloodedOnly><Gate page="family"><Family /></Gate></BloodedOnly>} />
        <Route path="map" element={<BloodedOnly><Gate page="map"><MapPage /></Gate></BloodedOnly>} />
        <Route path="calendar" element={<BloodedOnly><Gate page="calendar"><CalendarPage /></Gate></BloodedOnly>} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

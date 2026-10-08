import { useEffect, useState, type ReactNode } from 'react';
import { logout } from './lib/auth';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
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
        <Route path="hall-of-fame" element={<HallOfFame />} />
        <Route path="narcotics" element={<Gate page="narcotics"><OpenNoelOps /></Gate>} />
        <Route
          path="stash"
          element={
            <Gate page="stash">
              <Stash />
            </Gate>
          }
        />
        <Route path="timers" element={<Gate page="narcotics"><OpenNoelOps /></Gate>} />
        <Route path="meth" element={<Gate page="narcotics"><OpenNoelOps /></Gate>} />
        <Route path="coke" element={<Gate page="narcotics"><OpenNoelOps /></Gate>} />
        <Route
          path="blackmarket"
          element={
            <Gate page="blackmarket">
              <BlackMarket />
            </Gate>
          }
        />
        <Route path="money" element={<Money />} />
        <Route
          path="blacksites"
          element={
            <Gate page="blacksites">
              <Blacksites />
            </Gate>
          }
        />
        <Route path="rivals" element={<Rivals />} />
        <Route path="welcome" element={<Welcome />} />
        <Route path="archives" element={<Archives />} />
        <Route path="casino" element={<Casino />} />
        <Route path="polls" element={<Polls />} />
        <Route
          path="gear"
          element={
            <Gate page="gear">
              <Gear />
            </Gate>
          }
        />
        <Route path="petty-crime" element={<Gate page="pettycrime"><PettyCrime /></Gate>} />
        <Route path="locker" element={<Locker />} />
        <Route path="members/:id" element={<Profile />} />
        <Route path="family" element={<Gate page="family"><Family /></Gate>} />
        <Route
          path="map"
          element={
            <Gate page="map">
              <MapPage />
            </Gate>
          }
        />
        <Route
          path="calendar"
          element={
            <Gate page="calendar">
              <CalendarPage />
            </Gate>
          }
        />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

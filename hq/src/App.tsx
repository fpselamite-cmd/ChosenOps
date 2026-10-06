import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { PageId } from './lib/types';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Field';
import { useAuth } from './hooks/useAuth';
import { HubProvider, useHub } from './hooks/useHub';
import Admin from './pages/admin/Admin';
import BlackMarket from './pages/BlackMarket';
import Crews from './pages/Crews';
import Dashboard from './pages/Dashboard';
import Family from './pages/Family';
import Narcotics from './pages/Narcotics';
import Stash from './pages/Stash';
import PettyCrime from './pages/PettyCrime';
import Locker from './pages/Locker';
import HallOfFame from './pages/HallOfFame';
import Blacksites from './pages/Blacksites';
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
  if (!me) return <Loading label="Setting up your file…" />;
  if (me.status !== 'active') return <Pending />;

  return (
    <HubProvider>
      <MemberRoutes />
    </HubProvider>
  );
}

/** Sends people back to the Dashboard if their rank and crews don't open this page. */
function Gate({ page, children }: { page: PageId; children: ReactNode }) {
  const { canSee } = useHub();
  return canSee(page) ? children : <Navigate to="/" replace />;
}

function MemberRoutes() {
  const { ready } = useHub();
  if (!ready) return <Loading label="Opening HQ…" />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="hall-of-fame" element={<HallOfFame />} />
        <Route
          path="narcotics"
          element={
            <Gate page="narcotics">
              <Narcotics />
            </Gate>
          }
        />
        <Route
          path="stash"
          element={
            <Gate page="stash">
              <Stash />
            </Gate>
          }
        />
        <Route path="timers" element={<Navigate to="/narcotics?tab=weed" replace />} />
        <Route path="meth" element={<Navigate to="/narcotics?tab=meth" replace />} />
        <Route path="coke" element={<Navigate to="/narcotics?tab=coke" replace />} />
        <Route
          path="blackmarket"
          element={
            <Gate page="blackmarket">
              <BlackMarket />
            </Gate>
          }
        />
        <Route
          path="blacksites"
          element={
            <Gate page="blacksites">
              <Blacksites />
            </Gate>
          }
        />
        <Route
          path="gear"
          element={
            <Gate page="gear">
              <Gear />
            </Gate>
          }
        />
        <Route path="petty-crime" element={<Gate page="pettycrime"><PettyCrime /></Gate>} />
        <Route path="crews" element={<Gate page="crews"><Crews /></Gate>} />
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

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Field';
import { useAuth } from './hooks/useAuth';
import { HubProvider, useHub } from './hooks/useHub';
import Admin from './pages/admin/Admin';
import ComingUp from './pages/ComingUp';
import CrewDetail from './pages/CrewDetail';
import Crews from './pages/Crews';
import Dashboard from './pages/Dashboard';
import Family from './pages/Family';
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

function MemberRoutes() {
  const { ready } = useHub();
  if (!ready) return <Loading label="Opening HQ…" />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="stash" element={<ComingUp page="stash" />} />
        <Route path="timers" element={<ComingUp page="timers" />} />
        <Route path="meth" element={<ComingUp page="meth" />} />
        <Route path="coke" element={<ComingUp page="coke" />} />
        <Route path="blackmarket" element={<ComingUp page="blackmarket" />} />
        <Route path="blacksites" element={<ComingUp page="blacksites" />} />
        <Route path="gear" element={<ComingUp page="gear" />} />
        <Route path="crews" element={<Crews />} />
        <Route path="crews/:id" element={<CrewDetail />} />
        <Route path="members/:id" element={<Profile />} />
        <Route path="family" element={<Family />} />
        <Route path="map" element={<ComingUp page="map" />} />
        <Route path="calendar" element={<ComingUp page="calendar" />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

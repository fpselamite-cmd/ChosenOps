import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Field';
import { useAuth } from './hooks/useAuth';
import { HubProvider, useHub } from './hooks/useHub';
import { firebaseConfigured } from './lib/firebase';
import Admin from './pages/admin/Admin';
import Budget from './pages/Budget';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import Login from './pages/Login';
import Members from './pages/Members';
import Pending from './pages/Pending';
import Profile from './pages/Profile';
import SetupNeeded from './pages/SetupNeeded';

export default function App() {
  const { user, me, loading } = useAuth();
  // Keep the register form mounted while its account is being created so it can show errors.
  const registering = useLocation().pathname === '/register';

  if (!firebaseConfigured) return <SetupNeeded />;
  if (!user && loading) return <Loading label="Opening the doors…" />;

  if (!user || (registering && !me))
    return (
      <Routes>
        <Route path="/login" element={<Login mode="login" />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );

  if (loading) return <Loading label="Opening the doors…" />;
  // Signed in but not (yet) an active member of the family.
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
  if (!ready) return <Loading />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<Profile />} />
        <Route path="budget" element={<Budget />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Loading } from './components/Field';
import { useAuth } from './hooks/useAuth';
import { HubProvider, useHub } from './hooks/useHub';
import { LoreProvider, useLore } from './hooks/useLore';
import Admin from './pages/admin/Admin';
import Bloodlines from './pages/Bloodlines';
import Chronicle from './pages/Chronicle';
import Dashboard from './pages/Dashboard';
import Journals from './pages/Journals';
import LoreArticle from './pages/lore/LoreArticle';
import LoreEditor from './pages/lore/LoreEditor';
import LoreIndex from './pages/lore/LoreIndex';
import Login from './pages/Login';
import Members from './pages/Members';
import Pending from './pages/Pending';
import Profile from './pages/Profile';

export default function App() {
  const { user, me, loading, lockedOut } = useAuth();
  // Keep the register form mounted while its account is being created so it can show errors.
  const path = useLocation().pathname;
  const registering = path === '/register' || path === '/reset-pin';

  if (!user && loading) return <Loading label="Opening the doors…" />;

  if (!user || (registering && !me))
    return (
      <Routes>
        <Route path="/login" element={<Login mode="login" />} />
        <Route path="/register" element={<Login mode="register" />} />
        <Route path="/reset-pin" element={<Login mode="reset" />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );

  if (loading) return <Loading label="Opening the doors…" />;
  if (!me && lockedOut) return <Pending locked />;
  // Signed in but not (yet) an active member of the family.
  if (!me) return <Loading label="Setting up your file…" />;
  if (me.status !== 'active') return <Pending />;

  return (
    <HubProvider>
      <HubGate />
    </HubProvider>
  );
}

function HubGate() {
  const { ready } = useHub();
  if (!ready) return <Loading label="Opening the Archive…" />;
  return (
    <LoreProvider>
      <MemberRoutes />
    </LoreProvider>
  );
}

function MemberRoutes() {
  const { ready } = useLore();
  if (!ready) return <Loading label="Opening the Archive…" />;
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Dashboard />} />
        <Route path="members" element={<Members />} />
        <Route path="members/:id" element={<Profile />} />
        <Route path="archive" element={<LoreIndex />} />
        <Route path="archive/new" element={<LoreEditor key="new" />} />
        <Route path="archive/:id" element={<LoreArticle />} />
        <Route path="archive/:id/edit" element={<LoreEditor />} />
        <Route path="chronicle" element={<Chronicle />} />
        <Route path="journals" element={<Journals />} />
        <Route path="bloodlines" element={<Bloodlines />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

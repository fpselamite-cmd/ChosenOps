import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useHub } from '../hooks/useHub';
import { logout } from '../lib/auth';
import { TZ } from '../lib/format';
import { ADMIN_NAV, NAV, type NavItem } from '../lib/nav';
import { Avatar } from './Avatar';
import { RankBadge } from './Badges';
import { WhoIsOnline } from './WhoIsOnline';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);
  return now.toLocaleTimeString('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

function Brand() {
  const { settings } = useHub();
  return (
    <Link to="/" className="flex items-center gap-3">
      <img src="/brand/logo-192.png" alt="" className="size-11 drop-shadow-[0_0_12px_rgba(212,175,55,0.35)]" />
      <span className="leading-none">
        <span className="foil foil-animate block font-display text-lg font-black tracking-[0.08em]">CHOSENOPS</span>
        <span className="label mt-1 block text-[10px] text-gold-600">{settings.name} · HQ</span>
      </span>
    </Link>
  );
}

function NavLinkItem({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onClick}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 px-3 py-2 font-hud text-[15px] font-semibold tracking-wide transition ${
          isActive
            ? 'bg-gradient-to-r from-gold-400/15 to-transparent text-gold-100'
            : 'text-ash hover:bg-white/[0.03] hover:text-gold-200'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className={`absolute inset-y-1 left-0 w-0.5 ${isActive ? 'bg-gold-400 shadow-[0_0_8px_#d4af37]' : 'bg-transparent'}`} />
          <Icon className={`size-4 ${isActive ? 'text-gold-300' : 'text-gold-600 group-hover:text-gold-400'}`} />
          {item.label}
        </>
      )}
    </NavLink>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useHub();
  const admin = can('approveMembers') || can('manageMembers') || can('manageCrews') || can('manageRanks') || can('manageSettings');
  return (
    <nav className="flex flex-col gap-5">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="label mb-1 px-3 text-[10px] text-gold-700">{g.group}</p>
          <div className="flex flex-col">
            {g.items.map((i) => (
              <NavLinkItem key={i.to} item={i} onClick={onNavigate} />
            ))}
          </div>
        </div>
      ))}
      {admin && (
        <div>
          <p className="label mb-1 px-3 text-[10px] text-gold-700">Command</p>
          <NavLinkItem item={ADMIN_NAV} onClick={onNavigate} />
        </div>
      )}
    </nav>
  );
}

function MeCard() {
  const { me, myRank } = useHub();
  return (
    <div className="flex items-center gap-3 border-t border-line-soft pt-4">
      <Link to={`/members/${me.id}`} className="flex min-w-0 flex-1 items-center gap-3">
        <Avatar member={me} size="md" online />
        <span className="min-w-0">
          <span className="block truncate font-hud font-bold text-gold-100">{me.name}</span>
          <RankBadge rank={myRank} className="mt-0.5" />
        </span>
      </Link>
      <button onClick={logout} className="p-1.5 text-smoke hover:text-gold-200" title="Sign out" aria-label="Sign out">
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

export function AppShell() {
  const clock = useClock();
  const [drawer, setDrawer] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => window.scrollTo(0, 0), [pathname]);

  const mobileItems = NAV.flatMap((g) => g.items).filter((i) => i.mobile);

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-6 border-r border-line bg-coal/95 px-3 py-5 backdrop-blur lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <div className="-mx-1 flex-1 overflow-y-auto px-1">
          <SideNav />
        </div>
        <div className="px-2">
          <MeCard />
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-line bg-void/85 px-4 py-2.5 backdrop-blur pt-[max(0.625rem,env(safe-area-inset-top))] lg:px-8">
        <div className="lg:hidden">
          <Brand />
        </div>
        <p className="label hidden lg:block">
          <span className="text-gold-500">●</span> City time <span className="font-mono text-gold-200">{clock} ET</span>
        </p>
        <WhoIsOnline />
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-6 pb-28 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Phone bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-coal/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {mobileItems.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 font-hud text-[11px] font-semibold tracking-wide ${isActive ? 'text-gold-200' : 'text-smoke'}`
            }
          >
            <i.icon className="size-5" />
            {i.label}
          </NavLink>
        ))}
        <button onClick={() => setDrawer(true)} className="flex flex-col items-center gap-0.5 py-2 font-hud text-[11px] font-semibold text-smoke">
          <Menu className="size-5" />
          More
        </button>
      </nav>

      {/* Phone menu drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" onClick={() => setDrawer(false)}>
          <div
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col gap-5 border-l border-line bg-coal px-3 py-5 pt-[max(1.25rem,env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-2">
              <span className="label text-gold-400">Menu</span>
              <button onClick={() => setDrawer(false)} className="text-smoke" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SideNav onNavigate={() => setDrawer(false)} />
            </div>
            <div className="px-2 pb-[env(safe-area-inset-bottom)]">
              <MeCard />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

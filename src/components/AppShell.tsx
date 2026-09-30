import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useHub } from '../hooks/useHub';
import { logout } from '../lib/auth';
import { displayName } from '../lib/format';
import { Avatar } from './Avatar';
import { Crest } from './Crest';
import { RankBadge } from './RankBadge';

export function AppShell() {
  const { me, branding } = useAuth();
  const { myRank, can, members } = useHub();
  const [open, setOpen] = useState(false);
  const pending = members.filter((m) => m.status === 'pending').length;
  const isOfficer = can('approveMembers') || can('manageMembers') || can('manageRanks') || can('manageSettings');

  const nav = [
    { to: '/', label: 'Dashboard', icon: '♛', end: true },
    { to: '/members', label: 'The Family', icon: '♞' },
    { to: '/budget', label: 'Treasury', icon: '$', hidden: !can('viewBudget') },
    { to: '/inventory', label: 'Inventory', icon: '▣' },
    { to: '/admin', label: 'Admin', icon: '⚙', hidden: !isOfficer, badge: can('approveMembers') ? pending : 0 },
  ];

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-6">
        <Crest className="h-12 w-12" />
        <div className="min-w-0">
          <div className="gold-text truncate font-display text-xl font-black">{branding.name}</div>
          <div className="truncate text-[11px] uppercase tracking-[0.2em] text-smoke">{branding.motto}</div>
        </div>
      </div>
      <div className="divider-gold" />
      <nav className="flex-1 space-y-1 px-3 py-4">
        {nav
          .filter((n) => !n.hidden)
          .map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 font-display text-sm tracking-wider transition ${
                  isActive
                    ? 'bg-gradient-to-r from-gold-500/20 to-transparent text-gold-200 shadow-[inset_2px_0_0_#d4af37]'
                    : 'text-smoke hover:bg-white/5 hover:text-bone'
                }`
              }
            >
              <span className="w-5 text-center text-gold-400">{n.icon}</span>
              <span className="flex-1">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-gold-400 px-2 text-xs font-bold text-ink">{n.badge}</span>}
            </NavLink>
          ))}
      </nav>
      <div className="divider-gold" />
      {me && (
        <div className="flex items-center gap-3 p-4">
          <NavLink to={`/members/${me.id}`} onClick={() => setOpen(false)}>
            <Avatar member={me} size="sm" ring />
          </NavLink>
          <div className="min-w-0 flex-1">
            <NavLink to={`/members/${me.id}`} onClick={() => setOpen(false)} className="block truncate text-sm font-semibold hover:text-gold-200">
              {displayName(me)}
            </NavLink>
            <RankBadge rank={myRank} className="mt-0.5 !text-[9px]" />
          </div>
          <button onClick={logout} className="text-xs text-smoke hover:text-gold-200" title="Sign out">
            ⏻
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-edge bg-coal/95 lg:block">{sidebar}</aside>

      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-edge bg-coal/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center gap-2">
          <Crest className="h-8 w-8" />
          <span className="gold-text font-display text-lg font-black">{branding.name}</span>
        </div>
        <button className="btn-ghost px-3 py-1.5" onClick={() => setOpen(true)} aria-label="Open menu">
          ☰
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-edge bg-coal" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <Outlet />
      </main>
    </div>
  );
}

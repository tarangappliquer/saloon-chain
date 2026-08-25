import { memo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, BrandMark, ThemeToggle } from '@saloon/ui';
import { API_BASE } from '../api/client';
import { appConfig } from '../config';
import { routes } from '../routes';
import { useAuth } from '../features/auth/AuthContext';

interface NavItemProps {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  collapsed?: boolean;
}

const NavLink = memo(function NavLink({ to, icon, children, onClick, collapsed }: NavItemProps) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      onClick={onClick}
      title={collapsed && typeof children === 'string' ? children : undefined}
      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150 ${collapsed ? 'justify-center px-2' : ''} ${
        active
          ? 'bg-primary text-primary-foreground shadow-xs shadow-primary/20 font-bold'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="shrink-0 text-current">{icon}</span>
      {!collapsed && <span className="truncate">{children}</span>}
    </Link>
  );
});

const NAV_COLLAPSED_KEY = 'saloon_client_nav_collapsed';

export const Nav = memo(function Nav() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Desktop-only rail collapse; the mobile drawer always renders expanded (see renderNavContent
  // calls below) since it's already an on-demand overlay, not persistent chrome to shrink.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(NAV_COLLAPSED_KEY) === '1');

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(NAV_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  if (!user) return null;
  // Narrowing from the guard above doesn't carry into renderNavContent below -- it's a nested
  // function declaration, not inline code, so TS can't assume `user` is still non-null by the time
  // it runs. Capture the narrowed value in its own const instead.
  const currentUser = user;

  const initials = currentUser.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  function renderNavContent(isCollapsed: boolean) {
    return (
      <div className="flex h-full flex-col justify-between p-4 overflow-y-auto no-scrollbar">
        {/* Brand & Main Navigation */}
        <div className="space-y-5">
          <div className={`flex items-center px-2 py-1 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
            <Link to={routes.explore} className="flex items-center gap-2 min-w-0">
              <BrandMark label={isCollapsed ? undefined : 'Shoppey Saloon'} />
            </Link>
            <button
              type="button"
              className="md:hidden rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => setMobileOpen(false)}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav aria-label="Main Navigation" className="space-y-1.5">
            <NavLink
              to={routes.explore}
              onClick={() => setMobileOpen(false)}
              collapsed={isCollapsed}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="11" cy="11" r="7" strokeWidth="2" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-4.35-4.35" />
                </svg>
              }
            >
              Explore
            </NavLink>

            <NavLink
              to={routes.myBookings}
              onClick={() => setMobileOpen(false)}
              collapsed={isCollapsed}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
                  <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                  <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                  <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                </svg>
              }
            >
              My Bookings
            </NavLink>

            <NavLink
              to={routes.book.root}
              onClick={() => setMobileOpen(false)}
              collapsed={isCollapsed}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              Book Now
            </NavLink>
          </nav>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="space-y-3 border-t border-border/70 pt-4 mt-4">
          {appConfig.enableThemeToggle && !isCollapsed && (
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs text-muted-foreground font-medium">Appearance</span>
              <ThemeToggle />
            </div>
          )}

          <div className={`flex items-center gap-2 rounded-xl border border-border/80 bg-accent/40 p-2.5 ${isCollapsed ? 'flex-col' : 'justify-between'}`}>
            <Link
              to={routes.profile}
              onClick={() => setMobileOpen(false)}
              title={isCollapsed ? currentUser.name : undefined}
              className={`flex items-center gap-2.5 min-w-0 overflow-hidden group ${isCollapsed ? '' : 'flex-1'}`}
            >
              {currentUser.photoPath ? (
                <img
                  src={`${API_BASE}${currentUser.photoPath}?v=${currentUser.photoVersion}`}
                  alt={currentUser.name}
                  loading="lazy"
                  decoding="async"
                  className="h-8 w-8 rounded-full object-cover shrink-0"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary shrink-0">
                  {initials}
                </span>
              )}
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition">
                    {currentUser.name}
                  </p>
                  {currentUser.isEmulated && (
                    <div className="mt-0.5">
                      <Badge status="Emulated" />
                    </div>
                  )}
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={logout}
              title="Sign out"
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Side Navbar */}
      <aside
        aria-label="Main Navigation"
        className={`hidden md:flex shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0 z-30 transition-all duration-200 ${collapsed ? 'w-20' : 'w-64'}`}
      >
        {renderNavContent(collapsed)}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden md:flex absolute top-6 -right-3 h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground transition z-40"
        >
          <svg className={`h-3.5 w-3.5 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </aside>

      {/* Mobile Header Bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Link to={routes.explore} className="flex items-center gap-2">
          <BrandMark label="Shoppey Saloon" />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* Mobile Drawer Overlay -- always renders fully expanded, independent of the desktop collapse state */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative flex w-72 max-w-full flex-col bg-card shadow-2xl z-10">
            {renderNavContent(false)}
          </div>
        </div>
      )}
    </>
  );
});

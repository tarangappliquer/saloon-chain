import { memo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, BrandMark, ThemeToggle } from '@saloon/ui';
import { API_BASE } from '../api/client';
import { appConfig } from '../config';
import { routes } from '../routes';
import { useAuth } from '../features/auth/AuthContext';
import { ADMIN_ACCESS, LOCATION_MANAGEMENT, POS_ACCESS } from '../constants';

const NavLink = memo(function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${
        active
          ? 'bg-primary/10 text-primary shadow-2xs'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      {children}
    </Link>
  );
});

export const Nav = memo(function Nav() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md">
      <nav aria-label="Admin Navigation" className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
        <div className="flex items-center gap-6 overflow-x-auto py-1 no-scrollbar">
          <Link to={routes.root} className="flex items-center gap-2 shrink-0">
            <BrandMark label="Saloon Admin" />
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <NavLink to={routes.root}>Dashboard</NavLink>
            {LOCATION_MANAGEMENT.includes(user.role) && <NavLink to={routes.catalog.saloons}>Saloons</NavLink>}
            {user.role === 'Manager' && <NavLink to={routes.myLocation}>My Location</NavLink>}
            {POS_ACCESS.includes(user.role) && <NavLink to={routes.pos}>POS</NavLink>}
            <NavLink to={routes.bookings}>Bookings</NavLink>
            {ADMIN_ACCESS.includes(user.role) && <NavLink to={routes.customers}>Customers</NavLink>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {appConfig.enableThemeToggle && <ThemeToggle />}
          <Link
            to={routes.profile}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            {user.photoPath ? (
              <img
                src={`${API_BASE}${user.photoPath}?v=${user.photoVersion}`}
                alt={user.name}
                loading="lazy"
                decoding="async"
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                {initials}
              </span>
            )}
            <span className="font-semibold">{user.name}</span>
            <Badge status={user.role} />
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
});

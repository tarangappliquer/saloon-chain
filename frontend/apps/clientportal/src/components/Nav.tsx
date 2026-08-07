import { memo, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BrandMark, ThemeToggle } from '@saloon/ui';
import { API_BASE } from '../api/client';
import { appConfig } from '../config';
import { routes } from '../routes';
import { useAuth } from '../features/auth/AuthContext';

const NavLink = memo(function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-150 ${active
        ? 'bg-primary text-white shadow-xs font-bold'
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
      <nav aria-label="Main Navigation" className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6">
          <Link to={routes.explore} className="flex items-center gap-2 shrink-0">
            <BrandMark label="Shoppey Saloon" />
          </Link>
          <div className="flex items-center gap-1">
            <NavLink to={routes.explore}>Explore</NavLink>
            <NavLink to={routes.myBookings}>My Bookings</NavLink>
            <NavLink to={routes.book.root}>Book Now</NavLink>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {appConfig.enableThemeToggle && <ThemeToggle />}
          <Link
            to={routes.profile}
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-1 pr-3 text-foreground hover:bg-accent transition"
            title="Profile"
          >
            {user.photoPath ? (
              <img
                src={`${API_BASE}${user.photoPath}?v=${user.photoVersion}`}
                alt={user.name}
                loading="lazy"
                decoding="async"
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {initials}
              </span>
            )}
            <span className="hidden text-xs font-semibold sm:inline">{user.name}</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition"
          >
            Sign out
          </button>
        </div>
      </nav>
    </header>
  );
});

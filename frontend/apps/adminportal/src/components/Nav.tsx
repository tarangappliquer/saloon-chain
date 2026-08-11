import { memo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Badge, BrandMark, ThemeToggle } from '@saloon/ui';
import { API_BASE } from '../api/client';
import { appConfig } from '../config';
import { routes } from '../routes';
import { useAuth } from '../features/auth/AuthContext';
import { ADMIN_ACCESS, POS_ACCESS } from '../constants';

interface NavItemProps {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}

const NavLink = memo(function NavLink({ to, icon, children, onClick }: NavItemProps) {
  const location = useLocation();
  const active = location.pathname === to || (to !== '/' && location.pathname.startsWith(`${to}/`));
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
        active
          ? 'bg-primary text-primary-foreground shadow-xs shadow-primary/20 font-bold'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      }`}
    >
      <span className="shrink-0 text-current">{icon}</span>
      <span className="truncate">{children}</span>
    </Link>
  );
});

interface NavSubLinkProps {
  to: string;
  children: ReactNode;
  onClick?: () => void;
}

const NavSubLink = memo(function NavSubLink({ to, children, onClick }: NavSubLinkProps) {
  const location = useLocation();
  const active = location.pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg pl-9 pr-3 py-1.5 text-xs transition-all duration-150 ${
        active
          ? 'text-primary font-bold bg-primary/10'
          : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
      }`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0" />
      <span className="truncate">{children}</span>
    </Link>
  );
});

interface NavGroupProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}

function NavGroup({ title, icon, children, defaultOpen = false }: NavGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-foreground transition"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 text-current">{icon}</span>
          <span className="truncate font-bold">{title}</span>
        </div>
        <svg
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-90 text-primary' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {open && <div className="space-y-0.5 pt-0.5">{children}</div>}
    </div>
  );
}

export const Nav = memo(function Nav() {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const navContent = (
    <div className="flex h-full flex-col justify-between p-4 overflow-y-auto no-scrollbar">
      {/* Brand & Main Navigation Tree */}
      <div className="space-y-5">
        <div className="flex items-center justify-between px-2 py-1">
          <Link to={routes.root} className="flex items-center gap-2">
            <BrandMark label="Saloon Admin" />
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
          {/* 1. Home */}
          <NavLink
            to={routes.root}
            onClick={() => setMobileOpen(false)}
            icon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            }
          >
            Home
          </NavLink>

          {/* 2. Calendar */}
          {ADMIN_ACCESS.includes(user.role) && (
            <NavLink
              to={routes.calendar()}
              onClick={() => setMobileOpen(false)}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2" />
                  <line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" />
                  <line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" />
                  <line x1="3" y1="10" x2="21" y2="10" strokeWidth="2" />
                </svg>
              }
            >
              Calendar
            </NavLink>
          )}

          {/* 3. Sales Group */}
          <NavGroup
            title="Sales"
            icon={
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          >
            <NavSubLink to={routes.reports} onClick={() => setMobileOpen(false)}>
              Daily Sales Summary
            </NavSubLink>
            <NavSubLink to={routes.bookings} onClick={() => setMobileOpen(false)}>
              Appointments
            </NavSubLink>
            <NavSubLink to={routes.reports} onClick={() => setMobileOpen(false)}>
              Sales Transactions
            </NavSubLink>
            <NavSubLink to={routes.reports} onClick={() => setMobileOpen(false)}>
              Payments
            </NavSubLink>
          </NavGroup>

          {/* 4. Clients */}
          {POS_ACCESS.includes(user.role) && (
            <NavLink
              to={routes.customers}
              onClick={() => setMobileOpen(false)}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              }
            >
              Clients
            </NavLink>
          )}

          {/* 5. Catalog Group */}
          {ADMIN_ACCESS.includes(user.role) && (
            <NavGroup
              title="Catalog"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
              }
            >
              <NavSubLink to={routes.catalog.treatments()} onClick={() => setMobileOpen(false)}>
                Services
              </NavSubLink>
              <NavSubLink to={routes.catalog.treatmentCategories} onClick={() => setMobileOpen(false)}>
                Packages
              </NavSubLink>
              <NavSubLink to={routes.inventory} onClick={() => setMobileOpen(false)}>
                Products
              </NavSubLink>
            </NavGroup>
          )}

          {/* 6. Inventory Group */}
          {ADMIN_ACCESS.includes(user.role) && (
            <NavGroup
              title="Inventory"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              }
            >
              <NavSubLink to={routes.inventory} onClick={() => setMobileOpen(false)}>
                Stock Orders
              </NavSubLink>
              <NavSubLink to={routes.inventory} onClick={() => setMobileOpen(false)}>
                Stocktakes
              </NavSubLink>
              <NavSubLink to={routes.inventory} onClick={() => setMobileOpen(false)}>
                Suppliers
              </NavSubLink>
            </NavGroup>
          )}

          {/* 7. Team Group */}
          {ADMIN_ACCESS.includes(user.role) && (
            <NavGroup
              title="Team"
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              }
            >
              <NavSubLink to={routes.staff.users} onClick={() => setMobileOpen(false)}>
                Team Members
              </NavSubLink>
              <NavSubLink to={routes.staff.therapists} onClick={() => setMobileOpen(false)}>
                Timesheets
              </NavSubLink>
              <NavSubLink to={routes.payroll} onClick={() => setMobileOpen(false)}>
                Pay Runs
              </NavSubLink>
            </NavGroup>
          )}

          {/* 8. Reports */}
          {ADMIN_ACCESS.includes(user.role) && (
            <NavLink
              to={routes.reports}
              onClick={() => setMobileOpen(false)}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 012-2h2a2 2 0 012 2v6m4 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              }
            >
              Reports
            </NavLink>
          )}

          {/* 9. Settings */}
          {ADMIN_ACCESS.includes(user.role) && (
            <NavLink
              to={routes.settings}
              onClick={() => setMobileOpen(false)}
              icon={
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              }
            >
              Settings
            </NavLink>
          )}
        </nav>
      </div>

      {/* User Profile & Sign Out Footer */}
      <div className="space-y-3 border-t border-border/70 pt-4 mt-4">
        {appConfig.enableThemeToggle && (
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-xs text-muted-foreground font-medium">Appearance</span>
            <ThemeToggle />
          </div>
        )}

        <div className="flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-accent/40 p-2.5">
          <Link
            to={routes.profile}
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-2.5 min-w-0 overflow-hidden flex-1 group"
          >
            {user.photoPath ? (
              <img
                src={`${API_BASE}${user.photoPath}?v=${user.photoVersion}`}
                alt={user.name}
                loading="lazy"
                decoding="async"
                className="h-8 w-8 rounded-full object-cover shrink-0"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary shrink-0">
                {initials}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-foreground group-hover:text-primary transition">
                {user.name}
              </p>
              <div className="mt-0.5">
                <Badge status={user.role} />
              </div>
            </div>
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

  return (
    <>
      {/* Desktop Side Navbar */}
      <aside aria-label="Admin Navigation" className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card h-screen sticky top-0 z-30">
        {navContent}
      </aside>

      {/* Mobile Header Bar */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Link to={routes.root} className="flex items-center gap-2">
          <BrandMark label="Saloon Admin" />
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

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative flex w-72 max-w-full flex-col bg-card shadow-2xl z-10">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
});

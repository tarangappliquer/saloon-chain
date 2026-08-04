import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandMark, ErrorBoundary, LoadingFallback, ThemeProvider, ThemeToggle } from '@saloon/ui';
import { ADMIN_PORTAL_URL } from './api/client';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { ConfirmedStep } from './features/booking/ConfirmedStep';
import { ScheduleStep } from './features/booking/ScheduleStep';
import { SummaryStep } from './features/booking/SummaryStep';
import { TreatmentsStep } from './features/booking/TreatmentsStep';
import { BookPage } from './pages/BookPage';
import { EmulatePage } from './pages/EmulatePage';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ProfilePage } from './pages/ProfilePage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

function EmulationBanner() {
  const { user, logout } = useAuth();
  if (!user?.isEmulated) return null;

  function exit() {
    logout();
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        window.location.href = ADMIN_PORTAL_URL;
      }
    }, 100);
  }

  return (
    <div className="flex items-center justify-between border-b border-amber-500/30 bg-amber-500/10 px-6 py-2.5 text-xs font-medium text-amber-700 dark:text-amber-300">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span>
          Viewing as <strong className="font-semibold">{user!.name}</strong> on behalf of {user!.emulatedByName ?? 'a staff member'}.
        </span>
      </div>
      <button
        type="button"
        onClick={exit}
        className="rounded-md bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-500/30 transition dark:text-amber-200"
      >
        Exit emulation
      </button>
    </div>
  );
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
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
}

function Nav() {
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
      <nav aria-label="Main Navigation" className="mx-auto flex max-w-5xl items-center justify-between px-6 py-2.5">
        <div className="flex items-center gap-6">
          <Link to="/my-bookings" className="flex items-center gap-2 shrink-0">
            <BrandMark label="Saloon" />
          </Link>
          <div className="flex items-center gap-1">
            <NavLink to="/my-bookings">My Bookings</NavLink>
            <NavLink to="/book">Book</NavLink>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-1 pr-3 text-foreground hover:bg-accent transition"
            title="Profile"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
              {initials}
            </span>
            <span className="hidden text-xs font-semibold sm:inline">{user.name}</span>
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
}

function AppRoutes() {
  return (
    <>
      <EmulationBanner />
      <Nav />
      <Routes>
        <Route path="/" element={<Navigate to="/my-bookings" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/emulate" element={<EmulatePage />} />
        <Route
          path="/book"
          element={
            <RequireAuth>
              <BookPage />
            </RequireAuth>
          }
        >
          <Route index element={<TreatmentsStep />} />
          <Route path="confirmed" element={<ConfirmedStep />} />
          <Route path=":bookingId/schedule" element={<ScheduleStep />} />
          <Route path=":bookingId/summary" element={<SummaryStep />} />
        </Route>
        <Route
          path="/my-bookings"
          element={
            <RequireAuth>
              <MyBookingsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/my-bookings" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <AppRoutes />
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

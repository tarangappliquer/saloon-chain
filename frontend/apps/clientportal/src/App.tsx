import { lazy, memo, Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandMark, ConnectivityBanner, ErrorBoundary, LoadingFallback, ThemeProvider, ThemeToggle } from '@saloon/ui';
import { API_BASE } from './api/client';
import { appConfig } from './config';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { PortalConfigProvider, usePortalConfig } from './features/config/PortalConfigContext';
import { VerifyEmailGate } from './components/VerifyEmailGate';
import { ConfirmedStep } from './features/booking/ConfirmedStep';
import { PaymentStep } from './features/booking/PaymentStep';
import { ScheduleStep } from './features/booking/ScheduleStep';
import { SummaryStep } from './features/booking/SummaryStep';
import { TreatmentsStep } from './features/booking/TreatmentsStep';

const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const VenueDetailPage = lazy(() => import('./pages/VenueDetailPage').then((m) => ({ default: m.VenueDetailPage })));
const BookPage = lazy(() => import('./pages/BookPage').then((m) => ({ default: m.BookPage })));
const EmulatePage = lazy(() => import('./pages/EmulatePage').then((m) => ({ default: m.EmulatePage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const MyBookingsPage = lazy(() => import('./pages/MyBookingsPage').then((m) => ({ default: m.MyBookingsPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isEmailVerified) return <VerifyEmailGate />;
  return <>{children}</>;
}

const EmulationBanner = memo(function EmulationBanner() {
  const { user, logout } = useAuth();
  const { adminPortalUrl } = usePortalConfig();
  if (!user?.isEmulated) return null;

  function exit() {
    logout();
    window.close();
    setTimeout(() => {
      if (!window.closed) {
        window.location.href = adminPortalUrl;
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
});

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

const Nav = memo(function Nav() {
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
          <Link to="/explore" className="flex items-center gap-2 shrink-0">
            <BrandMark label="Shoppey Saloon" />
          </Link>
          <div className="flex items-center gap-1">
            <NavLink to="/explore">Explore</NavLink>
            <NavLink to="/my-bookings">My Bookings</NavLink>
            <NavLink to="/book">Book Now</NavLink>
          </div>
        </div>

        <div className="flex items-center gap-3 text-sm">
          {appConfig.enableThemeToggle && <ThemeToggle />}
          <Link
            to="/profile"
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

function AppRoutes() {
  const { refetch } = usePortalConfig();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <ConnectivityBanner apiBase={API_BASE} onServerUp={refetch} />
      <EmulationBanner />
      <Nav />
      <main className="flex-1">
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/explore" replace />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/emulate" element={<EmulatePage />} />
            <Route
              path="/explore"
              element={
                <RequireAuth>
                  <ExplorePage />
                </RequireAuth>
              }
            />
            <Route
              path="/venue/:locationId"
              element={
                <RequireAuth>
                  <VenueDetailPage />
                </RequireAuth>
              }
            />
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
              <Route path=":bookingId/payment" element={<PaymentStep />} />
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
            <Route path="*" element={<Navigate to="/explore" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback />}>
            <PortalConfigProvider>
              <AppRoutes />
            </PortalConfigProvider>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

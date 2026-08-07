import { lazy, memo, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ConnectivityBanner, ErrorBoundary, LoadingFallback, ThemeProvider } from '@saloon/ui';
import { API_BASE } from './api/client';
import { routePatterns, routes } from './routes';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { PortalConfigProvider, usePortalConfig } from './features/config/PortalConfigContext';
import { VerifyEmailGate } from './components/VerifyEmailGate';
import { Nav } from './components/Nav';
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
  if (!user) return <Navigate to={routes.login} replace />;
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

// Header only ever renders around routes that require a signed-in user -- login/forgot-password/
// reset-password/verify-email/emulate stay outside this layout so they never get a nav bar, even if
// the visitor happens to already hold a session (e.g. a verify-email link opened while logged in).
function AuthedLayout() {
  return (
    <>
      <EmulationBanner />
      <Nav />
      <main className="flex-1">
        <Outlet />
      </main>
    </>
  );
}

function AppRoutes() {
  const { refetch } = usePortalConfig();
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
      <ConnectivityBanner apiBase={API_BASE} onServerUp={refetch} />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to={routes.explore} replace />} />
          <Route path={routes.login} element={<LoginPage />} />
          <Route path={routes.forgotPassword} element={<ForgotPasswordPage />} />
          <Route path={routes.resetPassword} element={<ResetPasswordPage />} />
          <Route path={routes.verifyEmail} element={<VerifyEmailPage />} />
          <Route path={routes.emulate} element={<EmulatePage />} />

          <Route element={<AuthedLayout />}>
            <Route
              path={routes.explore}
              element={
                <RequireAuth>
                  <ExplorePage />
                </RequireAuth>
              }
            />
            <Route
              path={routePatterns.venue}
              element={
                <RequireAuth>
                  <VenueDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path={routes.book.root}
              element={
                <RequireAuth>
                  <BookPage />
                </RequireAuth>
              }
            >
              <Route index element={<TreatmentsStep />} />
              <Route path={routePatterns.book.confirmed} element={<ConfirmedStep />} />
              <Route path={routePatterns.book.schedule} element={<ScheduleStep />} />
              <Route path={routePatterns.book.summary} element={<SummaryStep />} />
              <Route path={routePatterns.book.payment} element={<PaymentStep />} />
            </Route>
            <Route
              path={routes.myBookings}
              element={
                <RequireAuth>
                  <MyBookingsPage />
                </RequireAuth>
              }
            />
            <Route
              path={routes.profile}
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<Navigate to={routes.explore} replace />} />
          </Route>
        </Routes>
      </Suspense>
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

import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary, LoadingFallback } from '@saloon/ui';
import { ADMIN_PORTAL_URL } from './api/client';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { ConfirmedStep } from './features/booking/ConfirmedStep';
import { ScheduleStep } from './features/booking/ScheduleStep';
import { SummaryStep } from './features/booking/SummaryStep';
import { TreatmentsStep } from './features/booking/TreatmentsStep';
import { BookPage } from './pages/BookPage';
import { EmulatePage } from './pages/EmulatePage';
import { LoginPage } from './pages/LoginPage';
import { MyBookingsPage } from './pages/MyBookingsPage';
import { ProfilePage } from './pages/ProfilePage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

// Shown for the whole session while a staff member is emulating this customer -- makes it
// unmistakable that actions here aren't the customer's own, and "Exit" is the only way back to the
// admin portal (there's no reverse token exchange, just plain logout + redirect).
function EmulationBanner() {
  const { user, logout } = useAuth();
  if (!user?.isEmulated) return null;

  function exit() {
    logout();
    window.location.href = ADMIN_PORTAL_URL;
  }

  return (
    <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-6 py-2.5 text-xs font-medium text-amber-900 shadow-inner dark:border-amber-900/50 dark:bg-amber-950/80 dark:text-amber-200">
      <div className="flex items-center gap-2">
        <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
        <span>
          Viewing as <strong className="font-semibold">{user!.name}</strong> on behalf of {user!.emulatedByName ?? 'a staff member'}.
        </span>
      </div>
      <button
        type="button"
        onClick={exit}
        className="rounded-md bg-amber-200/80 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-300 transition dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
      >
        Exit emulation
      </button>
    </div>
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
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/80 backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-950/80">
      <nav aria-label="Main Navigation" className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
        <div className="flex items-center gap-6">
          <Link to="/my-bookings" className="flex items-center gap-2.5 font-bold text-gray-900 dark:text-gray-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-sm font-bold text-white shadow-md shadow-purple-600/30">
              S
            </span>
            <span className="tracking-tight text-lg">Saloon</span>
          </Link>
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Link
              to="/my-bookings"
              className="rounded-lg px-3 py-1.5 text-gray-700 transition hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-purple-400"
            >
              My Bookings
            </Link>
            <Link
              to="/book"
              className="rounded-lg px-3 py-1.5 text-gray-700 transition hover:bg-gray-100 hover:text-purple-600 dark:text-gray-300 dark:hover:bg-gray-900 dark:hover:text-purple-400"
            >
              Book
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg p-1 text-gray-700 hover:bg-gray-100 transition dark:text-gray-300 dark:hover:bg-gray-900"
            title="Profile"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              {initials}
            </span>
            <span className="hidden font-medium sm:inline">{user.name}</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
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
      <AuthProvider>
        <Suspense fallback={<LoadingFallback />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

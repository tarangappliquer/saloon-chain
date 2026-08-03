import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from '@saloon/ui';
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

function LoadingFallback() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 animate-pulse">
      <div className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="flex gap-4 border-b border-gray-200 py-2 dark:border-gray-800">
        <div className="h-8 w-24 rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="h-8 w-24 rounded-md bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="space-y-4">
        <div className="h-28 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div className="h-28 rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

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
    <div className="flex items-center justify-between bg-amber-100 px-6 py-2 text-sm text-amber-900 dark:bg-amber-900 dark:text-amber-100">
      <span>
        Viewing as {user!.name} on behalf of {user!.emulatedByName ?? 'a staff member'}.
      </span>
      <button type="button" onClick={exit} className="font-medium hover:underline">
        Exit emulation
      </button>
    </div>
  );
}

function Nav() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
      <div className="flex gap-4 text-sm font-medium">
        <Link to="/my-bookings">My Bookings</Link>
        <Link to="/book">Book</Link>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <Link to="/profile" className="font-medium text-gray-600 hover:underline dark:text-gray-300">
          {user.name}
        </Link>
        <button type="button" onClick={logout} className="text-gray-500 hover:underline">
          Sign out
        </button>
      </div>
    </nav>
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

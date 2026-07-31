import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { ADMIN_PORTAL_URL } from './api/client';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { BookPage } from './pages/BookPage';
import { EmulatePage } from './pages/EmulatePage';
import { LoginPage } from './pages/LoginPage';
import { MyBookingsPage } from './pages/MyBookingsPage';

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
        <Link to="/book">Book</Link>
        <Link to="/my-bookings">My Bookings</Link>
      </div>
      <button type="button" onClick={logout} className="text-sm text-gray-500 hover:underline">
        Sign out
      </button>
    </nav>
  );
}

function AppRoutes() {
  return (
    <>
      <EmulationBanner />
      <Nav />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/emulate" element={<EmulatePage />} />
        <Route
          path="/book"
          element={
            <RequireAuth>
              <BookPage />
            </RequireAuth>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <RequireAuth>
              <MyBookingsPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/book" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

export default App;

import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { BookPage } from './pages/BookPage';
import { LoginPage } from './pages/LoginPage';
import { MyBookingsPage } from './pages/MyBookingsPage';

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return user ? <>{children}</> : <Navigate to="/login" replace />;
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
      <Nav />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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

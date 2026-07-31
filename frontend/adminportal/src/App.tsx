import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import type { UserRole } from './api/types';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ChainsPage } from './pages/catalog/ChainsPage';
import { LocationsPage } from './pages/catalog/LocationsPage';
import { TreatmentsPage } from './pages/catalog/TreatmentsPage';
import { StaffPage } from './pages/staff/StaffPage';
import { TherapistsPage } from './pages/staff/TherapistsPage';
import { RoomsPage } from './pages/staff/RoomsPage';
import { BookingsPage } from './pages/bookings/BookingsPage';
import { CustomersPage } from './pages/customers/CustomersPage';

// Mirrors the backend's AdminAccess/StaffAccess authorization policies (Program.cs) -- kept in
// sync by hand since the frontend has no way to read ASP.NET Core policy definitions directly.
const ADMIN_ACCESS: UserRole[] = ['SuperAdmin', 'Admin', 'Manager'];
const STAFF_ACCESS: UserRole[] = ['SuperAdmin', 'Admin', 'Manager', 'Therapist'];

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  return user ? <>{children}</> : <Navigate to="/login" replace state={{ from: location }} />;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return roles.includes(user.role) ? <>{children}</> : <Navigate to="/" replace />;
}

// canEmulate mirrors dbo.Users.IsEmulator (see AuthService.EmulatorEligibleRoles) -- a stricter
// gate than role alone: SuperAdmin/Admin/Manager can hold the role without being flagged as an
// emulator, and /api/auth/emulate rejects them the same way this route does.
function RequireEmulator({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.canEmulate ? <>{children}</> : <Navigate to="/" replace />;
}

function NavLink({ to, children }: { to: string; children: ReactNode }) {
  const location = useLocation();
  const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
  return (
    <Link
      to={to}
      className={active ? 'font-semibold text-purple-600' : 'text-gray-600 hover:text-purple-600 dark:text-gray-300'}
    >
      {children}
    </Link>
  );
}

function Nav() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const canManageCatalog = ADMIN_ACCESS.includes(user.role);

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
      <div className="flex items-center gap-5 text-sm">
        <span className="mr-2 font-semibold text-gray-900 dark:text-gray-100">Saloon Admin</span>
        <NavLink to="/">Dashboard</NavLink>
        {canManageCatalog && <NavLink to="/catalog/chains">Chains</NavLink>}
        {canManageCatalog && <NavLink to="/catalog/locations">Locations</NavLink>}
        {canManageCatalog && <NavLink to="/catalog/treatments">Treatments</NavLink>}
        {canManageCatalog && <NavLink to="/staff/users">Staff</NavLink>}
        {canManageCatalog && <NavLink to="/staff/therapists">Therapists</NavLink>}
        {canManageCatalog && <NavLink to="/staff/rooms">Rooms</NavLink>}
        <NavLink to="/bookings">Bookings</NavLink>
        {user.canEmulate && <NavLink to="/customers">Customers</NavLink>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <span className="text-gray-500">
          {user.name} &middot; {user.role}
        </span>
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
      <Nav />
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/catalog/chains"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <ChainsPage />
              </RequireRole>
            }
          />
          <Route
            path="/catalog/locations"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <LocationsPage />
              </RequireRole>
            }
          />
          <Route
            path="/catalog/treatments"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <TreatmentsPage />
              </RequireRole>
            }
          />
          <Route
            path="/staff/users"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <StaffPage />
              </RequireRole>
            }
          />
          <Route
            path="/staff/therapists"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <TherapistsPage />
              </RequireRole>
            }
          />
          <Route
            path="/staff/rooms"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <RoomsPage />
              </RequireRole>
            }
          />
          <Route
            path="/bookings"
            element={
              <RequireRole roles={STAFF_ACCESS}>
                <BookingsPage />
              </RequireRole>
            }
          />
          <Route
            path="/customers"
            element={
              <RequireEmulator>
                <CustomersPage />
              </RequireEmulator>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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

import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary, LoadingFallback } from '@saloon/ui';
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
import { SchedulingPage } from './pages/scheduling/SchedulingPage';
import { ProfilePage } from './pages/ProfilePage';

// Mirrors the backend's AdminAccess/StaffAccess authorization policies (Program.cs) -- kept in
// sync by hand since the frontend has no way to read ASP.NET Core policy definitions directly.
const ADMIN_ACCESS: UserRole[] = ['SuperAdmin', 'Admin', 'Manager'];
const STAFF_ACCESS: UserRole[] = ['SuperAdmin', 'Admin', 'Manager', 'Therapist'];
// Chains are the tenant boundary -- create/activate/delete is Super Admin's alone. Mirrors the
// backend's ChainManagement policy (Program.cs).
const CHAIN_MANAGEMENT: UserRole[] = ['SuperAdmin'];
// Locations/Rooms are Admin's remit, not Manager's (head of one location, not a creator of them).
// Mirrors the backend's LocationManagement policy (Program.cs).
const LOCATION_MANAGEMENT: UserRole[] = ['SuperAdmin', 'Admin'];

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
  const canManageChains = CHAIN_MANAGEMENT.includes(user.role);
  const canManageLocations = LOCATION_MANAGEMENT.includes(user.role);

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3 dark:border-gray-800">
      <div className="flex items-center gap-5 text-sm">
        <span className="mr-2 font-semibold text-gray-900 dark:text-gray-100">Saloon Admin</span>
        <NavLink to="/">Dashboard</NavLink>
        {canManageChains && <NavLink to="/catalog/chains">Chains</NavLink>}
        {canManageLocations && <NavLink to="/catalog/locations">Locations</NavLink>}
        {canManageCatalog && <NavLink to="/catalog/treatments">Treatments</NavLink>}
        {canManageCatalog && <NavLink to="/staff/users">Staff</NavLink>}
        {canManageCatalog && <NavLink to="/staff/therapists">Therapists</NavLink>}
        {canManageLocations && <NavLink to="/staff/rooms">Rooms</NavLink>}
        {canManageCatalog && <NavLink to="/scheduling">Scheduling</NavLink>}
        <NavLink to="/bookings">Bookings</NavLink>
        {user.canEmulate && <NavLink to="/customers">Customers</NavLink>}
      </div>
      <div className="flex items-center gap-3 text-sm">
        <NavLink to="/profile">
          {user.name} &middot; {user.role}
        </NavLink>
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
              <RequireRole roles={CHAIN_MANAGEMENT}>
                <ChainsPage />
              </RequireRole>
            }
          />
          <Route
            path="/catalog/locations"
            element={
              <RequireRole roles={LOCATION_MANAGEMENT}>
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
              <RequireRole roles={LOCATION_MANAGEMENT}>
                <RoomsPage />
              </RequireRole>
            }
          />
          <Route
            path="/scheduling"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <SchedulingPage />
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
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
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
    <ErrorBoundary>
      <AuthProvider>
        <Suspense fallback={<LoadingFallback maxW="max-w-4xl" />}>
          <AppRoutes />
        </Suspense>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;

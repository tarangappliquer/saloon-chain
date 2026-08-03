import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Badge, ErrorBoundary, LoadingFallback } from '@saloon/ui';
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
    <header className="sticky top-0 z-40 border-b border-gray-200/80 bg-white/85 backdrop-blur-md dark:border-gray-800/80 dark:bg-gray-950/85">
      <nav aria-label="Admin Navigation" className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <div className="flex items-center gap-6 overflow-x-auto py-1 no-scrollbar">
          <Link to="/" className="flex items-center gap-2 font-bold text-gray-900 dark:text-gray-100 shrink-0">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-600 text-xs font-bold text-white shadow-md shadow-purple-600/30">
              A
            </span>
            <span className="tracking-tight text-base">Saloon Admin</span>
          </Link>
          <div className="flex items-center gap-1 text-sm font-medium shrink-0">
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
        </div>
        <div className="flex items-center gap-3 text-sm shrink-0 ml-4">
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 transition dark:text-gray-300 dark:hover:bg-gray-900"
          >
            <span className="font-semibold">{user.name}</span>
            <Badge status={user.role} />
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-2.5 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-200"
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

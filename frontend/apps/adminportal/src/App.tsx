import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Badge, BrandMark, ErrorBoundary, LoadingFallback, ThemeProvider, ThemeToggle } from '@saloon/ui';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import type { UserRole } from './api/types';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { LocationsPage } from './pages/catalog/LocationsPage';
import { TreatmentsPage } from './pages/catalog/TreatmentsPage';
import { StaffPage } from './pages/staff/StaffPage';
import { TherapistsPage } from './pages/staff/TherapistsPage';
import { RoomsPage } from './pages/staff/RoomsPage';
import { BookingsPage } from './pages/bookings/BookingsPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { SchedulingPage } from './pages/scheduling/SchedulingPage';
import { ProfilePage } from './pages/ProfilePage';

const ADMIN_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager'];
const STAFF_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];
const LOCATION_MANAGEMENT: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin'];

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

function RequireEmulator({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return user.canEmulate ? <>{children}</> : <Navigate to="/" replace />;
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
  const canManageCatalog = ADMIN_ACCESS.includes(user.role);
  const canManageLocations = LOCATION_MANAGEMENT.includes(user.role);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md">
      <nav aria-label="Admin Navigation" className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
        <div className="flex items-center gap-6 overflow-x-auto py-1 no-scrollbar">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <BrandMark label="Saloon Admin" />
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <NavLink to="/">Dashboard</NavLink>
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
        <div className="flex items-center gap-3 shrink-0 ml-4">
          <ThemeToggle />
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            <span className="font-semibold">{user.name}</span>
            <Badge status={user.role} />
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
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingFallback maxW="max-w-4xl" />}>
            <AppRoutes />
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

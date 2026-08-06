import { Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Badge, BrandMark, ConnectivityBanner, ErrorBoundary, LoadingFallback, ThemeProvider, ThemeToggle } from '@saloon/ui';
import { API_BASE } from './api/client';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { PortalConfigProvider } from './features/config/PortalConfigContext';
import type { UserRole } from './api/types';
import { LoginPage } from './pages/LoginPage';
import { ForgotPasswordPage } from './pages/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { DashboardPage } from './pages/DashboardPage';
import { SaloonsPage } from './pages/catalog/SaloonsPage';
import { SaloonUsersPage } from './pages/catalog/SaloonUsersPage';
import { LocationsPage } from './pages/catalog/LocationsPage';
import { MyLocationPage } from './pages/catalog/MyLocationPage';
import { LocationUsersPage } from './pages/catalog/LocationUsersPage';
import { TreatmentCategoriesPage } from './pages/catalog/TreatmentCategoriesPage';
import { TreatmentsPage } from './pages/catalog/TreatmentsPage';
import { TreatmentPricesPage } from './pages/catalog/TreatmentPricesPage';
import { StaffPage } from './pages/staff/StaffPage';
import { TherapistsPage } from './pages/staff/TherapistsPage';
import { RoomsPage } from './pages/staff/RoomsPage';
import { BookingsPage } from './pages/bookings/BookingsPage';
import { CustomersPage } from './pages/customers/CustomersPage';
import { SchedulingPage } from './pages/scheduling/SchedulingPage';
import { ProfilePage } from './pages/ProfilePage';

const ROOT_SUPER_ADMIN_ONLY: UserRole[] = ['RootSuperAdmin'];
const ADMIN_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager'];
const STAFF_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];
const LOCATION_MANAGEMENT: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin'];
const MANAGER_ONLY: UserRole[] = ['Manager'];

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
  // const canManageCatalog = ADMIN_ACCESS.includes(user.role);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md">
      <nav aria-label="Admin Navigation" className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
        <div className="flex items-center gap-6 overflow-x-auto py-1 no-scrollbar">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <BrandMark label="Saloon Admin" />
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <NavLink to="/">Dashboard</NavLink>
            {LOCATION_MANAGEMENT.includes(user.role) && <NavLink to="/catalog/saloons">Saloons</NavLink>}
            {user.role === 'Manager' && <NavLink to="/my-location">My Location</NavLink>}
            {/* {canManageCatalog && <NavLink to="/staff/therapists">Therapists</NavLink>} */}
            <NavLink to="/bookings">Bookings</NavLink>
            {ADMIN_ACCESS.includes(user.role) && <NavLink to="/customers">Customers</NavLink>}
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
      <ConnectivityBanner apiBase={API_BASE} />
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-6 min-h-[max(100%,calc(99vh-50px))]">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/catalog/saloons"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <SaloonsPage />
              </RequireRole>
            }
          />
          <Route
            path="/catalog/saloons/users"
            element={
              <RequireRole roles={ROOT_SUPER_ADMIN_ONLY}>
                <SaloonUsersPage />
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
            path="/catalog/locations/users"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <LocationUsersPage />
              </RequireRole>
            }
          />
          <Route
            path="/my-location"
            element={
              <RequireRole roles={MANAGER_ONLY}>
                <MyLocationPage />
              </RequireRole>
            }
          />
          <Route
            path="/catalog/treatment-categories"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <TreatmentCategoriesPage />
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
            path="/catalog/treatment-prices"
            element={
              <RequireRole roles={ADMIN_ACCESS}>
                <TreatmentPricesPage />
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
              <RequireRole roles={ADMIN_ACCESS}>
                <CustomersPage />
              </RequireRole>
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
          <Suspense fallback={<LoadingFallback maxW="max-w-4xl" message="Connecting to server…" />}>
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

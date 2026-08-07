import { lazy, memo, Suspense, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { Badge, BrandMark, ConnectivityBanner, ErrorBoundary, LoadingFallback, ThemeProvider, ThemeToggle } from '@saloon/ui';
import { API_BASE } from './api/client';
import { appConfig } from './config';
import { routes } from './routes';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { PortalConfigProvider, usePortalConfig } from './features/config/PortalConfigContext';
import { VerifyEmailGate } from './components/VerifyEmailGate';
import type { UserRole } from './api/types';

const LoginPage = lazy(() => import('./pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage').then((m) => ({ default: m.VerifyEmailPage })));
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage })));
const SaloonsPage = lazy(() => import('./pages/catalog/SaloonsPage').then((m) => ({ default: m.SaloonsPage })));
const SaloonUsersPage = lazy(() => import('./pages/catalog/SaloonUsersPage').then((m) => ({ default: m.SaloonUsersPage })));
const LocationsPage = lazy(() => import('./pages/catalog/LocationsPage').then((m) => ({ default: m.LocationsPage })));
const MyLocationPage = lazy(() => import('./pages/catalog/MyLocationPage').then((m) => ({ default: m.MyLocationPage })));
const LocationUsersPage = lazy(() => import('./pages/catalog/LocationUsersPage').then((m) => ({ default: m.LocationUsersPage })));
const TreatmentCategoriesPage = lazy(() => import('./pages/catalog/TreatmentCategoriesPage').then((m) => ({ default: m.TreatmentCategoriesPage })));
const TreatmentsPage = lazy(() => import('./pages/catalog/TreatmentsPage').then((m) => ({ default: m.TreatmentsPage })));
const TreatmentPricesPage = lazy(() => import('./pages/catalog/TreatmentPricesPage').then((m) => ({ default: m.TreatmentPricesPage })));
const StaffPage = lazy(() => import('./pages/staff/StaffPage').then((m) => ({ default: m.StaffPage })));
const TherapistsPage = lazy(() => import('./pages/staff/TherapistsPage').then((m) => ({ default: m.TherapistsPage })));
const RoomsPage = lazy(() => import('./pages/staff/RoomsPage').then((m) => ({ default: m.RoomsPage })));
const BookingsPage = lazy(() => import('./pages/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const SchedulingPage = lazy(() => import('./pages/scheduling/SchedulingPage').then((m) => ({ default: m.SchedulingPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));

const ROOT_SUPER_ADMIN_ONLY: UserRole[] = ['RootSuperAdmin'];
const ADMIN_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager'];
const STAFF_ACCESS: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager', 'Receptionist', 'Therapist', 'Other'];
const LOCATION_MANAGEMENT: UserRole[] = ['RootSuperAdmin', 'SuperAdmin', 'Admin'];
const MANAGER_ONLY: UserRole[] = ['Manager'];

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={routes.login} replace state={{ from: location }} />;
  if (!user.isEmailVerified) return <VerifyEmailGate />;
  return <>{children}</>;
}

function RequireRole({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={routes.login} replace />;
  if (!user.isEmailVerified) return <VerifyEmailGate />;
  return roles.includes(user.role) ? <>{children}</> : <Navigate to={routes.root} replace />;
}

const NavLink = memo(function NavLink({ to, children }: { to: string; children: ReactNode }) {
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
});

const Nav = memo(function Nav() {
  const { user, logout } = useAuth();
  if (!user) return null;

  const initials = user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-md">
      <nav aria-label="Admin Navigation" className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
        <div className="flex items-center gap-6 overflow-x-auto py-1 no-scrollbar">
          <Link to={routes.root} className="flex items-center gap-2 shrink-0">
            <BrandMark label="Saloon Admin" />
          </Link>
          <div className="flex items-center gap-1 shrink-0">
            <NavLink to={routes.root}>Dashboard</NavLink>
            {LOCATION_MANAGEMENT.includes(user.role) && <NavLink to={routes.catalog.saloons}>Saloons</NavLink>}
            {user.role === 'Manager' && <NavLink to={routes.myLocation}>My Location</NavLink>}
            <NavLink to={routes.bookings}>Bookings</NavLink>
            {ADMIN_ACCESS.includes(user.role) && <NavLink to={routes.customers}>Customers</NavLink>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-4">
          {appConfig.enableThemeToggle && <ThemeToggle />}
          <Link
            to={routes.profile}
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground transition hover:bg-accent"
          >
            {user.photoPath ? (
              <img
                src={`${API_BASE}${user.photoPath}?v=${user.photoVersion}`}
                alt={user.name}
                loading="lazy"
                decoding="async"
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                {initials}
              </span>
            )}
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
});

function AppRoutes() {
  const { refetch } = usePortalConfig();
  return (
    <>
      <ConnectivityBanner apiBase={API_BASE} onServerUp={refetch} />
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-6 min-h-[max(100%,calc(99vh-50px))]">
        <Suspense fallback={<LoadingFallback maxW="max-w-4xl" />}>
          <Routes>
            <Route path={routes.login} element={<LoginPage />} />
            <Route path={routes.forgotPassword} element={<ForgotPasswordPage />} />
            <Route path={routes.resetPassword} element={<ResetPasswordPage />} />
            <Route path={routes.verifyEmail} element={<VerifyEmailPage />} />
            <Route
              path={routes.root}
              element={
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              }
            />
            <Route
              path={routes.catalog.saloons}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <SaloonsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.catalog.saloonUsers()}
              element={
                <RequireRole roles={ROOT_SUPER_ADMIN_ONLY}>
                  <SaloonUsersPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.catalog.locations()}
              element={
                <RequireRole roles={LOCATION_MANAGEMENT}>
                  <LocationsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.catalog.locationUsers()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <LocationUsersPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.myLocation}
              element={
                <RequireRole roles={MANAGER_ONLY}>
                  <MyLocationPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.catalog.treatmentCategories}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <TreatmentCategoriesPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.catalog.treatments()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <TreatmentsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.catalog.treatmentPrices()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <TreatmentPricesPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.staff.users}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <StaffPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.staff.therapists}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <TherapistsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.staff.rooms()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <RoomsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.scheduling()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <SchedulingPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.bookings}
              element={
                <RequireRole roles={STAFF_ACCESS}>
                  <BookingsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.customers}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <CustomersPage />
                </RequireRole>
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
            <Route path="*" element={<Navigate to={routes.root} replace />} />
          </Routes>
        </Suspense>
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

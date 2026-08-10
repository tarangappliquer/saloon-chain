import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ConnectivityBanner, ErrorBoundary, LoadingFallback, ThemeProvider } from '@saloon/ui';
import { API_BASE } from './api/client';
import { routes } from './routes';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { PortalConfigProvider, usePortalConfig } from './features/config/PortalConfigContext';
import { VerifyEmailGate } from './components/VerifyEmailGate';
import { Nav } from './components/Nav';
import { ADMIN_ACCESS, LOCATION_MANAGEMENT, MANAGER_ONLY, POS_ACCESS, ROOT_SUPER_ADMIN_ONLY, STAFF_ACCESS } from './constants';
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
const TreatmentDurationsPage = lazy(() => import('./pages/catalog/TreatmentDurationsPage').then((m) => ({ default: m.TreatmentDurationsPage })));
const StaffPage = lazy(() => import('./pages/staff/StaffPage').then((m) => ({ default: m.StaffPage })));
const TherapistsPage = lazy(() => import('./pages/staff/TherapistsPage').then((m) => ({ default: m.TherapistsPage })));
const RoomsPage = lazy(() => import('./pages/staff/RoomsPage').then((m) => ({ default: m.RoomsPage })));
const BookingsPage = lazy(() => import('./pages/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const PosPage = lazy(() => import('./pages/pos/PosPage').then((m) => ({ default: m.PosPage })));
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const SchedulingPage = lazy(() => import('./pages/scheduling/SchedulingPage').then((m) => ({ default: m.SchedulingPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));

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

// Header only ever renders around routes that require a signed-in user -- login/forgot-password/
// reset-password/verify-email stay outside this layout so they never get a nav bar, even if the
// visitor happens to already hold a session (e.g. a verify-email link opened while logged in).
function AuthedLayout() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-6 min-h-[max(100%,calc(99vh-50px))]">
        <Outlet />
      </main>
    </>
  );
}

function AppRoutes() {
  const { refetch } = usePortalConfig();
  return (
    <>
      <ConnectivityBanner apiBase={API_BASE} onServerUp={refetch} />
      <Suspense fallback={<LoadingFallback maxW="max-w-4xl" />}>
        <Routes>
          <Route path={routes.login} element={<LoginPage />} />
          <Route path={routes.forgotPassword} element={<ForgotPasswordPage />} />
          <Route path={routes.resetPassword} element={<ResetPasswordPage />} />
          <Route path={routes.verifyEmail} element={<VerifyEmailPage />} />

          <Route element={<AuthedLayout />}>
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
              path={routes.catalog.treatmentDurations()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <TreatmentDurationsPage />
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
              path={routes.pos}
              element={
                <RequireRole roles={POS_ACCESS}>
                  <PosPage />
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
          </Route>
        </Routes>
      </Suspense>
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

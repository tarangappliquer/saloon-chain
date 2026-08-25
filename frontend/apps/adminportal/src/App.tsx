import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ConnectivityBanner, ErrorBoundary, LoadingFallback, ThemeProvider, TooltipProvider } from '@saloon/ui';
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
const TimesheetsPage = lazy(() => import('./pages/staff/TimesheetsPage').then((m) => ({ default: m.TimesheetsPage })));
const RoomsPage = lazy(() => import('./pages/staff/RoomsPage').then((m) => ({ default: m.RoomsPage })));
const BookingsPage = lazy(() => import('./pages/bookings/BookingsPage').then((m) => ({ default: m.BookingsPage })));
const CustomersPage = lazy(() => import('./pages/customers/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const ClientProfilePage = lazy(() => import('./pages/customers/ClientProfilePage').then((m) => ({ default: m.ClientProfilePage })));
const CalendarPage = lazy(() => import('./pages/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const InventoryPage = lazy(() => import('./pages/inventory/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const PayrollPage = lazy(() => import('./pages/payroll/PayrollPage').then((m) => ({ default: m.PayrollPage })));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const BlockTypesPage = lazy(() => import('./pages/settings/BlockTypesPage').then((m) => ({ default: m.BlockTypesPage })));
const AppointmentStatusesPage = lazy(() => import('./pages/settings/AppointmentStatusesPage').then((m) => ({ default: m.AppointmentStatusesPage })));
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
    <div className="flex h-screen overflow-hidden bg-background">
      <Nav />
      <main className="flex-1 min-w-0 h-screen overflow-y-auto px-4 py-6 md:px-8 md:py-8">
        <Outlet />
      </main>
    </div>
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
              path={routes.staff.timesheets}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <TimesheetsPage />
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
              path={routes.calendar()}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <CalendarPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.inventory}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <InventoryPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.staff.payroll}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <PayrollPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.reports}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <ReportsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.settings}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <SettingsPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.blockTypes}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <BlockTypesPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.appointmentStatuses}
              element={
                <RequireRole roles={ADMIN_ACCESS}>
                  <AppointmentStatusesPage />
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
                <RequireRole roles={POS_ACCESS}>
                  <CustomersPage />
                </RequireRole>
              }
            />
            <Route
              path={routes.customerProfile(':id')}
              element={
                <RequireRole roles={POS_ACCESS}>
                  <ClientProfilePage />
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
        <TooltipProvider delayDuration={300} skipDelayDuration={300}>
          <AuthProvider>
            <Suspense fallback={<LoadingFallback maxW="max-w-4xl" />}>
              <PortalConfigProvider>
                <AppRoutes />
              </PortalConfigProvider>
            </Suspense>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

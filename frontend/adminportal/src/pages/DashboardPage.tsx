import { useAuth } from '../features/auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Welcome, {user?.name}</h1>
      <p className="mt-2 text-gray-500">
        Signed in as <span className="font-medium">{user?.role}</span>. Use the nav above to manage the catalog,
        staff, or review bookings.
      </p>
    </div>
  );
}

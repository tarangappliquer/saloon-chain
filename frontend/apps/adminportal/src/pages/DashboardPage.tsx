import { Calendar, MapPin, Scissors, Users } from 'lucide-react';
import { Badge, Card, KpiTile, PageHeader } from '@saloon/ui';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name ?? 'Admin'}`}
        subtitle={`Signed in as ${user?.role}. Overview of salon performance and quick shortcuts.`}
        action={user ? <Badge status={user.role} /> : undefined}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="Total Bookings"
          value="128"
          change="+14%"
          changeType="positive"
          icon={<Calendar className="h-5 w-5" />}
          subtext="This month"
        />
        <KpiTile
          title="Active Locations"
          value="4"
          change="Operational"
          changeType="neutral"
          icon={<MapPin className="h-5 w-5" />}
          subtext="Across your chain"
        />
        <KpiTile
          title="Treatments"
          value="24"
          change="+2 new"
          changeType="positive"
          icon={<Scissors className="h-5 w-5" />}
          subtext="Catalog items"
        />
        <KpiTile
          title="Staff Members"
          value="18"
          change="Active"
          changeType="positive"
          icon={<Users className="h-5 w-5" />}
          subtext="Therapists & Admin"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card hoverable className="p-6">
          <h3 className="font-display text-lg font-semibold text-foreground">Quick Management</h3>
          <p className="mt-1 text-xs text-muted-foreground">Shortcuts to manage your daily salon operations.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/bookings"
              className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-accent transition"
            >
              Review Bookings
            </Link>
            <Link
              to="/scheduling"
              className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-accent transition"
            >
              Manage Scheduling
            </Link>
            <Link
              to="/catalog/treatments"
              className="inline-flex items-center rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground shadow-2xs hover:bg-accent transition"
            >
              Treatments Catalog
            </Link>
          </div>
        </Card>

        <Card hoverable className="p-6">
          <h3 className="font-display text-lg font-semibold text-foreground">System Status</h3>
          <p className="mt-1 text-xs text-muted-foreground">Connected to SaloonChains API backend.</p>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-medium text-foreground">API Services Online & Healthy</span>
          </div>
        </Card>
      </div>
    </div>
  );
}

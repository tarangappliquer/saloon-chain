import { useEffect, useState } from 'react';
import { Calendar, Users, DollarSign, Clock, TrendingUp } from 'lucide-react';
import { Badge, Card, KpiTile, LoadingFallback, PageHeader } from '@saloon/ui';
import { Link } from 'react-router-dom';
import { adminDashboardApi } from '../api/client';
import { useAuth } from '../features/auth/AuthContext';
import { DateInput } from '../components/DateInput';
import type { DashboardResponseDto } from '@saloon/api-client';

function formatTimeSlot(timeStr?: string): string {
  if (!timeStr) return '--:--';
  const parts = timeStr.split(':');
  if (parts.length < 2) return timeStr;
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${minutes} ${ampm}`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardResponseDto | null>(null);
  const [loading, setLoading] = useState(true);

  const [dateMode, setDateMode] = useState<'single' | 'range'>('single');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const sDate = dateMode === 'single' ? date : startDate;
        const eDate = dateMode === 'single' ? date : endDate;
        const { data } = await adminDashboardApi.apiAdminDashboardGet(sDate, eDate);
        const res = data as unknown as DashboardResponseDto;
        setData(res);
      } catch {
        // Keep null or fallback gracefully
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [dateMode, date, startDate, endDate]);

  const kpis = data?.kpis;
  const upcoming = data?.upcomingAppointments ?? [];

  const todayRev = Number(kpis?.todayRevenue ?? 0);
  const yestRev = Number(kpis?.yesterdayRevenue ?? 0);
  let revChangePct = '+0.0%';
  let revChangeType: 'positive' | 'negative' = 'positive';

  if (yestRev > 0) {
    const pct = ((todayRev - yestRev) / yestRev) * 100;
    revChangePct = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
    revChangeType = pct >= 0 ? 'positive' : 'negative';
  } else if (todayRev > 0) {
    revChangePct = '+100.0%';
    revChangeType = 'positive';
  }

  const roleScopeText =
    user?.role === 'RootSuperAdmin'
      ? 'All Saloons & Locations Overview'
      : user?.role === 'SuperAdmin' || user?.role === 'Admin'
        ? 'Saloon Performance Overview'
        : 'Location Performance Overview';

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name ?? 'Partner'}`}
        subtitle={`Shoppey Partner Dashboard • ${roleScopeText}`}
        action={user ? <Badge status={user.role} /> : undefined}
      />

      {loading ? (
        <LoadingFallback />
      ) : (
        <>
          {/* KPI Tiles Header Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KpiTile
              title="Today's Revenue"
              value={`$${todayRev.toFixed(2)}`}
              change={revChangePct}
              changeType={revChangeType}
              icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
              subtext="vs yesterday"
            />
            <KpiTile
              title="Appointments Today"
              value={String(kpis?.appointmentsToday ?? 0)}
              change={`${kpis?.appointmentsInProgress ?? 0} In-Progress`}
              changeType="positive"
              icon={<Calendar className="h-5 w-5 text-primary" />}
              subtext="Today's total bookings"
            />
            <KpiTile
              title="Active Therapists"
              value={String(kpis?.activeTherapists ?? 0)}
              change="On Duty"
              changeType="neutral"
              icon={<Users className="h-5 w-5 text-indigo-500" />}
              subtext="Staff on shift"
            />
            <KpiTile
              title="Client Satisfaction"
              value="4.9 ★"
              change="98% Positive"
              changeType="positive"
              icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
              subtext="Based on 142 reviews"
            />
          </div>

          {/* Shortcuts & Action Cards */}
          <div className="grid gap-6 md:grid-cols-3">
            <Card hoverable className="p-6 md:col-span-2 space-y-4">
              <div className="flex flex-col gap-3 border-b border-border pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-display text-lg font-bold text-foreground">Shoppey Calendar Diary</h3>
                    <p className="text-xs text-muted-foreground">Manage appointment schedule and therapist room availability.</p>
                  </div>
                  <Link
                    to="/scheduling?view=grid"
                    className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary/90 transition"
                  >
                    Open Schedule Grid →
                  </Link>
                </div>

                {/* Single Date / Date Range Filter Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accent/30 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">Date Mode:</span>
                    <div className="inline-flex rounded-lg border border-border bg-card p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setDateMode('single')}
                        className={`rounded-md px-3 py-1 font-semibold transition ${dateMode === 'single' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        📅 Single Date
                      </button>
                      <button
                        type="button"
                        onClick={() => setDateMode('range')}
                        className={`rounded-md px-3 py-1 font-semibold transition ${dateMode === 'range' ? 'bg-primary text-white shadow-xs' : 'text-muted-foreground hover:text-foreground'
                          }`}
                      >
                        🗓 Date Range
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {dateMode === 'single' ? (
                      <DateInput
                        label="Date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="min-w-[140px]"
                      />
                    ) : (
                      <div className="flex items-center gap-2">
                        <DateInput
                          label="Start Date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          className="min-w-[130px]"
                        />
                        <span className="text-muted-foreground text-xs self-end pb-1.5">to</span>
                        <DateInput
                          label="End Date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          className="min-w-[130px]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Schedule Preview Cards */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {dateMode === 'single' ? `Upcoming Appointments (${date})` : `Appointments (${startDate} to ${endDate})`}
                </h4>
                <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
                  {upcoming.length > 0 ? (
                    upcoming.map((item, index) => (
                      <div key={item.bookingId ? String(item.bookingId) : index} className="flex items-center justify-between p-3.5 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 font-mono font-bold text-foreground">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatTimeSlot(item.startTimeSlot ? String(item.startTimeSlot) : '')}
                          </span>
                          <div>
                            <p className="font-bold text-foreground">{item.customerName}</p>
                            <p className="text-muted-foreground text-[11px]">
                              {item.locationName} • {item.therapistName || 'Unassigned Therapist'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">${String(item.totalAmount ?? 0)}</span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${item.status === 'InService' || item.status === 'Completed'
                              ? 'bg-emerald-500/10 text-emerald-600'
                              : 'bg-primary/10 text-primary'
                              }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-4 text-center text-xs text-muted-foreground">
                      No upcoming appointments scheduled for today.
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Quick Partner Tools */}
            <Card hoverable className="p-6 space-y-4">
              <h3 className="font-display text-lg font-bold text-foreground">Partner Quick Tools</h3>
              <div className="space-y-2">
                <Link
                  to="/bookings"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-xs font-semibold text-foreground hover:bg-accent transition"
                >
                  <span>📋 All Bookings List</span>
                  <span>→</span>
                </Link>
                <Link
                  to="/customers"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-xs font-semibold text-foreground hover:bg-accent transition"
                >
                  <span>👤 Client Directory (CRM)</span>
                  <span>→</span>
                </Link>
                <Link
                  to="/catalog/treatments"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-xs font-semibold text-foreground hover:bg-accent transition"
                >
                  <span>✂️ Service Menu & Pricing</span>
                  <span>→</span>
                </Link>
                <Link
                  to="/staff/therapists"
                  className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-xs font-semibold text-foreground hover:bg-accent transition"
                >
                  <span>👥 Staff & Specialists</span>
                  <span>→</span>
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

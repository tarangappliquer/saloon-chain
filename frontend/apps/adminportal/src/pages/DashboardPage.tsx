import { Calendar, Users, DollarSign, Clock, TrendingUp } from 'lucide-react';
import { Badge, Card, KpiTile, PageHeader } from '@saloon/ui';
import { Link } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.name ?? 'Partner'}`}
        subtitle={`ShoppeyPartner Dashboard • Overview of today's salon performance, appointments, and shortcuts.`}
        action={user ? <Badge status={user.role} /> : undefined}
      />

      {/* KPI Tiles Header Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          title="Today's Revenue"
          value="$1,420.00"
          change="+18.5%"
          changeType="positive"
          icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
          subtext="vs yesterday"
        />
        <KpiTile
          title="Appointments Today"
          value="16"
          change="4 In-Progress"
          changeType="positive"
          icon={<Calendar className="h-5 w-5 text-primary" />}
          subtext="85% occupancy rate"
        />
        <KpiTile
          title="Active Therapists"
          value="6"
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
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-foreground">ShoppeyCalendar Diary</h3>
              <p className="text-xs text-muted-foreground">Manage today's appointment schedule and therapist rooms.</p>
            </div>
            <Link
              to="/scheduling?view=grid"
              className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-primary/90 transition"
            >
              Open Schedule Grid →
            </Link>
          </div>

          {/* Quick Schedule Preview Cards */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Upcoming Appointments Today</h4>
            <div className="divide-y divide-border/60 rounded-xl border border-border bg-card">
              {[
                { time: '10:00 AM', customer: 'Sarah Jenkins', service: 'Full Balayage & Hair Styling', therapist: 'Elena R.', status: 'In Service', statusColor: 'bg-emerald-500/10 text-emerald-600' },
                { time: '11:30 AM', customer: 'Michael Chang', service: 'Signature Men\'s Haircut', therapist: 'Marcus V.', status: 'Confirmed', statusColor: 'bg-primary/10 text-primary' },
                { time: '01:15 PM', customer: 'Jessica Alba', service: 'Deep Hydrating Glow Facial', therapist: 'Sophia C.', status: 'Confirmed', statusColor: 'bg-primary/10 text-primary' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3.5 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-mono font-bold text-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {item.time}
                    </span>
                    <div>
                      <p className="font-bold text-foreground">{item.customer}</p>
                      <p className="text-muted-foreground text-[11px]">{item.service} • {item.therapist}</p>
                    </div>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${item.statusColor}`}>
                    {item.status}
                  </span>
                </div>
              ))}
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
    </div>
  );
}

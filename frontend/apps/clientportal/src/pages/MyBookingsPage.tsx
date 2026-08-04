import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, LoadingFallback } from '@saloon/ui';
import { bookingApi } from '../api/client';
import type { MyBooking } from '../api/types';
import { useAuth } from '../features/auth/AuthContext';

type Tab = 'upcoming' | 'past' | 'draft';

function isPast(b: MyBooking, now: number): boolean {
  const ends = b.treatments.map((t) => t.endTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return ends.length > 0 && now > Math.max(...ends);
}

function earliestStart(b: MyBooking): number {
  const starts = b.treatments.map((t) => t.startTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return starts.length ? Math.min(...starts) : Infinity;
}

function latestEnd(b: MyBooking): number {
  const ends = b.treatments.map((t) => t.endTime).filter((s): s is string => !!s).map((s) => new Date(s).getTime());
  return ends.length ? Math.max(...ends) : -Infinity;
}

function BookingCard({ b }: { b: MyBooking }) {
  const [expanded, setExpanded] = useState(false);
  const totalCost = b.treatments.reduce((sum, t) => sum + (t.price || 0), 0);

  return (
    <Card hoverable className="p-6 transition-all duration-200">
      {/* Booking Header (from Bookings table) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-muted-foreground">Booking #{b.id}</span>
            <Badge status={b.status} />
          </div>
          <h2 className="font-display text-lg font-bold text-foreground mt-1">{b.locationName}</h2>
        </div>
        <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-0 border-border/50">
          <div className="text-left sm:text-right">
            <span className="text-xs text-muted-foreground block">Total Amount</span>
            <span className="font-mono text-lg font-bold text-primary">${totalCost.toFixed(2)}</span>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-accent/40 px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            <span>{expanded ? 'Hide Details' : `View Details (${b.treatments.length})`}</span>
            <svg
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Accordion Content (BookingTreatments extra info) */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border/70 space-y-3 animate-in fade-in slide-in-from-top-1 duration-150">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Treatment Details ({b.treatments.length})
          </h3>
          <ul className="space-y-2 text-sm text-foreground">
            {b.treatments.map((t, idx) => (
              <li key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border border-border/60 bg-accent/30 p-3 gap-2">
                <div className="space-y-1">
                  <span className="font-medium text-foreground">{t.treatmentName}</span>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>{t.slotCount * 5} mins</span>
                    {t.startTime ? (
                      <span>
                        {new Date(t.startTime).toLocaleString(undefined, {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                        {t.therapistName ? ` · ${t.therapistName}` : ''}
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Unscheduled</span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold text-foreground self-end sm:self-center">${t.price.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

export function MyBookingsPage() {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  useEffect(() => {
    bookingApi.apiBookingMineGet().then(({ data }) => setBookings(data as unknown as MyBooking[]));
  }, []);

  if (!bookings) return <LoadingFallback />;

  const isDev = import.meta.env.DEV;
  const now = Date.now();
  const drafts = bookings.filter((b) => b.status === 'Draft');
  const nonDrafts = bookings.filter((b) => b.status !== 'Draft');
  const upcoming = nonDrafts.filter((b) => !isPast(b, now)).sort((a, c) => earliestStart(a) - earliestStart(c));
  const past = nonDrafts.filter((b) => isPast(b, now)).sort((a, c) => latestEnd(c) - latestEnd(a));
  const shown = tab === 'draft' ? drafts : tab === 'upcoming' ? upcoming : past;

  const tabs: [Tab, string][] = [
    ['upcoming', `Upcoming (${upcoming.length})`],
    ['past', `Past (${past.length})`],
  ];
  if (isDev) {
    tabs.push(['draft', `Draft (${drafts.length})`]);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-6 backdrop-blur-xs">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Welcome back{user?.name ? `, ${user.name}` : ''}!
          </h1>
          {user?.email && (
            <p className="mt-1 text-xs text-muted-foreground">{user.email}</p>
          )}
        </div>
        <Link to="/book">
          <Button variant="primary" size="md">
            Book new appointment
          </Button>
        </Link>
      </div>

      <div className="flex gap-2 border-b border-border pb-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              tab === id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {shown.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">No {tab} bookings found.</p>
          </Card>
        ) : (
          shown.map((b) => <BookingCard key={b.id} b={b} />)
        )}
      </div>
    </div>
  );
}

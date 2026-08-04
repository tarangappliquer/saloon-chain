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
  return (
    <Card hoverable className="p-6">
      <div className="flex items-center justify-between">
        <span className="font-display font-semibold text-foreground text-base">{b.locationName}</span>
        <Badge status={b.status} />
      </div>
      <ul className="mt-3 space-y-2 text-sm text-foreground">
        {b.treatments.map((t) => (
          <li key={t.treatmentName} className="flex flex-col sm:flex-row sm:items-center justify-between border-t border-border/50 pt-2 first:border-0 first:pt-0">
            <div>
              <span className="font-medium text-foreground">{t.treatmentName}</span>
              {t.startTime && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(t.startTime).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  with {t.therapistName}
                </p>
              )}
            </div>
            <span className="font-mono text-xs font-semibold text-primary mt-1 sm:mt-0">${t.price.toFixed(2)}</span>
          </li>
        ))}
      </ul>
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

import { useEffect, useState } from 'react';
import { bookingApi } from '../api/client';
import type { MyBooking } from '../api/types';

type Tab = 'upcoming' | 'past';

// A booking has no single time of its own (each treatment is scheduled independently) -- a
// booking counts as "past" once every treatment has finished; still "upcoming" otherwise
// (covers not-yet-started and in-progress alike).
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
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900 dark:text-gray-100">{b.locationName}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            b.status === 'Confirmed'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          }`}
        >
          {b.status}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-gray-700 dark:text-gray-300">
        {b.treatments.map((t) => (
          <li key={t.treatmentName}>
            <span className="font-medium">{t.treatmentName}</span> — ${t.price.toFixed(2)}
            {t.startTime && (
              <span className="text-gray-500 dark:text-gray-400">
                {' · '}
                {new Date(t.startTime).toLocaleString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}{' '}
                with {t.therapistName}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);
  const [tab, setTab] = useState<Tab>('upcoming');

  useEffect(() => {
    bookingApi.apiBookingMineGet().then(({ data }) => setBookings(data as unknown as MyBooking[]));
  }, []);

  if (!bookings) return <p className="p-6 text-gray-500">Loading…</p>;
  if (bookings.length === 0) return <p className="p-6 text-gray-500">No bookings yet.</p>;

  const now = Date.now();
  const upcoming = bookings.filter((b) => !isPast(b, now)).sort((a, c) => earliestStart(a) - earliestStart(c));
  const past = bookings.filter((b) => isPast(b, now)).sort((a, c) => latestEnd(c) - latestEnd(a));
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My bookings</h1>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {(
          [
            ['upcoming', `Upcoming (${upcoming.length})`],
            ['past', `Past (${past.length})`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === id
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {shown.length === 0 ? (
          <p className="text-gray-500">No {tab} bookings.</p>
        ) : (
          shown.map((b) => <BookingCard key={b.id} b={b} />)
        )}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { bookingApi } from '../api/client';
import type { MyBooking } from '../api/types';

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);

  useEffect(() => {
    bookingApi.apiBookingMineGet().then(({ data }) => setBookings(data as unknown as MyBooking[]));
  }, []);

  if (!bookings) return <p className="p-6 text-gray-500">Loading…</p>;
  if (bookings.length === 0) return <p className="p-6 text-gray-500">No bookings yet.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">My bookings</h1>
      {bookings.map((b) => (
        <div key={b.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
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
      ))}
    </div>
  );
}

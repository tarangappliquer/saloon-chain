import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { MyBooking } from '../api/types';

export function MyBookingsPage() {
  const [bookings, setBookings] = useState<MyBooking[] | null>(null);

  useEffect(() => {
    api.get<MyBooking[]>('/api/booking/mine').then(setBookings);
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
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {new Date(b.startTime).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}{' '}
            · with {b.therapistName}
          </div>
          <ul className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            {b.treatments.map((t) => (
              <li key={t.treatmentName}>
                {t.treatmentName} — ${t.price.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

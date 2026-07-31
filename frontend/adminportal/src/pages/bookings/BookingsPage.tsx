import { useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, Chain, Location } from '../../api/types';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BookingsPage() {
  const { user } = useAuth();
  const canCancel = user?.role === 'SuperAdmin' || user?.role === 'Admin' || user?.role === 'Manager';

  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Chain[]>('/api/admin/catalog/chains').then((cs) => {
      setChains(cs);
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    api.get<Location[]>(`/api/admin/catalog/locations?chainId=${chainId}`).then((locs) => {
      setLocations(locs);
      setLocationId(locs.length > 0 ? locs[0].id : null);
    });
  }, [chainId]);

  async function loadBookings() {
    if (locationId === null) return;
    setLoading(true);
    setError(null);
    try {
      setBookings(await api.get<AdminBooking[]>(`/api/admin/bookings?locationId=${locationId}&date=${date}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, date]);

  async function handleCancel(id: number) {
    setError(null);
    try {
      await api.post(`/api/admin/bookings/${id}/cancel`);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel booking');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Bookings</h1>

      <div className="mb-4 flex flex-wrap gap-4 text-sm">
        <label>
          Chain{' '}
          <select
            value={chainId ?? ''}
            onChange={(e) => setChainId(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            {chains.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Location{' '}
          <select
            value={locationId ?? ''}
            onChange={(e) => setLocationId(Number(e.target.value))}
            className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Date{' '}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
      </div>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : bookings.length === 0 ? (
        <p className="text-gray-500">No bookings for this location/date.</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
              <th className="py-2">Time</th>
              <th className="py-2">Room</th>
              <th className="py-2">Therapist</th>
              <th className="py-2">Customer</th>
              <th className="py-2">Treatments</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-gray-100 align-top dark:border-gray-900">
                <td className="py-2">
                  {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}-
                  {new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2">{b.roomName}</td>
                <td className="py-2">{b.therapistName}</td>
                <td className="py-2">
                  {b.customerName}
                  <br />
                  <span className="text-xs text-gray-500">{b.customerEmail}</span>
                </td>
                <td className="py-2">{b.treatments.map((t) => t.treatmentName).join(', ')}</td>
                <td className="py-2">{b.status}</td>
                <td className="py-2 text-right">
                  {canCancel && (b.status === 'Held' || b.status === 'Confirmed') && (
                    <button type="button" onClick={() => handleCancel(b.id)} className="text-red-600 hover:underline">
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

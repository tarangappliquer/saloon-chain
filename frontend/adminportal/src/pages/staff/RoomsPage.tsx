import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Chain, Location, Room } from '../../api/types';

export function RoomsPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<Chain[]>('/api/admin/catalog/chains')
      .then((cs) => {
        setChains(cs);
        if (cs.length > 0) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, []);

  useEffect(() => {
    if (chainId === null) return;
    api
      .get<Location[]>(`/api/admin/catalog/locations?chainId=${chainId}`)
      .then((locs) => {
        setLocations(locs);
        setLocationId(locs.length > 0 ? locs[0].id : null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId]);

  async function loadRooms(id: number) {
    setLoading(true);
    setError(null);
    try {
      setRooms(await api.get<Room[]>(`/api/admin/catalog/rooms?locationId=${id}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (locationId !== null) loadRooms(locationId);
    else setRooms([]);
  }, [locationId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (locationId === null) return;
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/catalog/rooms', { locationId, name });
      setName('');
      await loadRooms(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create room');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(r: Room) {
    setError(null);
    try {
      await api.put(`/api/admin/catalog/rooms/${r.id}`, { name: r.name, isActive: !r.isActive });
      if (locationId !== null) await loadRooms(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update room');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Rooms</h1>

      <div className="mb-4 flex gap-4 text-sm">
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
      </div>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          required
          placeholder="Room name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Add room
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
              <th className="py-2">Name</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rooms.map((r) => (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2">{r.name}</td>
                <td className="py-2">{r.isActive ? 'Active' : 'Inactive'}</td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleActive(r)} className="text-purple-600 hover:underline">
                    {r.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

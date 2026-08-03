import { useEffect, useState, type FormEvent } from 'react';
import { adminCatalogApi, ApiError } from '../../api/client';
import type { Chain, Location } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

const DAY_BITS: { bit: number; label: string }[] = [
  { bit: 1, label: 'Mon' },
  { bit: 2, label: 'Tue' },
  { bit: 4, label: 'Wed' },
  { bit: 8, label: 'Thu' },
  { bit: 16, label: 'Fri' },
  { bit: 32, label: 'Sat' },
  { bit: 64, label: 'Sun' },
];

function emptyForm() {
  return {
    name: '',
    address: '',
    openTime: '09:00',
    closeTime: '18:00',
    timeZoneId: 'UTC',
    days: new Set(DAY_BITS.map((d) => d.bit)), // default: open every day
  };
}

export function LocationsPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as Chain[];
        setChains(cs);
        if (cs.length > 0) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, []);

  async function loadLocations(id: number) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogLocationsGet(id);
      setLocations(data as unknown as Location[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load locations');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (chainId !== null) loadLocations(chainId);
  }, [chainId]);

  function toggleDay(bit: number) {
    setForm((f) => {
      const days = new Set(f.days);
      if (days.has(bit)) days.delete(bit);
      else days.add(bit);
      return { ...f, days };
    });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (chainId === null) return;
    setError(null);
    setSubmitting(true);
    try {
      const workingDaysMask = [...form.days].reduce((mask, bit) => mask | bit, 0);
      await adminCatalogApi.apiAdminCatalogLocationsPost({
        chainId,
        name: form.name,
        address: form.address || null,
        openTime: form.openTime,
        closeTime: form.closeTime,
        workingDaysMask,
        timeZoneId: form.timeZoneId,
      });
      setForm(emptyForm());
      await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create location');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(loc: Location) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogLocationsIdPut(loc.id, {
        name: loc.name,
        address: loc.address,
        openTime: loc.openTime,
        closeTime: loc.closeTime,
        workingDaysMask: loc.workingDaysMask,
        timeZoneId: loc.timeZoneId,
        isActive: !loc.isActive,
      });
      if (chainId !== null) await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update location');
    }
  }

  async function handleDelete(loc: Location) {
    if (!window.confirm(`Delete "${loc.name}"? This cannot be undone from the UI.`)) return;
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogLocationsIdDelete(loc.id);
      if (chainId !== null) await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete location');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Locations</h1>

      <label className="mb-4 block text-sm">
        Chain{' '}
        <SearchableSelect
          value={String(chainId ?? '')}
          onChange={(v) => setChainId(Number(v))}
          options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
          className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      <form onSubmit={handleCreate} className="mb-6 space-y-2 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex flex-wrap gap-2">
          <input
            required
            placeholder="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            placeholder="Address"
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            type="time"
            value={form.openTime}
            onChange={(e) => setForm({ ...form, openTime: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            type="time"
            value={form.closeTime}
            onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            placeholder="Time zone (e.g. UTC)"
            value={form.timeZoneId}
            onChange={(e) => setForm({ ...form, timeZoneId: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        </div>
        <div className="flex gap-3 text-sm">
          {DAY_BITS.map((d) => (
            <label key={d.bit} className="flex items-center gap-1">
              <input type="checkbox" checked={form.days.has(d.bit)} onChange={() => toggleDay(d.bit)} />
              {d.label}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Add location
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
              <th className="py-2">Address</th>
              <th className="py-2">Hours</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {locations.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2">{l.name}</td>
                <td className="py-2">{l.address ?? '-'}</td>
                <td className="py-2">
                  {l.openTime}-{l.closeTime} ({l.timeZoneId})
                </td>
                <td className="py-2">{l.isActive === false ? 'Inactive' : 'Active'}</td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleActive(l)} className="mr-3 text-purple-600 hover:underline">
                    {l.isActive === false ? 'Activate' : 'Deactivate'}
                  </button>
                  <button type="button" onClick={() => handleDelete(l)} className="text-red-600 hover:underline">
                    Delete
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

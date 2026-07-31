import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../api/client';
import type { Therapist } from '../../api/types';

export function TherapistsPage() {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setTherapists(await api.get<Therapist[]>('/api/admin/catalog/therapists'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load therapists');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.post('/api/admin/catalog/therapists', { name });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create therapist');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(t: Therapist) {
    setError(null);
    try {
      await api.put(`/api/admin/catalog/therapists/${t.id}`, { name: t.name, isActive: !t.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update therapist');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Therapists</h1>
      <p className="mb-4 text-sm text-gray-500">
        Shift scheduling (which therapist works which room/date) isn't managed here yet -- this only covers the
        therapist roster itself.
      </p>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          required
          placeholder="Therapist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Add therapist
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
            {therapists.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2">{t.name}</td>
                <td className="py-2">{t.isActive ? 'Active' : 'Inactive'}</td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleActive(t)} className="text-purple-600 hover:underline">
                    {t.isActive ? 'Deactivate' : 'Activate'}
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

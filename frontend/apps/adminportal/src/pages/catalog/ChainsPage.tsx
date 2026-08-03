import { useEffect, useState, type FormEvent } from 'react';
import { Badge } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../../api/client';
import type { Chain } from '../../api/types';

export function ChainsPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogChainsGet();
      setChains(data as unknown as Chain[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load chains');
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
      await adminCatalogApi.apiAdminCatalogChainsPost({ name });
      setName('');
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create chain');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(chain: Chain) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogChainsIdPut(chain.id, { name: chain.name, isActive: !chain.isActive });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update chain');
    }
  }

  async function handleDelete(chain: Chain) {
    if (!window.confirm(`Delete "${chain.name}"? This cannot be undone from the UI.`)) return;
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogChainsIdDelete(chain.id);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete chain');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Chains</h1>

      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          required
          placeholder="New chain name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
        >
          Add chain
        </button>
      </form>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
              <th className="py-2">Id</th>
              <th className="py-2">Name</th>
              <th className="py-2">Status</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {chains.map((c) => (
              <tr key={c.id} className="border-b border-gray-100 dark:border-gray-900">
                <td className="py-2">{c.id}</td>
                <td className="py-2">{c.name}</td>
                <td className="py-2">
                  <Badge status={c.isActive === false ? 'Inactive' : 'Active'} />
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleActive(c)} className="mr-3 text-purple-600 hover:underline">
                    {c.isActive === false ? 'Activate' : 'Deactivate'}
                  </button>
                  <button type="button" onClick={() => handleDelete(c)} className="text-red-600 hover:underline">
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

import { useEffect, useState, type FormEvent } from 'react';
import { adminCatalogApi, ApiError } from '../../api/client';
import type { Chain, Location, Treatment, TreatmentCategory } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

export function TreatmentsPage() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingTreatment, setCreatingTreatment] = useState(false);

  const [categoryName, setCategoryName] = useState('');
  const [treatmentForm, setTreatmentForm] = useState({ categoryId: '', name: '', price: '', durationSlots: '' });
  const [assign, setAssign] = useState<Record<number, { locationId: string; priceOverride: string }>>({});

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

  async function loadChainData(id: number) {
    setLoading(true);
    setError(null);
    try {
      const [cats, treats, locs] = await Promise.all([
        adminCatalogApi.apiAdminCatalogTreatmentCategoriesGet(id),
        adminCatalogApi.apiAdminCatalogTreatmentsGet(id),
        adminCatalogApi.apiAdminCatalogLocationsGet(id),
      ]);
      setCategories(cats.data as unknown as TreatmentCategory[]);
      setTreatments(treats.data as unknown as Treatment[]);
      setLocations(locs.data as unknown as Location[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load treatments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (chainId !== null) loadChainData(chainId);
  }, [chainId]);

  async function handleCreateCategory(e: FormEvent) {
    e.preventDefault();
    if (chainId === null) return;
    setError(null);
    setCreatingCategory(true);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentCategoriesPost({ chainId, name: categoryName });
      setCategoryName('');
      await loadChainData(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create category');
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleCreateTreatment(e: FormEvent) {
    e.preventDefault();
    if (chainId === null || !treatmentForm.categoryId) return;
    setError(null);
    setCreatingTreatment(true);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsPost({
        chainId,
        categoryId: Number(treatmentForm.categoryId),
        name: treatmentForm.name,
        price: Number(treatmentForm.price),
        durationSlots: Number(treatmentForm.durationSlots),
      });
      setTreatmentForm({ categoryId: '', name: '', price: '', durationSlots: '' });
      await loadChainData(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create treatment');
    } finally {
      setCreatingTreatment(false);
    }
  }

  async function toggleActive(t: Treatment) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdPut(t.id, {
        categoryId: t.categoryId,
        name: t.name,
        price: t.price,
        durationSlots: t.durationSlots,
        isActive: !t.isActive,
      });
      if (chainId !== null) await loadChainData(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update treatment');
    }
  }

  async function handleAssign(treatmentId: number) {
    const a = assign[treatmentId];
    if (!a?.locationId) return;
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdAssignPost(treatmentId, {
        locationId: Number(a.locationId),
        priceOverride: a.priceOverride ? Number(a.priceOverride) : null,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign treatment to location');
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-gray-100">Treatments</h1>

      <label className="mb-4 block text-sm">
        Chain{' '}
        <SearchableSelect
          value={String(chainId ?? '')}
          onChange={(v) => setChainId(Number(v))}
          options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
          className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
        />
      </label>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">Categories</h2>
        <form onSubmit={handleCreateCategory} className="mb-3 flex gap-2">
          <input
            required
            placeholder="New category name"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="submit"
            disabled={creatingCategory}
            className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            Add category
          </button>
        </form>
        <div className="flex flex-wrap gap-2 text-sm">
          {categories.map((c) => (
            <span key={c.id} className="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-800">
              {c.name}
            </span>
          ))}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-medium text-gray-900 dark:text-gray-100">New treatment</h2>
        <form onSubmit={handleCreateTreatment} className="flex flex-wrap gap-2">
          <SearchableSelect
            value={treatmentForm.categoryId}
            onChange={(v) => setTreatmentForm({ ...treatmentForm, categoryId: v })}
            placeholder="Category"
            options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
            className="rounded-lg border border-gray-300 px-2 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            placeholder="Name"
            value={treatmentForm.name}
            onChange={(e) => setTreatmentForm({ ...treatmentForm, name: e.target.value })}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            type="number"
            step="0.01"
            placeholder="Price"
            value={treatmentForm.price}
            onChange={(e) => setTreatmentForm({ ...treatmentForm, price: e.target.value })}
            className="w-28 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <input
            required
            type="number"
            placeholder="Duration (5-min slots)"
            value={treatmentForm.durationSlots}
            onChange={(e) => setTreatmentForm({ ...treatmentForm, durationSlots: e.target.value })}
            className="w-44 rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="submit"
            disabled={creatingTreatment}
            className="rounded-lg bg-purple-600 px-4 py-2 font-medium text-white disabled:opacity-40"
          >
            Add treatment
          </button>
        </form>
      </section>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : (
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 dark:border-gray-800">
              <th className="py-2">Category</th>
              <th className="py-2">Name</th>
              <th className="py-2">Price</th>
              <th className="py-2">Duration</th>
              <th className="py-2">Status</th>
              <th className="py-2">Assign to location</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {treatments.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 align-top dark:border-gray-900">
                <td className="py-2">{t.categoryName}</td>
                <td className="py-2">{t.name}</td>
                <td className="py-2">{t.price.toFixed(2)}</td>
                <td className="py-2">{t.durationSlots * 5} min</td>
                <td className="py-2">{t.isActive === false ? 'Inactive' : 'Active'}</td>
                <td className="py-2">
                  <div className="flex gap-1">
                    <SearchableSelect
                      value={assign[t.id]?.locationId ?? ''}
                      onChange={(v) =>
                        setAssign({ ...assign, [t.id]: { locationId: v, priceOverride: assign[t.id]?.priceOverride ?? '' } })
                      }
                      placeholder="Location..."
                      options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                      className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <input
                      placeholder="Price override"
                      value={assign[t.id]?.priceOverride ?? ''}
                      onChange={(e) =>
                        setAssign({ ...assign, [t.id]: { locationId: assign[t.id]?.locationId ?? '', priceOverride: e.target.value } })
                      }
                      className="w-28 rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-700 dark:bg-gray-900"
                    />
                    <button type="button" onClick={() => handleAssign(t.id)} className="text-purple-600 hover:underline">
                      Assign
                    </button>
                  </div>
                </td>
                <td className="py-2 text-right">
                  <button type="button" onClick={() => toggleActive(t)} className="text-purple-600 hover:underline">
                    {t.isActive === false ? 'Activate' : 'Deactivate'}
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

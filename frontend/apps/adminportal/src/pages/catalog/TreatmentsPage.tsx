import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../../api/client';
import type { Location, Treatment, TreatmentCategory } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

export function TreatmentsPage() {
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
        const cs = data as unknown as { id: number }[];
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
    <div className="space-y-6">
      <PageHeader title="Treatments Catalog" description="Manage treatment categories, catalog items, pricing, and location assignments." />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>Treatment Categories</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <form onSubmit={handleCreateCategory} className="flex gap-2">
              <Input
                required
                placeholder="Category Name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
              />
              <Button type="submit" disabled={creatingCategory} size="md" className="shrink-0">
                {creatingCategory ? 'Adding...' : 'Add Category'}
              </Button>
            </form>
            <div className="flex flex-wrap gap-2 pt-2">
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No categories yet.</p>
              ) : (
                categories.map((c) => (
                  <Badge key={c.id} variant="secondary" showDot={false} className="px-3 py-1 text-xs">
                    {c.name}
                  </Badge>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>Add New Treatment</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleCreateTreatment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Category
                </label>
                <SearchableSelect
                  value={treatmentForm.categoryId}
                  onChange={(v) => setTreatmentForm({ ...treatmentForm, categoryId: v })}
                  placeholder="Select Category..."
                  options={categories.map((c) => ({ value: String(c.id), label: c.name }))}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                />
              </div>
              <Input
                required
                label="Treatment Name"
                placeholder="Haircut & Styling"
                value={treatmentForm.name}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, name: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  required
                  type="number"
                  step="0.01"
                  label="Price ($)"
                  placeholder="45.00"
                  value={treatmentForm.price}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, price: e.target.value })}
                />
                <Input
                  required
                  type="number"
                  label="Duration (5-min slots)"
                  placeholder="6 (30 mins)"
                  value={treatmentForm.durationSlots}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, durationSlots: e.target.value })}
                />
              </div>
              <div className="pt-2">
                <Button type="submit" disabled={creatingTreatment} className="w-full">
                  {creatingTreatment ? 'Creating...' : 'Create Treatment'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Catalog Items ({treatments.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : treatments.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No treatments in catalog yet.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Treatment</th>
                  <th className="px-6 py-3.5">Base Price</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Assign to Location</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {treatments.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 text-muted-foreground">{t.categoryName}</td>
                    <td className="px-6 py-4 font-semibold text-foreground">{t.name}</td>
                    <td className="px-6 py-4 font-mono font-semibold text-primary">${t.price.toFixed(2)}</td>
                    <td className="px-6 py-4 text-muted-foreground">{t.durationSlots * 5} mins</td>
                    <td className="px-6 py-4">
                      <Badge status={t.isActive === false ? 'Inactive' : 'Active'} />
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <SearchableSelect
                          value={assign[t.id]?.locationId ?? ''}
                          onChange={(v) =>
                            setAssign({ ...assign, [t.id]: { locationId: v, priceOverride: assign[t.id]?.priceOverride ?? '' } })
                          }
                          placeholder="Select location..."
                          options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                          className="rounded-lg border border-input bg-card px-2.5 py-1 text-xs text-foreground"
                        />
                        <Input
                          placeholder="Price override"
                          value={assign[t.id]?.priceOverride ?? ''}
                          onChange={(e) =>
                            setAssign({ ...assign, [t.id]: { locationId: assign[t.id]?.locationId ?? '', priceOverride: e.target.value } })
                          }
                          className="w-28 h-8 text-xs"
                        />
                        <Button variant="outline" size="sm" onClick={() => handleAssign(t.id)}>
                          Assign
                        </Button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(t)}>
                        {t.isActive === false ? 'Activate' : 'Deactivate'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

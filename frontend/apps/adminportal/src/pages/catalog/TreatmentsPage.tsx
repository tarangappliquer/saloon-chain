import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, Treatment, TreatmentCategory } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

function emptyTreatmentForm() {
  return { categoryId: '', name: '', price: '', durationSlots: '' };
}

export function TreatmentsPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');

  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(paramLocationId ? Number(paramLocationId) : null);
  const [categories, setCategories] = useState<TreatmentCategory[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingTreatment, setSavingTreatment] = useState(false);

  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<TreatmentCategory | null>(null);
  const [categorySubmitError, setCategorySubmitError] = useState<unknown>(null);

  const [treatmentForm, setTreatmentForm] = useState(emptyTreatmentForm());
  const [editingTreatment, setEditingTreatment] = useState<Treatment | null>(null);
  const [treatmentSubmitError, setTreatmentSubmitError] = useState<unknown>(null);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as Chain[];
        setChains(cs);
        if (cs.length > 0 && chainId === null) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, [chainId]);

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi
      .apiAdminCatalogLocationsGet(chainId)
      .then(({ data }) => {
        const locs = data as unknown as Location[];
        setLocations(locs);
        if (paramLocationId) {
          setLocationId(Number(paramLocationId));
        } else if (locs.length > 0 && locationId === null) {
          setLocationId(locs[0].id);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId, locationId, paramLocationId]);

  const loadLocationData = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const [cats, treats] = await Promise.all([
        adminCatalogApi.apiAdminCatalogTreatmentCategoriesGet(id),
        adminCatalogApi.apiAdminCatalogTreatmentsGet(id),
      ]);
      setCategories(cats.data as unknown as TreatmentCategory[]);
      setTreatments(treats.data as unknown as Treatment[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load treatments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationId !== null) loadLocationData(locationId);
  }, [locationId, loadLocationData]);

  function handleLocationChange(v: string) {
    const id = Number(v);
    setLocationId(id);
    const next = new URLSearchParams(searchParams);
    next.set('locationId', String(id));
    if (chainId !== null) next.set('chainId', String(chainId));
    setSearchParams(next, { replace: true });
  }

  function handleStartEditCategory(c: TreatmentCategory) {
    setEditingCategory(c);
    setCategoryName(c.name);
    setError(null);
    setCategorySubmitError(null);
  }

  function handleCancelCategoryEdit() {
    setEditingCategory(null);
    setCategoryName('');
    setError(null);
    setCategorySubmitError(null);
  }

  async function handleSubmitCategory(e: FormEvent) {
    e.preventDefault();
    if (locationId === null) return;
    setError(null);
    setCategorySubmitError(null);
    setSavingCategory(true);
    try {
      if (editingCategory) {
        await adminCatalogApi.apiAdminCatalogTreatmentCategoriesIdPut(editingCategory.id, {
          name: categoryName,
          isActive: editingCategory.isActive !== false,
        });
        setEditingCategory(null);
      } else {
        await adminCatalogApi.apiAdminCatalogTreatmentCategoriesPost({ locationId, name: categoryName });
      }
      setCategoryName('');
      await loadLocationData(locationId);
    } catch (err) {
      setCategorySubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingCategory ? 'update' : 'create'} category`);
    } finally {
      setSavingCategory(false);
    }
  }

  async function toggleCategoryActive(c: TreatmentCategory) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentCategoriesIdPut(c.id, { name: c.name, isActive: !c.isActive });
      if (locationId !== null) await loadLocationData(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update category');
    }
  }

  function handleStartEditTreatment(t: Treatment) {
    setEditingTreatment(t);
    setTreatmentForm({
      categoryId: String(t.categoryId),
      name: t.name,
      price: String(t.price),
      durationSlots: String(t.durationSlots),
    });
    setError(null);
    setTreatmentSubmitError(null);
  }

  function handleCancelTreatmentEdit() {
    setEditingTreatment(null);
    setTreatmentForm(emptyTreatmentForm());
    setError(null);
    setTreatmentSubmitError(null);
  }

  async function handleSubmitTreatment(e: FormEvent) {
    e.preventDefault();
    if (locationId === null || !treatmentForm.categoryId) return;
    setError(null);
    setTreatmentSubmitError(null);
    setSavingTreatment(true);
    try {
      if (editingTreatment) {
        await adminCatalogApi.apiAdminCatalogTreatmentsIdPut(editingTreatment.id, {
          categoryId: Number(treatmentForm.categoryId),
          name: treatmentForm.name,
          price: Number(treatmentForm.price),
          durationSlots: Number(treatmentForm.durationSlots),
          isActive: editingTreatment.isActive !== false,
        });
        setEditingTreatment(null);
      } else {
        await adminCatalogApi.apiAdminCatalogTreatmentsPost({
          locationId,
          categoryId: Number(treatmentForm.categoryId),
          name: treatmentForm.name,
          price: Number(treatmentForm.price),
          durationSlots: Number(treatmentForm.durationSlots),
        });
      }
      setTreatmentForm(emptyTreatmentForm());
      await loadLocationData(locationId);
    } catch (err) {
      setTreatmentSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingTreatment ? 'update' : 'create'} treatment`);
    } finally {
      setSavingTreatment(false);
    }
  }

  async function toggleTreatmentActive(t: Treatment) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdPut(t.id, {
        categoryId: t.categoryId,
        name: t.name,
        price: t.price,
        durationSlots: t.durationSlots,
        isActive: !t.isActive,
      });
      if (locationId !== null) await loadLocationData(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update treatment');
    }
  }

  const selectedChain = chains.find((c) => c.id === chainId);
  const activeCategoryOptions = categories.filter((c) => c.isActive !== false);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatments Catalog"
        description="Manage this location's treatment categories, catalog items, and pricing."
        action={
          <div className="flex flex-wrap items-center gap-3">
            {paramLocationId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(
                    currentUser?.role === 'Manager' ? '/my-location' : chainId ? `/catalog/locations?chainId=${chainId}` : '/catalog/saloons',
                  )
                }
              >
                ← Back
              </Button>
            )}
            {chainId !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Saloon:</span>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground min-w-[160px]">
                  {selectedChain?.name ?? `Saloon #${chainId}`}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Location:</span>
              <SearchableSelect
                value={String(locationId ?? '')}
                onChange={handleLocationChange}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                disabled={currentUser?.role === 'Manager'}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]"
              />
            </div>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>{editingCategory ? `Edit Category: ${editingCategory.name}` : 'Treatment Categories'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <form onSubmit={handleSubmitCategory} className="flex gap-2">
              <Input
                required
                placeholder="Category Name"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                error={getFieldError(categorySubmitError, 'name')}
              />
              <Button type="submit" disabled={savingCategory} size="md" className="shrink-0">
                {savingCategory ? 'Saving...' : editingCategory ? 'Update' : 'Add Category'}
              </Button>
              {editingCategory && (
                <Button type="button" variant="outline" size="md" className="shrink-0" onClick={handleCancelCategoryEdit} disabled={savingCategory}>
                  Cancel
                </Button>
              )}
            </form>
            <div className="pt-2">
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No categories yet.</p>
              ) : (
                <ul className="divide-y divide-border/50 text-xs">
                  {categories.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{c.name}</span>
                        <Badge status={c.isActive === false ? 'Inactive' : 'Active'} className="text-[10px] py-0 px-1.5" />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleStartEditCategory(c)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleCategoryActive(c)}>
                          {c.isActive === false ? 'Activate' : 'Deactivate'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle>{editingTreatment ? `Edit Treatment: ${editingTreatment.name}` : 'Add New Treatment'}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmitTreatment} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Category
                </label>
                <SearchableSelect
                  value={treatmentForm.categoryId}
                  onChange={(v) => setTreatmentForm({ ...treatmentForm, categoryId: v })}
                  placeholder="Select Category..."
                  options={activeCategoryOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                />
              </div>
              <Input
                required
                label="Treatment Name"
                placeholder="Haircut & Styling"
                value={treatmentForm.name}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, name: e.target.value })}
                error={getFieldError(treatmentSubmitError, 'name')}
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
                  error={getFieldError(treatmentSubmitError, 'price')}
                />
                <Input
                  required
                  type="number"
                  label="Duration (5-min slots)"
                  placeholder="6 (30 mins)"
                  value={treatmentForm.durationSlots}
                  onChange={(e) => setTreatmentForm({ ...treatmentForm, durationSlots: e.target.value })}
                  error={getFieldError(treatmentSubmitError, 'durationSlots')}
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button type="submit" disabled={savingTreatment} className="flex-1">
                  {savingTreatment ? 'Saving...' : editingTreatment ? 'Update Treatment' : 'Create Treatment'}
                </Button>
                {editingTreatment && (
                  <Button type="button" variant="outline" onClick={handleCancelTreatmentEdit} disabled={savingTreatment}>
                    Cancel
                  </Button>
                )}
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
                  <th className="px-6 py-3.5">Price</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Status</th>
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
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => handleStartEditTreatment(t)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleTreatmentActive(t)}>
                          {t.isActive === false ? 'Activate' : 'Deactivate'}
                        </Button>
                      </div>
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

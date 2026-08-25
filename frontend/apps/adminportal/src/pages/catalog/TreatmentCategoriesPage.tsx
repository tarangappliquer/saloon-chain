import { useEffect, useState, useCallback, useOptimistic, startTransition, type SyntheticEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, TreatmentCategory } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { TreatmentCatalogTabs } from '../../components/TreatmentCatalogTabs';
import { routes } from '../../routes';

export function TreatmentCategoriesPage() {
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
  const [optimisticCategories, setOptimisticCategories] = useOptimistic(
    categories,
    (state, id: number) => state.map((c) => (c.id === id ? { ...c, isActive: !c.isActive } : c)),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [categoryName, setCategoryName] = useState('');
  const [editingCategory, setEditingCategory] = useState<TreatmentCategory | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

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

  const loadCategories = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogTreatmentCategoriesGet(id);
      setCategories(data as unknown as TreatmentCategory[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationId !== null) loadCategories(locationId);
  }, [locationId, loadCategories]);

  function handleLocationChange(v: string) {
    const id = Number(v);
    setLocationId(id);
    const next = new URLSearchParams(searchParams);
    next.set('locationId', String(id));
    if (chainId !== null) next.set('chainId', String(chainId));
    setSearchParams(next, { replace: true });
  }

  function handleStartEdit(c: TreatmentCategory) {
    setEditingCategory(c);
    setCategoryName(c.name);
    setError(null);
    setSubmitError(null);
  }

  function handleCancelEdit() {
    setEditingCategory(null);
    setCategoryName('');
    setError(null);
    setSubmitError(null);
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (locationId === null) return;
    setError(null);
    setSubmitError(null);
    setSaving(true);
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
      await loadCategories(locationId);
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingCategory ? 'update' : 'create'} category`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: TreatmentCategory) {
    setError(null);
    startTransition(() => {
      setOptimisticCategories(c.id);
    });
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentCategoriesIdPut(c.id, { name: c.name, isActive: !c.isActive });
      if (locationId !== null) await loadCategories(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update category');
      if (locationId !== null) await loadCategories(locationId);
    }
  }

  const selectedChain = chains.find((c) => c.id === chainId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Categories"
        description="Manage this location's treatment categories."
        action={
          <div className="flex flex-wrap items-center gap-3">
            {paramLocationId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  navigate(routes.catalogBack(currentUser?.role === 'Manager', chainId))
                }
              >
                ← Back
              </Button>
            )}
            {chainId !== null && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted-foreground">Saloon:</span>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-semibold text-foreground min-w-40">
                  {selectedChain?.name ?? `Saloon #${chainId}`}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Location:</span>
              <Select
                isClearable
                isDisabled={currentUser?.role === 'Manager'}
                value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === String(locationId ?? '')) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => handleLocationChange(picked?.value ?? '')}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-40')}
              />
            </div>
          </div>
        }
      />

      <TreatmentCatalogTabs chainId={chainId} locationId={locationId} />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>{editingCategory ? `Edit Category: ${editingCategory.name}` : 'Treatment Categories'}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Input
              required
              placeholder="Category Name"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              error={getFieldError(submitError, 'name')}
            />
            <Button type="submit" disabled={saving} size="md" className="shrink-0">
              {saving ? 'Saving...' : editingCategory ? 'Update' : 'Add Category'}
            </Button>
            {editingCategory && (
              <Button type="button" variant="outline" size="md" className="shrink-0" onClick={handleCancelEdit} disabled={saving}>
                Cancel
              </Button>
            )}
          </form>
          {loading ? (
            <LoadingFallback />
          ) : optimisticCategories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No categories yet.</p>
          ) : (
            <ul className="divide-y divide-border/50 text-xs">
              {optimisticCategories.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{c.name}</span>
                    <Badge status={c.isActive === false ? 'Inactive' : 'Active'} className="text-[10px] py-0 px-1.5" />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => handleStartEdit(c)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => toggleActive(c)}>
                      {c.isActive === false ? 'Activate' : 'Deactivate'}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

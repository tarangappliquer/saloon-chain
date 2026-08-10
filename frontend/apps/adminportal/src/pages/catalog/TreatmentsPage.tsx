import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, Treatment, TreatmentCategory } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { TreatmentCatalogTabs } from '../../components/TreatmentCatalogTabs';
import { DateInput } from '../../components/DateInput';
import { routes } from '../../routes';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyTreatmentForm() {
  return { categoryId: '', name: '', description: '', durationSlots: '', preTimeMinutes: '0', effectiveFrom: today(), price: '' };
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
  const [savingTreatment, setSavingTreatment] = useState(false);

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

  function handleStartEditTreatment(t: Treatment) {
    setEditingTreatment(t);
    setTreatmentForm({
      categoryId: String(t.categoryId),
      name: t.name,
      description: t.description ?? '',
      durationSlots: '',
      preTimeMinutes: '0',
      effectiveFrom: t.effectiveFrom,
      price: '',
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
          description: treatmentForm.description || null,
          effectiveFrom: treatmentForm.effectiveFrom,
          isActive: editingTreatment.isActive !== false,
        });
        setEditingTreatment(null);
      } else {
        await adminCatalogApi.apiAdminCatalogTreatmentsPost({
          locationId,
          categoryId: Number(treatmentForm.categoryId),
          name: treatmentForm.name,
          description: treatmentForm.description || null,
          durationSlots: Number(treatmentForm.durationSlots),
          preTimeMinutes: Number(treatmentForm.preTimeMinutes),
          effectiveFrom: treatmentForm.effectiveFrom,
          price: Number(treatmentForm.price),
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
        description: t.description ?? null,
        effectiveFrom: t.effectiveFrom,
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
        title="Treatments"
        description="Manage this location's treatment catalog items and their go-live date."
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
          <CardTitle>{editingTreatment ? `Edit Treatment: ${editingTreatment.name}` : 'Add New Treatment'}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmitTreatment} className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Category
              </label>
              <Select
                isClearable
                value={activeCategoryOptions.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === treatmentForm.categoryId) ?? null}
                onChange={(picked: SingleValue<SelectOption>) => setTreatmentForm({ ...treatmentForm, categoryId: picked?.value ?? '' })}
                placeholder="Select Category..."
                options={activeCategoryOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                unstyled
                classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground')}
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
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                Description
              </label>
              <textarea
                rows={3}
                placeholder="Shown to clients on the booking page."
                value={treatmentForm.description}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, description: e.target.value })}
                className="flex w-full rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              />
              {getFieldError(treatmentSubmitError, 'description') && (
                <p className="mt-1 text-xs font-medium text-destructive">{getFieldError(treatmentSubmitError, 'description')}</p>
              )}
            </div>
            {!editingTreatment && (
              <Input
                required
                type="number"
                label="Duration (15-min slots)"
                placeholder="2 (30 mins)"
                value={treatmentForm.durationSlots}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, durationSlots: e.target.value })}
                error={getFieldError(treatmentSubmitError, 'durationSlots')}
              />
            )}
            {!editingTreatment && (
              <Input
                required
                type="number"
                label="Pre-time (arrival buffer, minutes)"
                helperText="Minutes the customer must arrive before the appointment. 0 = none."
                placeholder="0"
                value={treatmentForm.preTimeMinutes}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, preTimeMinutes: e.target.value })}
                error={getFieldError(treatmentSubmitError, 'preTimeMinutes')}
              />
            )}
            <DateInput
              required
              label="Effective From"
              helperText="When this treatment appears/is bookable in the client portal."
              value={treatmentForm.effectiveFrom}
              onChange={(e) => setTreatmentForm({ ...treatmentForm, effectiveFrom: e.target.value })}
              error={getFieldError(treatmentSubmitError, 'effectiveFrom')}
            />
            {!editingTreatment && (
              <Input
                required
                type="number"
                step="0.01"
                label="Default Price ($)"
                helperText="Effective from today. Schedule future price changes on the Prices page."
                placeholder="45.00"
                value={treatmentForm.price}
                onChange={(e) => setTreatmentForm({ ...treatmentForm, price: e.target.value })}
                error={getFieldError(treatmentSubmitError, 'price')}
              />
            )}
            <div className="flex items-center gap-3 pt-2 sm:col-span-2">
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

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Treatments ({treatments.length})</CardTitle>
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
                  <th className="px-6 py-3.5">Treatment</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Price</th>
                  <th className="px-6 py-3.5">Duration</th>
                  <th className="px-6 py-3.5">Effective From</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {treatments.map((t) => (
                  <tr key={t.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{t.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{t.categoryName}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-semibold text-primary">
                          {t.price === null ? <span className="text-muted-foreground italic font-sans">Not yet effective</span> : `$${t.price.toFixed(2)}`}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/catalog/treatment-prices?chainId=${chainId}&locationId=${locationId}&treatmentId=${t.id}`,
                            )
                          }
                        >
                          View
                        </Button>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{t.durationSlots * 15} mins</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            navigate(
                              `/catalog/treatment-durations?chainId=${chainId}&locationId=${locationId}&treatmentId=${t.id}`,
                            )
                          }
                        >
                          View
                        </Button>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {t.effectiveFrom} {t.effectiveFrom > today() && <Badge status="Inactive" className="ml-1 text-[10px] py-0 px-1.5" />}
                    </td>
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

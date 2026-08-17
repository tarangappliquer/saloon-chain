import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, Treatment, TreatmentPrice } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { TreatmentCatalogTabs } from '../../components/TreatmentCatalogTabs';
import { EffectiveDateFields } from '../../components/EffectiveDateFields';
import { resolveEffectiveTo, describeEffectiveWindow, type EffectiveMode } from '../../lib/effectiveDate';
import { routes } from '../../routes';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyPriceForm() {
  return { price: '', mode: 'from' as EffectiveMode, effectiveFrom: today(), effectiveTo: today() };
}

export function TreatmentPricesPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');
  const paramTreatmentId = searchParams.get('treatmentId');

  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(paramLocationId ? Number(paramLocationId) : null);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [treatmentId, setTreatmentId] = useState<number | null>(paramTreatmentId ? Number(paramTreatmentId) : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [priceHistory, setPriceHistory] = useState<TreatmentPrice[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [priceForm, setPriceForm] = useState(emptyPriceForm());
  const [savingPrice, setSavingPrice] = useState(false);
  const [priceSubmitError, setPriceSubmitError] = useState<unknown>(null);

  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  const [savingEditPrice, setSavingEditPrice] = useState(false);
  const [editPriceError, setEditPriceError] = useState<unknown>(null);

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

  const loadTreatments = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogTreatmentsGet(id);
      const treats = data as unknown as Treatment[];
      setTreatments(treats);
      setTreatmentId((prev) => {
        if (prev !== null && treats.some((t) => t.id === prev)) return prev;
        return treats.length > 0 ? treats[0].id : null;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load treatments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (locationId !== null) loadTreatments(locationId);
  }, [locationId, loadTreatments]);

  const loadPriceHistory = useCallback(async (id: number) => {
    setLoadingPrices(true);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogTreatmentsIdPricesGet(id);
      setPriceHistory(data as unknown as TreatmentPrice[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load price history');
      setPriceHistory([]);
    } finally {
      setLoadingPrices(false);
    }
  }, []);

  useEffect(() => {
    if (treatmentId !== null) loadPriceHistory(treatmentId);
    else setPriceHistory([]);
    setPriceForm(emptyPriceForm());
    setPriceSubmitError(null);
    setEditingPriceId(null);
  }, [treatmentId, loadPriceHistory]);

  function handleStartEditPrice(p: TreatmentPrice) {
    setEditingPriceId(p.id);
    setEditPriceValue(String(p.price));
    setEditPriceError(null);
  }

  function handleCancelEditPrice() {
    setEditingPriceId(null);
    setEditPriceError(null);
  }

  async function handleSubmitEditPrice(e: FormEvent) {
    e.preventDefault();
    if (treatmentId === null || editingPriceId === null) return;
    setError(null);
    setEditPriceError(null);
    setSavingEditPrice(true);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdPricesPriceIdPut(treatmentId, editingPriceId, {
        price: Number(editPriceValue),
      });
      setEditingPriceId(null);
      await loadPriceHistory(treatmentId);
      if (locationId !== null) await loadTreatments(locationId);
    } catch (err) {
      setEditPriceError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to update price');
    } finally {
      setSavingEditPrice(false);
    }
  }

  function updateParams(next: { chainId?: number | null; locationId?: number | null; treatmentId?: number | null }) {
    const p = new URLSearchParams(searchParams);
    const cId = next.chainId !== undefined ? next.chainId : chainId;
    const lId = next.locationId !== undefined ? next.locationId : locationId;
    const tId = next.treatmentId !== undefined ? next.treatmentId : treatmentId;
    if (cId !== null) p.set('chainId', String(cId)); else p.delete('chainId');
    if (lId !== null) p.set('locationId', String(lId)); else p.delete('locationId');
    if (tId !== null) p.set('treatmentId', String(tId)); else p.delete('treatmentId');
    setSearchParams(p, { replace: true });
  }

  function handleLocationChange(v: string) {
    const id = Number(v);
    setLocationId(id);
    setTreatmentId(null);
    updateParams({ locationId: id, treatmentId: null });
  }

  function handleTreatmentChange(v: string) {
    const id = v ? Number(v) : null;
    setTreatmentId(id);
    updateParams({ treatmentId: id });
  }

  async function handleSubmitPrice(e: FormEvent) {
    e.preventDefault();
    if (treatmentId === null) return;
    setError(null);
    setPriceSubmitError(null);
    if (priceHistory.some((p) => p.effectiveFrom === priceForm.effectiveFrom)) {
      setPriceSubmitError({ message: 'A price is already scheduled for this date.' });
      return;
    }
    setSavingPrice(true);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdPricesPost(treatmentId, {
        price: Number(priceForm.price),
        effectiveFrom: priceForm.effectiveFrom,
        effectiveTo: resolveEffectiveTo(priceForm.mode, priceForm.effectiveFrom, priceForm.effectiveTo),
      });
      setPriceForm(emptyPriceForm());
      await loadPriceHistory(treatmentId);
      if (locationId !== null) await loadTreatments(locationId);
    } catch (err) {
      setPriceSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to schedule price');
    } finally {
      setSavingPrice(false);
    }
  }

  const selectedChain = chains.find((c) => c.id === chainId);
  const selectedTreatment = treatments.find((t) => t.id === treatmentId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Prices"
        description="Schedule effective-dated prices per treatment. A treatment has no current price -- and isn't purchasable in the client portal -- until a price effective today or earlier exists."
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
          <CardTitle>Select Treatment</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {loading ? (
            <LoadingFallback />
          ) : treatments.length === 0 ? (
            <p className="text-xs text-muted-foreground">No treatments at this location yet.</p>
          ) : (
            <Select
              value={treatments.map((t) => ({ value: String(t.id), label: t.name })).find((o) => o.value === String(treatmentId ?? '')) ?? null}
              onChange={(picked: SingleValue<SelectOption>) => handleTreatmentChange(picked?.value ?? '')}
              options={treatments.map((t) => ({ value: String(t.id), label: t.name }))}
              unstyled
              classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground max-w-sm')}
            />
          )}
        </CardContent>
      </Card>

      {selectedTreatment && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle>Price History: {selectedTreatment.name}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingPrices ? (
                <LoadingFallback />
              ) : priceHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">No prices scheduled yet.</p>
              ) : (
                <ul className="divide-y divide-border/50 text-xs">
                  {priceHistory.map((p) => {
                    const isFuture = p.effectiveFrom > today();
                    if (editingPriceId === p.id) {
                      return (
                        <li key={p.id} className="py-2.5">
                          <form onSubmit={handleSubmitEditPrice} className="flex items-center gap-2">
                            <Input
                              required
                              type="number"
                              step="0.01"
                              autoFocus
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              error={getFieldError(editPriceError, 'price')}
                              className="w-24"
                            />
                            <span className="text-muted-foreground shrink-0">{describeEffectiveWindow(p.effectiveFrom, p.effectiveTo)}</span>
                            <Button type="submit" size="sm" disabled={savingEditPrice}>
                              {savingEditPrice ? 'Saving...' : 'Save'}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={handleCancelEditPrice} disabled={savingEditPrice}>
                              Cancel
                            </Button>
                          </form>
                          {editPriceError instanceof ApiError && !getFieldError(editPriceError, 'price') && (
                            <p className="mt-1 text-xs font-medium text-destructive">{editPriceError.message}</p>
                          )}
                        </li>
                      );
                    }
                    return (
                      <li key={p.id} className="flex items-center justify-between py-2.5">
                        <span className="font-mono font-semibold text-foreground">${p.price.toFixed(2)}</span>
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          {describeEffectiveWindow(p.effectiveFrom, p.effectiveTo)}
                          {isFuture && <Badge status="Inactive" className="text-[10px] py-0 px-1.5" />}
                          <Button variant="ghost" size="sm" onClick={() => handleStartEditPrice(p)}>
                            Edit
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle>Schedule New Price</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmitPrice} className="space-y-3">
                <Input
                  required
                  type="number"
                  step="0.01"
                  label="Price ($)"
                  placeholder="45.00"
                  value={priceForm.price}
                  onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })}
                  error={getFieldError(priceSubmitError, 'price')}
                />
                <EffectiveDateFields
                  mode={priceForm.mode}
                  onModeChange={(mode) => setPriceForm({ ...priceForm, mode })}
                  fromDate={priceForm.effectiveFrom}
                  onFromDateChange={(v) => setPriceForm({ ...priceForm, effectiveFrom: v })}
                  toDate={priceForm.effectiveTo}
                  onToDateChange={(v) => setPriceForm({ ...priceForm, effectiveTo: v })}
                  fromError={
                    (priceSubmitError as { message?: string } | null)?.message ||
                    getFieldError(priceSubmitError, 'effectiveFrom')
                  }
                />
                <p className="text-xs text-muted-foreground">Two prices can't share the same effective start date.</p>
                <Button type="submit" disabled={savingPrice} className="w-full">
                  {savingPrice ? 'Scheduling...' : 'Schedule Price'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

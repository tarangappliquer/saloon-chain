import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, Treatment, TreatmentDuration } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { TreatmentCatalogTabs } from '../../components/TreatmentCatalogTabs';
import { DateInput } from '../../components/DateInput';
import { routes } from '../../routes';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function emptyDurationForm() {
  return { durationSlots: '', preTimeMinutes: '0', effectiveFrom: today() };
}

export function TreatmentDurationsPage() {
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

  const [durationHistory, setDurationHistory] = useState<TreatmentDuration[]>([]);
  const [loadingDurations, setLoadingDurations] = useState(false);
  const [durationForm, setDurationForm] = useState(emptyDurationForm());
  const [savingDuration, setSavingDuration] = useState(false);
  const [durationSubmitError, setDurationSubmitError] = useState<unknown>(null);

  const [editingDurationId, setEditingDurationId] = useState<number | null>(null);
  const [editDurationValue, setEditDurationValue] = useState('');
  const [editPreTimeValue, setEditPreTimeValue] = useState('0');
  const [savingEditDuration, setSavingEditDuration] = useState(false);
  const [editDurationError, setEditDurationError] = useState<unknown>(null);

  const [deletingDurationId, setDeletingDurationId] = useState<number | null>(null);

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

  const loadDurationHistory = useCallback(async (id: number) => {
    setLoadingDurations(true);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogTreatmentsIdDurationsGet(id);
      setDurationHistory(data as unknown as TreatmentDuration[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load duration history');
      setDurationHistory([]);
    } finally {
      setLoadingDurations(false);
    }
  }, []);

  useEffect(() => {
    if (treatmentId !== null) loadDurationHistory(treatmentId);
    else setDurationHistory([]);
    setDurationForm(emptyDurationForm());
    setDurationSubmitError(null);
    setEditingDurationId(null);
  }, [treatmentId, loadDurationHistory]);

  function handleStartEditDuration(d: TreatmentDuration) {
    setEditingDurationId(d.id);
    setEditDurationValue(String(d.durationSlots));
    setEditPreTimeValue(String(d.preTimeMinutes ?? 0));
    setEditDurationError(null);
  }

  function handleCancelEditDuration() {
    setEditingDurationId(null);
    setEditDurationError(null);
  }

  async function handleSubmitEditDuration(e: FormEvent) {
    e.preventDefault();
    if (treatmentId === null || editingDurationId === null) return;
    setError(null);
    setEditDurationError(null);
    setSavingEditDuration(true);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdDurationsDurationIdPut(treatmentId, editingDurationId, {
        durationSlots: Number(editDurationValue),
        preTimeMinutes: Number(editPreTimeValue),
      });
      setEditingDurationId(null);
      await loadDurationHistory(treatmentId);
      if (locationId !== null) await loadTreatments(locationId);
    } catch (err) {
      setEditDurationError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to update duration');
    } finally {
      setSavingEditDuration(false);
    }
  }

  async function handleDeleteDuration(d: TreatmentDuration) {
    if (treatmentId === null) return;
    if (!window.confirm(`Delete the duration scheduled from ${d.effectiveFrom}?`)) return;
    setError(null);
    setDeletingDurationId(d.id);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdDurationsDurationIdDelete(treatmentId, d.id);
      await loadDurationHistory(treatmentId);
      if (locationId !== null) await loadTreatments(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete duration');
    } finally {
      setDeletingDurationId(null);
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

  async function handleSubmitDuration(e: FormEvent) {
    e.preventDefault();
    if (treatmentId === null) return;
    setError(null);
    setDurationSubmitError(null);
    if (durationHistory.some((d) => d.effectiveFrom === durationForm.effectiveFrom)) {
      setDurationSubmitError({ message: 'A duration is already scheduled for this date.' });
      return;
    }
    setSavingDuration(true);
    try {
      await adminCatalogApi.apiAdminCatalogTreatmentsIdDurationsPost(treatmentId, {
        durationSlots: Number(durationForm.durationSlots),
        preTimeMinutes: Number(durationForm.preTimeMinutes),
        effectiveFrom: durationForm.effectiveFrom,
      });
      setDurationForm(emptyDurationForm());
      await loadDurationHistory(treatmentId);
      if (locationId !== null) await loadTreatments(locationId);
    } catch (err) {
      setDurationSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to schedule duration');
    } finally {
      setSavingDuration(false);
    }
  }

  const selectedChain = chains.find((c) => c.id === chainId);
  const selectedTreatment = treatments.find((t) => t.id === treatmentId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Durations"
        description="Schedule effective-dated durations per treatment. A treatment has no current duration -- and isn't bookable in the client portal -- until a duration effective today or earlier exists."
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
              <CardTitle>Duration History: {selectedTreatment.name}</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {loadingDurations ? (
                <LoadingFallback />
              ) : durationHistory.length === 0 ? (
                <p className="text-xs text-muted-foreground">No durations scheduled yet.</p>
              ) : (
                <ul className="divide-y divide-border/50 text-xs">
                  {durationHistory.map((d) => {
                    const isFuture = d.effectiveFrom > today();
                    if (editingDurationId === d.id) {
                      return (
                        <li key={d.id} className="py-2.5">
                          <form onSubmit={handleSubmitEditDuration} className="flex items-center gap-2">
                            <Input
                              required
                              type="number"
                              autoFocus
                              value={editDurationValue}
                              onChange={(e) => setEditDurationValue(e.target.value)}
                              error={getFieldError(editDurationError, 'durationSlots')}
                              className="w-16"
                              title="Duration (15-min slots)"
                            />
                            <Input
                              required
                              type="number"
                              value={editPreTimeValue}
                              onChange={(e) => setEditPreTimeValue(e.target.value)}
                              error={getFieldError(editDurationError, 'preTimeMinutes')}
                              className="w-16"
                              title="Pre-time (arrival buffer, minutes)"
                            />
                            <span className="text-muted-foreground shrink-0">from {d.effectiveFrom}</span>
                            <Button type="submit" size="sm" disabled={savingEditDuration}>
                              {savingEditDuration ? 'Saving...' : 'Save'}
                            </Button>
                            <Button type="button" variant="outline" size="sm" onClick={handleCancelEditDuration} disabled={savingEditDuration}>
                              Cancel
                            </Button>
                          </form>
                          {editDurationError instanceof ApiError && !getFieldError(editDurationError, 'durationSlots') && !getFieldError(editDurationError, 'preTimeMinutes') && (
                            <p className="mt-1 text-xs font-medium text-destructive">{editDurationError.message}</p>
                          )}
                        </li>
                      );
                    }
                    return (
                      <li key={d.id} className="flex items-center justify-between py-2.5">
                        <span className="font-mono font-semibold text-foreground">
                          {d.durationSlots * 15} mins
                          {d.preTimeMinutes > 0 && (
                            <span className="ml-1.5 font-sans font-normal text-muted-foreground">
                              (arrive {d.preTimeMinutes} min early)
                            </span>
                          )}
                        </span>
                        <span className="text-muted-foreground flex items-center gap-1.5">
                          from {d.effectiveFrom}
                          {isFuture && <Badge status="Inactive" className="text-[10px] py-0 px-1.5" />}
                          <Button variant="ghost" size="sm" onClick={() => handleStartEditDuration(d)}>
                            Edit
                          </Button>
                          {isFuture && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDuration(d)}
                              disabled={deletingDurationId === d.id}
                              className="text-destructive hover:text-destructive"
                            >
                              {deletingDurationId === d.id ? 'Deleting...' : 'Delete'}
                            </Button>
                          )}
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
              <CardTitle>Schedule New Duration</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmitDuration} className="space-y-3">
                <Input
                  required
                  type="number"
                  label="Duration (15-min slots)"
                  placeholder="2 (30 mins)"
                  value={durationForm.durationSlots}
                  onChange={(e) => setDurationForm({ ...durationForm, durationSlots: e.target.value })}
                  error={getFieldError(durationSubmitError, 'durationSlots')}
                />
                <Input
                  required
                  type="number"
                  label="Pre-time (arrival buffer, minutes)"
                  helperText="Minutes the customer must arrive before the appointment. 0 = none."
                  placeholder="0"
                  value={durationForm.preTimeMinutes}
                  onChange={(e) => setDurationForm({ ...durationForm, preTimeMinutes: e.target.value })}
                  error={getFieldError(durationSubmitError, 'preTimeMinutes')}
                />
                <DateInput
                  required
                  label="Effective From"
                  helperText="Two durations can't share the same effective date."
                  value={durationForm.effectiveFrom}
                  onChange={(e) => setDurationForm({ ...durationForm, effectiveFrom: e.target.value })}
                  error={
                    (durationSubmitError as { message?: string } | null)?.message ||
                    getFieldError(durationSubmitError, 'effectiveFrom')
                  }
                />
                <Button type="submit" disabled={savingDuration} className="w-full">
                  {savingDuration ? 'Scheduling...' : 'Schedule Duration'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

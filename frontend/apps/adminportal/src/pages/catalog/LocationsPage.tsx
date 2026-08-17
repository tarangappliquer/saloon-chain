import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { Calendar, CalendarOff, Clock, DoorClosed, Sparkles, UserPlus } from 'lucide-react';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location } from '../../api/types';
import { TimeInput } from '../../components/TimeInput';
import { ClosuresModal } from '../../components/ClosuresModal';
import { DayScheduleModal } from '../../components/DayScheduleModal';
import { DAY_BITS } from '../../lib/schedule';
import { toApiTime, validateBreakTimes } from '../../lib/time';
import { routes } from '../../routes';

function emptyForm() {
  return {
    name: '',
    address: '',
    latitude: null as number | null,
    longitude: null as number | null,
    openTime: '09:00',
    closeTime: '18:00',
    breakStartTime: '',
    breakEndTime: '',
    timeZoneId: 'UTC',
    days: new Set(DAY_BITS.map((d) => d.bit)),
  };
}

export function LocationsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const { user: currentUser } = useAuth();
  const canAddLocationUser = currentUser && ['RootSuperAdmin', 'SuperAdmin', 'Admin', 'Manager'].includes(currentUser.role);

  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);
  const [formChainId, setFormChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deletingLocation, setDeletingLocation] = useState<Location | null>(null);
  const [closuresLocation, setClosuresLocation] = useState<Location | null>(null);
  const [dayScheduleLocation, setDayScheduleLocation] = useState<Location | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as Chain[];
        setChains(cs);
        if (cs.length > 0 && chainId === null) {
          setChainId(cs[0].id);
          setFormChainId(cs[0].id);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, [chainId]);

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

  const [breakStartError, setBreakStartError] = useState<string | null>(null);
  const [breakEndError, setBreakEndError] = useState<string | null>(null);

  function handleStartEdit(loc: Location) {
    setEditingLocation(loc);
    setFormChainId(loc.chainId ?? chainId);
    const dayBits = new Set<number>();
    DAY_BITS.forEach((d) => {
      if ((loc.workingDaysMask & d.bit) !== 0) dayBits.add(d.bit);
    });
    setForm({
      name: loc.name,
      address: loc.address ?? '',
      latitude: loc.latitude ?? null,
      longitude: loc.longitude ?? null,
      openTime: loc.openTime,
      closeTime: loc.closeTime,
      breakStartTime: loc.breakStartTime ? loc.breakStartTime.slice(0, 5) : '',
      breakEndTime: loc.breakEndTime ? loc.breakEndTime.slice(0, 5) : '',
      timeZoneId: loc.timeZoneId,
      days: dayBits,
    });
    setBreakStartError(null);
    setBreakEndError(null);
    setError(null);
    setSubmitError(null);
  }


  function handleCancelForm() {
    setEditingLocation(null);
    setForm(emptyForm());
    if (chainId !== null) setFormChainId(chainId);
    setBreakStartError(null);
    setBreakEndError(null);
    setError(null);
    setSubmitError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const targetChainId = formChainId ?? chainId;
    if (targetChainId === null) return;

    setError(null);
    setSubmitError(null);
    setBreakStartError(null);
    setBreakEndError(null);

    const breakErrors = validateBreakTimes(form.breakStartTime, form.breakEndTime);
    if (breakErrors.startError || breakErrors.endError) {
      setBreakStartError(breakErrors.startError);
      setBreakEndError(breakErrors.endError);
      setError('Please fix the validation errors below.');
      return;
    }

    if (form.latitude === null || form.longitude === null) {
      setError('Enter latitude and longitude before saving.');
      return;
    }

    setSubmitting(true);
    try {
      const workingDaysMask = [...form.days].reduce((mask, bit) => mask | bit, 0);
      const breakStart = toApiTime(form.breakStartTime);
      const breakEnd = toApiTime(form.breakEndTime);

      if (editingLocation) {
        await adminCatalogApi.apiAdminCatalogLocationsIdPut(editingLocation.id, {
          name: form.name,
          address: form.address || null,
          latitude: form.latitude,
          longitude: form.longitude,
          openTime: form.openTime,
          closeTime: form.closeTime,
          breakStartTime: breakStart,
          breakEndTime: breakEnd,
          workingDaysMask,
          timeZoneId: form.timeZoneId,
          isActive: editingLocation.isActive !== false,
        });
      } else {
        await adminCatalogApi.apiAdminCatalogLocationsPost({
          chainId: targetChainId,
          name: form.name,
          address: form.address || null,
          latitude: form.latitude,
          longitude: form.longitude,
          openTime: form.openTime,
          closeTime: form.closeTime,
          breakStartTime: breakStart,
          breakEndTime: breakEnd,
          workingDaysMask,
          timeZoneId: form.timeZoneId,
        });
      }

      handleCancelForm();
      if (targetChainId !== chainId) {
        setChainId(targetChainId);
      } else {
        await loadLocations(targetChainId);
      }
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : `Failed to ${editingLocation ? 'update' : 'create'} location`);
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
        // Generated request type for decimal? fields is a broken placeholder (openapi-generator
        // quirk, see AdminBookingTreatmentDtoPrice) that structurally rejects `null` even though the
        // field is genuinely nullable -- cast through, same as the `as unknown as X[]` casts already
        // used for response bodies elsewhere in this file. A legacy location with no pin set yet will
        // still get a real 400 from sp_Catalog_UpdateLocation's NotNull validator, which is correct:
        // the map pin is compulsory for every save, this call included.
        latitude: (loc.latitude ?? null) as number,
        longitude: (loc.longitude ?? null) as number,
        openTime: loc.openTime,
        closeTime: loc.closeTime,
        breakStartTime: loc.breakStartTime ?? null,
        breakEndTime: loc.breakEndTime ?? null,
        workingDaysMask: loc.workingDaysMask,
        timeZoneId: loc.timeZoneId,
        isActive: !loc.isActive,
      });
      if (chainId !== null) await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update location');
    }
  }

  async function handleConfirmDelete() {
    if (!deletingLocation) return;
    setError(null);
    setDeleting(true);
    try {
      await adminCatalogApi.apiAdminCatalogLocationsIdDelete(deletingLocation.id);
      setDeletingLocation(null);
      if (chainId !== null) await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete location');
    } finally {
      setDeleting(false);
    }
  }

  function handleNavigateToTreatments(loc: Location) {
    navigate(routes.catalog.treatments(loc.chainId ?? chainId, loc.id));
  }

  function handleNavigateToUsers(loc: Location) {
    navigate(routes.catalog.locationUsers(loc.chainId ?? chainId, loc.id));
  }

  function handleNavigateToRooms(loc: Location) {
    navigate(routes.staff.rooms(loc.chainId ?? chainId, loc.id));
  }

  function handleNavigateToSchedule(loc: Location) {
    navigate(routes.calendar({ chainId: loc.chainId ?? chainId, locationId: loc.id }));
  }

  const activeChain = chains.find((c) => c.id === (formChainId ?? chainId));

  return (
    <div className="space-y-6">
      <ConfirmDialog
        isOpen={deletingLocation !== null}
        title="Delete Location"
        description={`Are you sure you want to delete "${deletingLocation?.name}"? All associated rooms, schedules, and treatment mappings will be permanently removed.`}
        confirmLabel="Delete Location"
        cancelLabel="Keep Location"
        variant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onClose={() => setDeletingLocation(null)}
      />

      <PageHeader
        title="Salon Locations"
        description="Manage physical salon locations, operating hours, and active status per saloon chain."
        action={
          <Button variant="outline" size="sm" onClick={() => navigate(routes.catalog.saloons)}>
            ← Back to Saloons
          </Button>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Add / Edit Location Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>{editingLocation ? `Edit Location: ${editingLocation.name}` : 'Add New Location'}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Readonly Saloon Chain Label */}
              <div className="space-y-1">
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Saloon Chain
                </label>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground flex items-center justify-between">
                  <span>{activeChain?.name ?? (chainId ? `Saloon Chain #${chainId}` : 'Selected Chain')}</span>
                  <Badge status="Active" className="text-[10px] py-0 px-1.5" />
                </div>
              </div>

              <Input
                required
                label="Location Name"
                placeholder="Downtown Salon"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                error={getFieldError(submitError, 'name')}
              />
              <Input
                label="Address"
                placeholder="123 Main St, Suite 100"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                error={getFieldError(submitError, 'address')}
              />
              <Input
                required
                label="Time Zone ID"
                placeholder="UTC or America/New_York"
                value={form.timeZoneId}
                onChange={(e) => setForm({ ...form, timeZoneId: e.target.value })}
                error={getFieldError(submitError, 'timeZoneId')}
              />
              <TimeInput
                required
                label="Opening Time"
                value={form.openTime}
                maxTime={form.closeTime}
                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
              />
              <TimeInput
                required
                label="Closing Time"
                value={form.closeTime}
                minTime={form.openTime}
                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                error={getFieldError(submitError, 'closeTime')}
              />
              <TimeInput
                label="Break Start Time (Optional)"
                value={form.breakStartTime}
                minTime={form.openTime}
                maxTime={form.breakEndTime || form.closeTime}
                onChange={(e) => {
                  setForm({ ...form, breakStartTime: e.target.value });
                  setBreakStartError(null);
                }}
                error={breakStartError ?? undefined}
              />
              <TimeInput
                label="Break End Time (Optional)"
                value={form.breakEndTime}
                minTime={form.breakStartTime || form.openTime}
                maxTime={form.closeTime}
                onChange={(e) => {
                  setForm({ ...form, breakEndTime: e.target.value });
                  setBreakEndError(null);
                }}
                error={breakEndError ?? undefined}
              />
              <Input
                required
                type="number"
                step="any"
                min={-90}
                max={90}
                label="Latitude"
                placeholder="e.g. 28.613900"
                value={form.latitude ?? ''}
                onChange={(e) => setForm({ ...form, latitude: e.target.value === '' ? null : Number(e.target.value) })}
                error={getFieldError(submitError, 'latitude')}
              />
              <Input
                required
                type="number"
                step="any"
                min={-180}
                max={180}
                label="Longitude"
                placeholder="e.g. 77.209000"
                value={form.longitude ?? ''}
                onChange={(e) => setForm({ ...form, longitude: e.target.value === '' ? null : Number(e.target.value) })}
                error={getFieldError(submitError, 'longitude')}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Operating Days
              </label>
              <div className="flex flex-wrap gap-4 text-xs">
                {DAY_BITS.map((d) => (
                  <label key={d.bit} className="flex items-center gap-1.5 font-medium text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.days.has(d.bit)}
                      onChange={() => toggleDay(d.bit)}
                      className="rounded-sm border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Saving...' : editingLocation ? 'Update Location' : 'Add Location'}
              </Button>
              {editingLocation && (
                <Button type="button" variant="outline" onClick={handleCancelForm} disabled={submitting}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Salon Locations Table Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>
            Salon Locations {activeChain ? `for ${activeChain.name}` : ''} ({locations.length})
          </CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : locations.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No locations found.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse min-w-[950px]">
              <thead className="border-b border-border bg-muted/30 font-medium text-muted-foreground">
                <tr>
                  <th className="px-6 py-3.5">Location Name</th>
                  <th className="px-6 py-3.5">Address</th>
                  <th className="px-6 py-3.5">Hours & Timezone</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {locations.map((l) => (
                  <tr key={l.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{l.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{l.address ?? '-'}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">
                      <div>{l.openTime.slice(0, 5)} - {l.closeTime.slice(0, 5)} ({l.timeZoneId})</div>
                      {l.breakStartTime && l.breakEndTime && (
                        <div className="text-[11px] text-amber-500 font-sans mt-0.5">
                          Break: {l.breakStartTime.slice(0, 5)} - {l.breakEndTime.slice(0, 5)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={l.isActive === false ? 'Inactive' : 'Active'} />
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap min-w-max">
                      <div className="flex items-center justify-end gap-2 shrink-0 w-max">
                        {canAddLocationUser && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleNavigateToUsers(l)}
                          >
                            <UserPlus className="h-3.5 w-3.5 text-primary" />
                            Add User
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNavigateToRooms(l)}
                        >
                          <DoorClosed className="h-3.5 w-3.5" />
                          Rooms
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleNavigateToSchedule(l)}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                          Schedule
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setClosuresLocation(l)}
                        >
                          <CalendarOff className="h-3.5 w-3.5" />
                          Closures
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDayScheduleLocation(l)}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          Day Hours
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleNavigateToTreatments(l)}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Treatments
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStartEdit(l)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(l)}
                        >
                          {l.isActive === false ? 'Activate' : 'Deactivate'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => setDeletingLocation(l)}
                        >
                          Delete
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

      {closuresLocation && (
        <ClosuresModal
          scope={{ kind: 'location', id: closuresLocation.id, name: closuresLocation.name }}
          applyToAllChainId={
            currentUser && ['RootSuperAdmin', 'SuperAdmin', 'Admin'].includes(currentUser.role) ? closuresLocation.chainId : undefined
          }
          applyToAllChainName={activeChain?.name}
          onClose={() => setClosuresLocation(null)}
        />
      )}

      {dayScheduleLocation && (
        <DayScheduleModal
          locationId={dayScheduleLocation.id}
          locationName={dayScheduleLocation.name}
          defaultOpenTime={dayScheduleLocation.openTime}
          defaultCloseTime={dayScheduleLocation.closeTime}
          onClose={() => setDayScheduleLocation(null)}
        />
      )}
    </div>
  );
}

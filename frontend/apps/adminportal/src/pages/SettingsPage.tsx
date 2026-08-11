import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { Calendar, Clock, DoorClosed, Layers, MapPin, Pencil, Settings as SettingsIcon, Sparkles, Store } from 'lucide-react';
import { adminCatalogApi, ApiError, getFieldError } from '../api/client';
import type { Chain, Location } from '../api/types';
import { TimeInput } from '../components/TimeInput';
import { routes } from '../routes';
import { useAuth } from '../features/auth/AuthContext';

type Tab = 'locations' | 'service-menu' | 'system';

interface DaySchedule {
  key: string;
  bit: number;
  label: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

const WEEK_DAYS: { key: string; bit: number; label: string }[] = [
  { key: 'mon', bit: 1, label: 'Monday' },
  { key: 'tue', bit: 2, label: 'Tuesday' },
  { key: 'wed', bit: 4, label: 'Wednesday' },
  { key: 'thu', bit: 8, label: 'Thursday' },
  { key: 'fri', bit: 16, label: 'Friday' },
  { key: 'sat', bit: 32, label: 'Saturday' },
  { key: 'sun', bit: 64, label: 'Sunday' },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isRootOrSuperAdmin = user?.role === 'RootSuperAdmin' || user?.role === 'SuperAdmin';

  const [tab, setTab] = useState<Tab>('locations');
  const [chains, setChains] = useState<Chain[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);

  const [isEditMode, setIsEditMode] = useState(false);

  const [form, setForm] = useState({
    name: '',
    address: '',
    timeZoneId: 'UTC',
    breakStartTime: '',
    breakEndTime: '',
  });

  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);

  // Load Chains
  useEffect(() => {
    adminCatalogApi.apiAdminCatalogChainsGet().then(({ data }) => {
      const cs = data as unknown as Chain[];
      setChains(cs);
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  // Load Locations when Chain changes
  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi.apiAdminCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data as unknown as Location[];
      setLocations(locs);
      if (locs.length > 0) {
        setLocationId(locs[0].id);
        setSelectedLocation(locs[0]);
      } else {
        setLocationId(null);
        setSelectedLocation(null);
      }
    });
  }, [chainId]);

  // Sync form when selectedLocation changes
  useEffect(() => {
    if (!selectedLocation) return;
    setForm({
      name: selectedLocation.name,
      address: selectedLocation.address ?? '',
      timeZoneId: selectedLocation.timeZoneId,
      breakStartTime: selectedLocation.breakStartTime ? selectedLocation.breakStartTime.slice(0, 5) : '',
      breakEndTime: selectedLocation.breakEndTime ? selectedLocation.breakEndTime.slice(0, 5) : '',
    });

    const schedule: DaySchedule[] = WEEK_DAYS.map((d) => {
      const isOpen = (selectedLocation.workingDaysMask & d.bit) !== 0;
      return {
        key: d.key,
        bit: d.bit,
        label: d.label,
        isOpen,
        openTime: selectedLocation.openTime || '09:00',
        closeTime: selectedLocation.closeTime || '18:00',
      };
    });
    setWeeklySchedule(schedule);
    setLoading(false);
  }, [selectedLocation]);

  function handleLocationSelect(locId: number) {
    const loc = locations.find((l) => l.id === locId);
    if (loc) {
      setLocationId(loc.id);
      setSelectedLocation(loc);
      setIsEditMode(false);
    }
  }

  function toggleDayOpen(bit: number) {
    if (!isEditMode) return;
    setWeeklySchedule((sched) =>
      sched.map((day) => (day.bit === bit ? { ...day, isOpen: !day.isOpen } : day))
    );
  }

  function updateDayTime(bit: number, field: 'openTime' | 'closeTime', val: string) {
    if (!isEditMode) return;
    setWeeklySchedule((sched) =>
      sched.map((day) => (day.bit === bit ? { ...day, [field]: val } : day))
    );
  }

  async function handleSaveLocationSettings(e: FormEvent) {
    e.preventDefault();
    if (!selectedLocation) return;

    setError(null);
    setSuccess(null);
    setSubmitError(null);
    setSubmitting(true);

    try {
      const workingDaysMask = weeklySchedule
        .filter((d) => d.isOpen)
        .reduce((mask, d) => mask | d.bit, 0);

      // Take standard open/close time from first open day, or default 09:00-18:00
      const firstOpenDay = weeklySchedule.find((d) => d.isOpen);
      const openTime = firstOpenDay ? firstOpenDay.openTime : '09:00';
      const closeTime = firstOpenDay ? firstOpenDay.closeTime : '18:00';

      const breakStart = form.breakStartTime ? (form.breakStartTime.length === 5 ? `${form.breakStartTime}:00` : form.breakStartTime) : null;
      const breakEnd = form.breakEndTime ? (form.breakEndTime.length === 5 ? `${form.breakEndTime}:00` : form.breakEndTime) : null;

      await adminCatalogApi.apiAdminCatalogLocationsIdPut(selectedLocation.id, {
        name: form.name,
        address: form.address || null,
        openTime,
        closeTime,
        breakStartTime: breakStart,
        breakEndTime: breakEnd,
        workingDaysMask,
        timeZoneId: form.timeZoneId,
        isActive: selectedLocation.isActive !== false,
      });

      setSuccess('Location operating schedule and details updated successfully!');
      setIsEditMode(false);
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to update location settings');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Location Management"
        description="Configure location details, per-day opening & closing hours, and service menu catalog."
      />

      {/* Tabs */}
      <div className="flex border-b border-border/80 text-xs font-semibold text-muted-foreground gap-6">
        <button
          type="button"
          onClick={() => setTab('locations')}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${
            tab === 'locations'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent hover:text-foreground'
          }`}
        >
          <MapPin className="h-4 w-4" />
          Locations & Opening Hours
        </button>
        <button
          type="button"
          onClick={() => setTab('service-menu')}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${
            tab === 'service-menu'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent hover:text-foreground'
          }`}
        >
          <Sparkles className="h-4 w-4" />
          Service Menu Catalog
        </button>
        <button
          type="button"
          onClick={() => setTab('system')}
          className={`flex items-center gap-2 pb-3 border-b-2 font-medium transition ${
            tab === 'system'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent hover:text-foreground'
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          Chain & System Settings
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-xs font-medium text-emerald-500">
          ✓ {success}
        </div>
      )}

      {tab === 'locations' && (
        <div className="space-y-6">
          {/* Location Selector Bar */}
          <Card>
            <CardContent className="py-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Store className="h-5 w-5 text-primary" />
                <div>
                  <h3 className="text-sm font-bold text-foreground">Select Venue Location</h3>
                  <p className="text-xs text-muted-foreground">Pick a location to view or edit its weekly operating hours</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {isRootOrSuperAdmin && chains.length > 1 && (
                  <select
                    value={chainId ?? ''}
                    onChange={(e) => setChainId(Number(e.target.value))}
                    className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground font-semibold"
                  >
                    {chains.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {locations.length > 0 && (
                  <select
                    value={locationId ?? ''}
                    onChange={(e) => handleLocationSelect(Number(e.target.value))}
                    className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground font-semibold"
                  >
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </CardContent>
          </Card>

          {loading ? (
            <CardContent className="py-8">
              <LoadingFallback />
            </CardContent>
          ) : !selectedLocation ? (
            <Card>
              <CardContent className="py-8 text-center text-xs text-muted-foreground">
                No location selected or available.
              </CardContent>
            </Card>
          ) : (
            <form onSubmit={handleSaveLocationSettings} className="space-y-6">
              {/* Location General Details */}
              <Card>
                <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Location Info & TimeZone</CardTitle>
                  <Badge status={selectedLocation.isActive === false ? 'Inactive' : 'Active'} />
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Input
                      required
                      disabled={!isEditMode}
                      label="Location Name"
                      placeholder="Downtown Saloon Branch"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      error={getFieldError(submitError, 'name')}
                    />
                    <Input
                      disabled={!isEditMode}
                      label="Address"
                      placeholder="123 Main St, Suite 100"
                      value={form.address}
                      onChange={(e) => setForm({ ...form, address: e.target.value })}
                      error={getFieldError(submitError, 'address')}
                    />
                    <Input
                      required
                      disabled={!isEditMode}
                      label="Time Zone ID"
                      placeholder="UTC or America/New_York"
                      value={form.timeZoneId}
                      onChange={(e) => setForm({ ...form, timeZoneId: e.target.value })}
                      error={getFieldError(submitError, 'timeZoneId')}
                    />
                    <TimeInput
                      disabled={!isEditMode}
                      label="Break Start Time (Optional)"
                      value={form.breakStartTime}
                      onChange={(e) => setForm({ ...form, breakStartTime: e.target.value })}
                    />
                    <TimeInput
                      disabled={!isEditMode}
                      label="Break End Time (Optional)"
                      value={form.breakEndTime}
                      onChange={(e) => setForm({ ...form, breakEndTime: e.target.value })}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Per-Day Opening & Closing Hours Table */}
              <Card>
                <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between flex-wrap gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm">Weekly Per-Day Opening & Closing Schedule</CardTitle>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Specific opening and closing hours per day of the week (Monday through Sunday).
                    </p>
                  </div>
                  <div>
                    {!isEditMode ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditMode(true)}
                        className="font-semibold"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1.5 text-primary" />
                        Edit Schedule
                      </Button>
                    ) : (
                      <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-3 py-1 text-xs font-bold text-amber-500">
                        ✏️ Edit Mode Active
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30 font-semibold uppercase text-muted-foreground tracking-wider">
                        <th className="px-6 py-3.5">Day</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Opening Time</th>
                        <th className="px-6 py-3.5">Closing Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {weeklySchedule.map((day) => (
                        <tr key={day.key} className={day.isOpen ? 'bg-card' : 'bg-muted/10 opacity-70'}>
                          <td className="px-6 py-4 font-bold text-foreground">{day.label}</td>
                          <td className="px-6 py-4">
                            {isEditMode ? (
                              <button
                                type="button"
                                onClick={() => toggleDayOpen(day.bit)}
                                className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
                                  day.isOpen
                                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                    : 'bg-muted text-muted-foreground border border-border'
                                }`}
                              >
                                {day.isOpen ? 'Open' : 'Closed'}
                              </button>
                            ) : (
                              <span
                                className={`inline-block rounded-full px-3 py-1 text-[11px] font-bold ${
                                  day.isOpen
                                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                                    : 'bg-muted text-muted-foreground border border-border'
                                }`}
                              >
                                {day.isOpen ? 'Open' : 'Closed'}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditMode && day.isOpen ? (
                              <TimeInput
                                value={day.openTime}
                                onChange={(e) => updateDayTime(day.bit, 'openTime', e.target.value)}
                                className="w-32"
                              />
                            ) : day.isOpen ? (
                              <span className="font-mono text-foreground font-semibold text-xs">{day.openTime}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs font-mono">— Closed —</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {isEditMode && day.isOpen ? (
                              <TimeInput
                                value={day.closeTime}
                                onChange={(e) => updateDayTime(day.bit, 'closeTime', e.target.value)}
                                className="w-32"
                              />
                            ) : day.isOpen ? (
                              <span className="font-mono text-foreground font-semibold text-xs">{day.closeTime}</span>
                            ) : (
                              <span className="text-muted-foreground text-xs font-mono">— Closed —</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              {isEditMode && (
                <div className="flex items-center justify-end gap-3 animate-in fade-in duration-150">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditMode(false)}
                    disabled={submitting}
                  >
                    Cancel Edit
                  </Button>
                  <Button type="submit" disabled={submitting} size="lg" className="font-bold">
                    {submitting ? 'Saving Settings...' : 'Save Location Schedule'}
                  </Button>
                </div>
              )}
            </form>
          )}
        </div>
      )}

      {tab === 'service-menu' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(routes.catalog.treatmentCategories)}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Treatment Categories</CardTitle>
                  <p className="text-xs text-muted-foreground">Manage service categories (Hair, Nails, Spa)</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Categories →
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(routes.catalog.treatments(chainId, locationId))}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Services / Treatments</CardTitle>
                  <p className="text-xs text-muted-foreground">Configure service catalog and descriptions</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="primary" size="sm" className="w-full">
                Manage Services →
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(routes.catalog.treatmentPrices(chainId, locationId))}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Effective Pricing Rules</CardTitle>
                  <p className="text-xs text-muted-foreground">Effective-dated price lists per treatment</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Service Prices →
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(routes.catalog.treatmentDurations(chainId, locationId))}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Service Durations</CardTitle>
                  <p className="text-xs text-muted-foreground">Configure appointment slot durations (15m increments)</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Service Durations →
              </Button>
            </CardContent>
          </Card>

          <Card className="hover:border-primary/50 transition cursor-pointer" onClick={() => navigate(routes.staff.rooms(chainId, locationId))}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
                  <DoorClosed className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base">Rooms & Stations</CardTitle>
                  <p className="text-xs text-muted-foreground">Setup treatment rooms & station allocations</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" className="w-full">
                Manage Rooms →
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'system' && (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4">
            <CardTitle className="text-sm">Saloon Chain & System Preferences</CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Active Chain</label>
                <p className="font-bold text-foreground text-sm">
                  {chains.find((c) => c.id === chainId)?.name ?? 'Saloon Chain'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1">Default Currency</label>
                <p className="font-bold text-foreground text-sm">USD ($)</p>
              </div>
            </div>
            {isRootOrSuperAdmin && (
              <div className="pt-4 border-t border-border/50">
                <Button variant="outline" size="sm" onClick={() => navigate(routes.catalog.saloons)}>
                  <Store className="h-3.5 w-3.5 mr-1" />
                  Manage Saloon Chains
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

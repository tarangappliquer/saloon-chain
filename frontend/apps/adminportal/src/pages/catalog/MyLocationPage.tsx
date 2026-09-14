import { useEffect, useState, type SyntheticEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { Calendar, Clock, DoorClosed, Sparkles, UserPlus } from 'lucide-react';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import type { Location } from '../../api/types';
import { TimeInput } from '../../components/TimeInput';
import { TimezoneSelect } from '../../components/TimezoneSelect';
import { DayScheduleModal } from '../../components/DayScheduleModal';
import { DAY_BITS } from '../../lib/schedule';
import { toApiTime, validateBreakTimes } from '../../lib/time';
import { routes } from '../../routes';

export function MyLocationPage() {
  const navigate = useNavigate();
  const [location, setLocation] = useState<Location | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    latitude: null as number | null,
    longitude: null as number | null,
    openTime: '09:00',
    closeTime: '18:00',
    breakStartTime: '',
    breakEndTime: '',
    timeZoneId: 'UTC',
    days: new Set<number>(),
  });
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [breakStartError, setBreakStartError] = useState<string | null>(null);
  const [breakEndError, setBreakEndError] = useState<string | null>(null);
  const [showDayScheduleModal, setShowDayScheduleModal] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogLocationsMineGet();
      const loc = data;
      setLocation(loc);
      const days = new Set<number>();
      DAY_BITS.forEach((d) => {
        if ((loc.workingDaysMask & d.bit) !== 0) days.add(d.bit);
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
        days,
      });
      setBreakStartError(null);
      setBreakEndError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load your location');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleDay(bit: number) {
    setForm((f) => {
      const days = new Set(f.days);
      if (days.has(bit)) days.delete(bit);
      else days.add(bit);
      return { ...f, days };
    });
  }

  async function handleSubmit(e: SyntheticEvent) {
    e.preventDefault();
    if (!location) return;

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

      await adminCatalogApi.apiAdminCatalogLocationsIdPut(location.id, {
        name: form.name,
        address: form.address || '',
        latitude: form.latitude,
        longitude: form.longitude,
        openTime: form.openTime,
        closeTime: form.closeTime,
        breakStartTime: breakStart ?? '',
        breakEndTime: breakEnd ?? '',
        workingDaysMask,
        timeZoneId: form.timeZoneId,
        isActive: location.isActive !== false,
      });
      await load();
    } catch (err) {
      setSubmitError(err);
      setError(err instanceof ApiError ? err.message : 'Failed to update your location');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My Location" description="View and edit your location's details." />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <Card>
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        </Card>
      ) : !location ? (
        <Card>
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No location is assigned to your account.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <CardTitle>{location.name}</CardTitle>
              <Badge status={location.isActive === false ? 'Inactive' : 'Active'} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(routes.catalog.locationUsers(location.chainId, location.id))}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1 text-primary" />
                Add User
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(routes.staff.rooms(location.chainId, location.id))}
              >
                <DoorClosed className="h-3.5 w-3.5 mr-1" />
                Rooms
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(routes.calendar({ chainId: location.chainId, locationId: location.id }))}
              >
                <Calendar className="h-3.5 w-3.5 mr-1" />
                Schedule
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDayScheduleModal(true)}
              >
                <Clock className="h-3.5 w-3.5 mr-1" />
                Day Hours
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(routes.catalog.treatments(location.chainId, location.id))}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Treatments
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <TimezoneSelect
                  required
                  label="Time Zone ID"
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
                  {submitting ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {showDayScheduleModal && location && (
        <DayScheduleModal
          locationId={location.id}
          locationName={location.name}
          defaultOpenTime={location.openTime}
          defaultCloseTime={location.closeTime}
          onClose={() => setShowDayScheduleModal(false)}
        />
      )}
    </div>
  );
}

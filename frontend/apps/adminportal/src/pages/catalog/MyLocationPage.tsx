import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { Calendar, DoorClosed, Sparkles, UserPlus } from 'lucide-react';
import { adminCatalogApi, ApiError, getFieldError } from '../../api/client';
import type { Location } from '../../api/types';

const DAY_BITS: { bit: number; label: string }[] = [
  { bit: 1, label: 'Mon' },
  { bit: 2, label: 'Tue' },
  { bit: 4, label: 'Wed' },
  { bit: 8, label: 'Thu' },
  { bit: 16, label: 'Fri' },
  { bit: 32, label: 'Sat' },
  { bit: 64, label: 'Sun' },
];

export function MyLocationPage() {
  const navigate = useNavigate();
  const [location, setLocation] = useState<Location | null>(null);
  const [form, setForm] = useState({
    name: '',
    address: '',
    openTime: '09:00',
    closeTime: '18:00',
    timeZoneId: 'UTC',
    days: new Set<number>(),
  });
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogLocationsMineGet();
      const loc = data as unknown as Location;
      setLocation(loc);
      const days = new Set<number>();
      DAY_BITS.forEach((d) => {
        if ((loc.workingDaysMask & d.bit) !== 0) days.add(d.bit);
      });
      setForm({
        name: loc.name,
        address: loc.address ?? '',
        openTime: loc.openTime,
        closeTime: loc.closeTime,
        timeZoneId: loc.timeZoneId,
        days,
      });
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!location) return;
    setError(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const workingDaysMask = [...form.days].reduce((mask, bit) => mask | bit, 0);
      await adminCatalogApi.apiAdminCatalogLocationsIdPut(location.id, {
        name: form.name,
        address: form.address || null,
        openTime: form.openTime,
        closeTime: form.closeTime,
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
                onClick={() => navigate(`/catalog/locations/users?chainId=${location.chainId}&locationId=${location.id}`)}
              >
                <UserPlus className="h-3.5 w-3.5 mr-1 text-primary" />
                Add User
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/staff/rooms?chainId=${location.chainId}&locationId=${location.id}`)}
              >
                <DoorClosed className="h-3.5 w-3.5 mr-1" />
                Rooms
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/scheduling?chainId=${location.chainId}&locationId=${location.id}`)}
              >
                <Calendar className="h-3.5 w-3.5 mr-1" />
                Schedule
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/catalog/treatments?chainId=${location.chainId}&locationId=${location.id}`)}
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
                <Input
                  required
                  label="Time Zone ID"
                  placeholder="UTC or America/New_York"
                  value={form.timeZoneId}
                  onChange={(e) => setForm({ ...form, timeZoneId: e.target.value })}
                  error={getFieldError(submitError, 'timeZoneId')}
                />
                <Input
                  required
                  type="time"
                  label="Opening Time"
                  value={form.openTime}
                  onChange={(e) => setForm({ ...form, openTime: e.target.value })}
                />
                <Input
                  required
                  type="time"
                  label="Closing Time"
                  value={form.closeTime}
                  onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                  error={getFieldError(submitError, 'closeTime')}
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
    </div>
  );
}

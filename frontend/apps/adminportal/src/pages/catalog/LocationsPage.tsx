import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../../api/client';
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

function emptyForm() {
  return {
    name: '',
    address: '',
    openTime: '09:00',
    closeTime: '18:00',
    timeZoneId: 'UTC',
    days: new Set(DAY_BITS.map((d) => d.bit)),
  };
}

export function LocationsPage() {
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as { id: number }[];
        if (cs.length > 0) setChainId(cs[0].id);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load chains'));
  }, []);

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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (chainId === null) return;
    setError(null);
    setSubmitting(true);
    try {
      const workingDaysMask = [...form.days].reduce((mask, bit) => mask | bit, 0);
      await adminCatalogApi.apiAdminCatalogLocationsPost({
        chainId,
        name: form.name,
        address: form.address || null,
        openTime: form.openTime,
        closeTime: form.closeTime,
        workingDaysMask,
        timeZoneId: form.timeZoneId,
      });
      setForm(emptyForm());
      await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create location');
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
        openTime: loc.openTime,
        closeTime: loc.closeTime,
        workingDaysMask: loc.workingDaysMask,
        timeZoneId: loc.timeZoneId,
        isActive: !loc.isActive,
      });
      if (chainId !== null) await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update location');
    }
  }

  async function handleDelete(loc: Location) {
    if (!window.confirm(`Delete "${loc.name}"? This cannot be undone from the UI.`)) return;
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogLocationsIdDelete(loc.id);
      if (chainId !== null) await loadLocations(chainId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to delete location');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Locations" description="Manage physical salon locations, operating hours, and active status." />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add New Location</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                required
                label="Location Name"
                placeholder="Downtown Salon"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="Address"
                placeholder="123 Main St, Suite 100"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
              <Input
                required
                label="Time Zone ID"
                placeholder="UTC or America/New_York"
                value={form.timeZoneId}
                onChange={(e) => setForm({ ...form, timeZoneId: e.target.value })}
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

            <div className="pt-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Location'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Salon Locations ({locations.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : locations.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No locations configured yet. Add your first location above.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Address</th>
                  <th className="px-6 py-3.5">Hours & Timezone</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {locations.map((l) => (
                  <tr key={l.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{l.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{l.address ?? '-'}</td>
                    <td className="px-6 py-4 font-mono text-muted-foreground">
                      {l.openTime} - {l.closeTime} ({l.timeZoneId})
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={l.isActive === false ? 'Inactive' : 'Active'} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
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
                          onClick={() => handleDelete(l)}
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
    </div>
  );
}

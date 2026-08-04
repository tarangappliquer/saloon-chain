import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../../api/client';
import type { Location, Room } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

export function RoomsPage() {
  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    if (chainId === null) return;
    adminCatalogApi
      .apiAdminCatalogLocationsGet(chainId)
      .then(({ data }) => {
        const locs = data as unknown as Location[];
        setLocations(locs);
        setLocationId(locs.length > 0 ? locs[0].id : null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId]);

  async function loadRooms(id: number) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogRoomsGet(id);
      setRooms(data as unknown as Room[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (locationId !== null) loadRooms(locationId);
    else setRooms([]);
  }, [locationId]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (locationId === null) return;
    setError(null);
    setSubmitting(true);
    try {
      await adminCatalogApi.apiAdminCatalogRoomsPost({ locationId, name });
      setName('');
      await loadRooms(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create room');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(r: Room) {
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogRoomsIdPut(r.id, { name: r.name, isActive: !r.isActive });
      if (locationId !== null) await loadRooms(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update room');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treatment Rooms"
        description="Configure treatment rooms and spaces per location."
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Location:</span>
            <SearchableSelect
              value={String(locationId ?? '')}
              onChange={(v) => setLocationId(Number(v))}
              options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
              className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[180px]"
            />
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Add Room to Selected Location</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-3 items-end max-w-md">
            <Input
              required
              label="Room Name"
              placeholder="e.g. Room 101 or VIP Suite"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
            <Button type="submit" disabled={submitting || locationId === null} className="shrink-0 mb-0.5">
              {submitting ? 'Adding...' : 'Add Room'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Configured Rooms ({rooms.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : rooms.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No rooms configured for this location.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Room Name</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {rooms.map((r) => (
                  <tr key={r.id} className="hover:bg-accent/40 transition">
                    <td className="px-6 py-4 font-semibold text-foreground">{r.name}</td>
                    <td className="px-6 py-4">
                      <Badge status={r.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>
                        {r.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
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

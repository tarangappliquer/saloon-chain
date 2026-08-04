import { useEffect, useState, useCallback, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { Calendar } from 'lucide-react';
import { adminCatalogApi, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { Chain, Location, Room } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

export function RoomsPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const paramChainId = searchParams.get('chainId');
  const paramLocationId = searchParams.get('locationId');

  const [chainId, setChainId] = useState<number | null>(paramChainId ? Number(paramChainId) : null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(paramLocationId ? Number(paramLocationId) : null);

  const [chain, setChain] = useState<Chain | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);

  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadRooms = useCallback(async (locId: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminCatalogApi.apiAdminCatalogRoomsGet(locId);
      setRooms(data as unknown as Room[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    adminCatalogApi
      .apiAdminCatalogChainsGet()
      .then(({ data }) => {
        const cs = data as unknown as Chain[];
        if (cs.length > 0 && chainId === null) {
          setChainId(cs[0].id);
        }
        if (chainId) {
          const found = cs.find((c) => c.id === chainId);
          if (found) setChain(found);
        }
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
        if (locationId === null) {
          const initial = paramLocationId ? Number(paramLocationId) : locs[0]?.id ?? null;
          if (initial !== null) setLocationId(initial);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load locations'));
  }, [chainId, locationId, paramLocationId]);

  useEffect(() => {
    if (locationId !== null) {
      loadRooms(locationId);
    } else {
      setRooms([]);
    }
  }, [locationId, loadRooms]);

  function handleLocationChange(newId: number) {
    setLocationId(newId);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('locationId', String(newId));
        return next;
      },
      { replace: true },
    );
  }

  function handleStartEdit(r: Room) {
    setEditingRoom(r);
    setName(r.name);
    setError(null);
  }

  function handleCancelEdit() {
    setEditingRoom(null);
    setName('');
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!locationId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (editingRoom) {
        await adminCatalogApi.apiAdminCatalogRoomsIdPut(editingRoom.id, { name, isActive: editingRoom.isActive });
      } else {
        await adminCatalogApi.apiAdminCatalogRoomsPost({ locationId, name });
      }
      handleCancelEdit();
      await loadRooms(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Failed to ${editingRoom ? 'update' : 'create'} room`);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(r: Room) {
    if (!locationId) return;
    setError(null);
    try {
      await adminCatalogApi.apiAdminCatalogRoomsIdPut(r.id, { name: r.name, isActive: !r.isActive });
      await loadRooms(locationId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update room');
    }
  }

  const selectedLocation = locations.find((l) => l.id === locationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Treatment Rooms ${selectedLocation ? `— ${selectedLocation.name}` : ''}`}
        description={`Configure treatment rooms and spaces for ${selectedLocation?.name ?? 'the selected location'} under ${chain?.name ?? 'the saloon chain'}.`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {locationId !== null && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate(`/scheduling?chainId=${chainId ?? ''}&locationId=${locationId}`)}
              >
                <Calendar className="h-3.5 w-3.5 mr-1" />
                Schedule Rooms
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(
                  currentUser?.role === 'Manager' ? '/my-location' : chainId ? `/catalog/locations?chainId=${chainId}` : '/catalog/saloons',
                )
              }
            >
              ← Back
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {error}
        </div>
      )}

      {/* Add / Edit Room Card */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>
            {editingRoom
              ? `Edit Room: ${editingRoom.name}`
              : `Add Room to ${selectedLocation?.name ?? 'Selected Location'}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {/* Readonly Saloon Chain Label */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Saloon Chain
                </label>
                <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground">
                  {chain?.name ?? (chainId ? `Chain #${chainId}` : 'Selected Chain')}
                </div>
              </div>

              {/* Location Selector Dropdown */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Select Location
                </label>
                <SearchableSelect
                  value={String(locationId ?? '')}
                  onChange={(v) => handleLocationChange(Number(v))}
                  options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                  disabled={currentUser?.role === 'Manager'}
                  className="rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground"
                />
              </div>

              <Input
                required
                label="Room Name"
                placeholder="e.g. Room 101 or VIP Suite"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button type="submit" disabled={submitting || !locationId} className="font-semibold">
                {submitting ? 'Saving...' : editingRoom ? 'Update Room' : 'Add Room'}
              </Button>
              {editingRoom && (
                <Button type="button" variant="outline" onClick={handleCancelEdit} disabled={submitting}>
                  Cancel Edit
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Rooms Table */}
      <Card>
        <CardHeader className="border-b border-border/50 pb-4">
          <CardTitle>Configured Rooms {selectedLocation ? `for ${selectedLocation.name}` : ''} ({rooms.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : rooms.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No rooms configured for this location yet. Add your first room above.
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
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => handleStartEdit(r)}>
                          Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toggleActive(r)}>
                          {r.isActive ? 'Deactivate' : 'Activate'}
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

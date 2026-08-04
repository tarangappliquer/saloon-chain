import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, LoadingFallback, PageHeader } from '@saloon/ui';
import { adminBookingsApi, adminCatalogApi, ApiError } from '../../api/client';
import { useAuth } from '../../features/auth/AuthContext';
import type { AdminBooking, Location } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BookingsPage() {
  const { user } = useAuth();
  const canCancel =
    user?.role === 'RootSuperAdmin' ||
    user?.role === 'SuperAdmin' ||
    user?.role === 'Admin' ||
    user?.role === 'Manager' ||
    user?.role === 'Receptionist';

  const [chainId, setChainId] = useState<number | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<number | null>(null);
  const [date, setDate] = useState(today());
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

  const loadBookings = useCallback(async () => {
    if (locationId === null) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await adminBookingsApi.apiAdminBookingsGet(locationId, date);
      setBookings(data as unknown as AdminBooking[]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [locationId, date]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  async function handleCancel(id: number) {
    setError(null);
    try {
      await adminBookingsApi.apiAdminBookingsIdCancelPost(id);
      await loadBookings();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel booking');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Location Bookings"
        description="Review and manage customer appointments for any location and date."
        action={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Location:</span>
              <SearchableSelect
                value={String(locationId ?? '')}
                onChange={(v) => setLocationId(Number(v))}
                options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[160px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Date:</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 text-xs min-w-[140px]"
              />
            </div>
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
          <CardTitle>Appointments ({bookings.length})</CardTitle>
        </CardHeader>
        {loading ? (
          <CardContent className="py-8">
            <LoadingFallback />
          </CardContent>
        ) : bookings.length === 0 ? (
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            No bookings found for this location and date.
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                  <th className="px-6 py-3.5">Customer</th>
                  <th className="px-6 py-3.5">Treatments & Schedule</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {bookings.map((b) => (
                  <tr key={b.id} className="hover:bg-accent/40 transition align-top">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-foreground">{b.customerName}</div>
                      <div className="text-muted-foreground text-xs">{b.customerEmail}</div>
                    </td>
                    <td className="px-6 py-4">
                      <ul className="space-y-1.5">
                        {b.treatments.map((t) => (
                          <li key={t.treatmentName} className="flex flex-col">
                            <span className="font-medium text-foreground">{t.treatmentName}</span>
                            {t.startTime && t.endTime && (
                              <span className="text-muted-foreground text-xs font-mono">
                                {new Date(t.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                                {new Date(t.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                {' · '}
                                {t.roomName} · {t.therapistName}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-4">
                      <Badge status={b.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {canCancel && (b.status === 'Draft' || b.status === 'Confirmed') && (
                        <Button variant="danger" size="sm" onClick={() => handleCancel(b.id)}>
                          Cancel Booking
                        </Button>
                      )}
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

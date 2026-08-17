import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingFallback } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../api/client';
import type { ClosureType, LocationClosure } from '../api/types';

type ClosureScope = { kind: 'location'; id: number; name: string } | { kind: 'chain'; id: number; name: string };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ClosuresModal({ scope, onClose }: { scope: ClosureScope; onClose: () => void }) {
  const [closures, setClosures] = useState<LocationClosure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [type, setType] = useState<ClosureType>('Holiday');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function load() {
    setClosures(null);
    setError(null);
    adminCatalogApi
      .apiAdminCatalogClosuresGet(scope.kind === 'location' ? scope.id : undefined, scope.kind === 'chain' ? scope.id : undefined)
      .then(({ data }) => setClosures(data as unknown as LocationClosure[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load closures'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.id]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await adminCatalogApi.apiAdminCatalogClosuresPost({
        locationId: scope.kind === 'location' ? scope.id : null,
        chainId: scope.kind === 'chain' ? scope.id : null,
        fromDate,
        toDate,
        type,
        reason: reason || null,
      });
      setReason('');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to close date range');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    setDeletingId(id);
    try {
      await adminCatalogApi.apiAdminCatalogClosuresIdDelete(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to remove closure');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
      <Card className="w-full max-w-2xl shadow-lift border-border bg-card">
        <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Closures for {scope.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scope.kind === 'chain' ? 'Closes every location in this saloon chain.' : 'Holidays and maintenance days for this location.'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ✕
          </Button>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">From</label>
              <input
                type="date"
                required
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">To</label>
              <input
                type="date"
                required
                min={fromDate}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Reason</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ClosureType)}
                className="rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              >
                <option value="Holiday">Holiday</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="block text-xs font-semibold text-muted-foreground mb-1">Note (optional)</label>
              <input
                type="text"
                placeholder="e.g. New Year's Day"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground"
              />
            </div>
            <Button type="submit" disabled={submitting} className="font-semibold">
              {submitting ? 'Closing...' : 'Close Dates'}
            </Button>
          </form>

          {closures === null ? (
            <div className="py-8">
              <LoadingFallback />
            </div>
          ) : closures.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No closures configured yet.</div>
          ) : (
            <div className="overflow-x-auto max-h-72 divide-y divide-border/50 border-t border-border/50">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                    <th className="px-4 py-2.5">Date</th>
                    {scope.kind === 'chain' && <th className="px-4 py-2.5">Location</th>}
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">Note</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {closures.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/40 transition">
                      <td className="px-4 py-3 font-mono text-foreground">{c.holidayDate.slice(0, 10)}</td>
                      {scope.kind === 'chain' && <td className="px-4 py-3 text-muted-foreground">{c.locationName}</td>}
                      <td className="px-4 py-3">
                        <Badge status={c.type === 'Maintenance' ? 'Inactive' : 'Active'} className="text-[10px] py-0 px-1.5">
                          {c.type}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{c.reason ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" disabled={deletingId === c.id} onClick={() => handleDelete(c.id)}>
                          {deletingId === c.id ? 'Removing...' : 'Remove'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end border-t border-border/50 pt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

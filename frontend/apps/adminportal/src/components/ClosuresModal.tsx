import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingFallback } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../api/client';
import type { ClosureType, LocationClosure } from '../api/types';

type ClosureScope = { kind: 'location'; id: number; name: string } | { kind: 'chain'; id: number; name: string };

interface ClosureGroup {
  key: string;
  locationId: number;
  locationName: string;
  type: ClosureType;
  reason: string | null;
  fromDate: string;
  toDate: string;
  ids: number[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Closures are stored one row per date (see sp_Admin_CreateLocationClosures) so a date-range
// closure survives as N rows -- group consecutive same-location/type/reason rows back into a
// single From-To entry for display, so an admin sees "one entry" per range instead of per date.
function groupClosures(rows: LocationClosure[]): ClosureGroup[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.locationId !== b.locationId) return a.locationId - b.locationId;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    if ((a.reason ?? '') !== (b.reason ?? '')) return (a.reason ?? '').localeCompare(b.reason ?? '');
    return a.holidayDate.localeCompare(b.holidayDate);
  });

  const groups: ClosureGroup[] = [];
  for (const row of sorted) {
    const date = row.holidayDate.slice(0, 10);
    const last = groups[groups.length - 1];
    const isContinuation =
      last &&
      last.locationId === row.locationId &&
      last.type === row.type &&
      (last.reason ?? '') === (row.reason ?? '') &&
      addDaysIso(last.toDate, 1) === date;

    if (isContinuation) {
      last.toDate = date;
      last.ids.push(row.id);
    } else {
      groups.push({
        key: `${row.locationId}|${row.type}|${row.reason ?? ''}|${date}`,
        locationId: row.locationId,
        locationName: row.locationName,
        type: row.type,
        reason: row.reason,
        fromDate: date,
        toDate: date,
        ids: [row.id],
      });
    }
  }
  return groups;
}

export function ClosuresModal({
  scope,
  applyToAllChainId,
  applyToAllChainName,
  onClose,
}: {
  scope: ClosureScope;
  // Only meaningful when scope.kind === 'location' -- lets the caller offer an "apply to every
  // location in this saloon" shortcut inline instead of forcing a separate chain-level closures
  // flow. Omitted entirely for roles that can't close a whole chain (SaloonsPage's chain-scoped
  // modal has no need for this either, since it's already whole-chain).
  applyToAllChainId?: number;
  applyToAllChainName?: string;
  onClose: () => void;
}) {
  const [closures, setClosures] = useState<LocationClosure[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(todayIso());
  const [toDate, setToDate] = useState(todayIso());
  const [type, setType] = useState<ClosureType>('Holiday');
  const [reason, setReason] = useState('');
  const [applyToAll, setApplyToAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ClosureGroup | null>(null);

  function load() {
    setClosures(null);
    setError(null);
    setSelectedKeys(new Set());
    adminCatalogApi
      .apiAdminCatalogClosuresGet(scope.kind === 'location' ? scope.id : undefined, scope.kind === 'chain' ? scope.id : undefined)
      .then(({ data }) => setClosures(data as unknown as LocationClosure[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load closures'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.kind, scope.id]);

  const yearGroups = useMemo(() => {
    const rows = (closures ?? []).filter((c) => c.holidayDate.slice(0, 4) === String(year));
    return groupClosures(rows);
  }, [closures, year]);

  function resetForm() {
    setFromDate(todayIso());
    setToDate(todayIso());
    setType('Holiday');
    setReason('');
    setApplyToAll(false);
    setEditingGroup(null);
  }

  function startEdit(group: ClosureGroup) {
    setEditingGroup(group);
    setFromDate(group.fromDate);
    setToDate(group.toDate);
    setType(group.type);
    setReason(group.reason ?? '');
    setApplyToAll(false);
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (editingGroup) {
        // Simplest correct "edit": remove the old range's rows, then re-create with the new
        // range/type/reason -- reuses the same create path (and its booking-conflict check) rather
        // than diffing individual dates.
        await Promise.all(editingGroup.ids.map((id) => adminCatalogApi.apiAdminCatalogClosuresIdDelete(id)));
        await adminCatalogApi.apiAdminCatalogClosuresPost({
          locationId: editingGroup.locationId,
          chainId: null,
          fromDate,
          toDate,
          type,
          reason: reason || null,
        });
      } else {
        const useChainScope = scope.kind === 'chain' || (applyToAll && applyToAllChainId !== undefined);
        await adminCatalogApi.apiAdminCatalogClosuresPost({
          locationId: useChainScope ? null : scope.id,
          chainId: useChainScope ? (scope.kind === 'chain' ? scope.id : applyToAllChainId!) : null,
          fromDate,
          toDate,
          type,
          reason: reason || null,
        });
      }
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : editingGroup ? 'Failed to update closure' : 'Failed to close date range');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteGroup(group: ClosureGroup) {
    setError(null);
    setDeletingKey(group.key);
    try {
      const results = await Promise.allSettled(group.ids.map((id) => adminCatalogApi.apiAdminCatalogClosuresIdDelete(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) setError(`Failed to remove ${failed} of ${group.ids.length} date(s) in this range.`);
      load();
    } finally {
      setDeletingKey(null);
    }
  }

  function toggleSelected(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedKeys((prev) => (prev.size === yearGroups.length ? new Set() : new Set(yearGroups.map((g) => g.key))));
  }

  async function handleDeleteSelected() {
    if (selectedKeys.size === 0) return;
    setError(null);
    setBulkDeleting(true);
    try {
      const ids = yearGroups.filter((g) => selectedKeys.has(g.key)).flatMap((g) => g.ids);
      const results = await Promise.allSettled(ids.map((id) => adminCatalogApi.apiAdminCatalogClosuresIdDelete(id)));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) setError(`Failed to remove ${failed} of ${ids.length} date(s).`);
      load();
    } finally {
      setBulkDeleting(false);
    }
  }

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => current - 1 + i);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
      <Card className="w-full max-w-3xl shadow-lift border-border bg-card max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Closures for {scope.name}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              {scope.kind === 'chain' || applyToAll
                ? 'Closes every location in this saloon chain.'
                : 'Holidays and maintenance days for this location.'}
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

          {editingGroup && (
            <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary flex items-center justify-between">
              Editing {editingGroup.locationName}'s {editingGroup.fromDate === editingGroup.toDate ? editingGroup.fromDate : `${editingGroup.fromDate} to ${editingGroup.toDate}`} closure
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Cancel Edit
              </Button>
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
              {submitting ? 'Saving...' : editingGroup ? 'Save Changes' : 'Close Dates'}
            </Button>
          </form>

          {!editingGroup && scope.kind === 'location' && applyToAllChainId !== undefined && (
            <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={applyToAll}
                onChange={(e) => setApplyToAll(e.target.checked)}
                className="rounded-sm border-input text-primary focus:ring-primary h-4 w-4"
              />
              Apply to all locations in {applyToAllChainName ?? 'this saloon'}
            </label>
          )}

          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Year</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)}>
                ←
              </Button>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-lg border border-input bg-card px-3 py-1.5 text-xs font-bold text-foreground"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)}>
                →
              </Button>
            </div>
          </div>

          {closures === null ? (
            <div className="py-8">
              <LoadingFallback />
            </div>
          ) : yearGroups.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No closures in {year}.</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedKeys.size > 0 && selectedKeys.size === yearGroups.length}
                    onChange={toggleSelectAll}
                    className="rounded-sm border-input text-primary focus:ring-primary h-4 w-4"
                  />
                  Select all ({yearGroups.length})
                </label>
                {selectedKeys.size > 0 && (
                  <Button variant="danger" size="sm" disabled={bulkDeleting} onClick={handleDeleteSelected}>
                    {bulkDeleting ? 'Removing...' : `Remove Selected (${selectedKeys.size})`}
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto max-h-80 divide-y divide-border/50 border-t border-border/50">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-muted-foreground font-semibold uppercase tracking-wider">
                      <th className="px-3 py-2.5 w-8"></th>
                      <th className="px-3 py-2.5">Dates</th>
                      {scope.kind === 'chain' && <th className="px-3 py-2.5">Location</th>}
                      <th className="px-3 py-2.5">Type</th>
                      <th className="px-3 py-2.5">Note</th>
                      <th className="px-3 py-2.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {yearGroups.map((g) => (
                      <tr key={g.key} className="hover:bg-accent/40 transition">
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(g.key)}
                            onChange={() => toggleSelected(g.key)}
                            className="rounded-sm border-input text-primary focus:ring-primary h-4 w-4"
                          />
                        </td>
                        <td className="px-3 py-3 font-mono text-foreground">
                          {g.fromDate === g.toDate ? g.fromDate : `${g.fromDate} to ${g.toDate}`}
                        </td>
                        {scope.kind === 'chain' && <td className="px-3 py-3 text-muted-foreground">{g.locationName}</td>}
                        <td className="px-3 py-3">
                          <Badge status={g.type === 'Maintenance' ? 'Inactive' : 'Active'} className="text-[10px] py-0 px-1.5">
                            {g.type}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">{g.reason ?? '-'}</td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          <Button variant="ghost" size="sm" onClick={() => startEdit(g)}>
                            Edit
                          </Button>
                          <Button variant="ghost" size="sm" disabled={deletingKey === g.key} onClick={() => handleDeleteGroup(g)}>
                            {deletingKey === g.key ? 'Removing...' : 'Remove'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

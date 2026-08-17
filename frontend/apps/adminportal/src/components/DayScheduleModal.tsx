import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, LoadingFallback } from '@saloon/ui';
import { adminCatalogApi, ApiError } from '../api/client';
import type { LocationDaySchedule } from '../api/types';
import { WEEK_DAYS } from '../lib/schedule';
import { toApiTime } from '../lib/time';
import { resolveEffectiveTo, describeEffectiveWindow, type EffectiveMode } from '../lib/effectiveDate';
import { EffectiveDateFields } from './EffectiveDateFields';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatWindowHours(h: Pick<LocationDaySchedule, 'openTime' | 'closeTime' | 'isClosed'>, fallbackOpen: string, fallbackClose: string) {
  if (h.isClosed) return 'Closed';
  return `${(h.openTime ?? fallbackOpen).slice(0, 5)} - ${(h.closeTime ?? fallbackClose).slice(0, 5)}`;
}

export function DayScheduleModal({
  locationId,
  locationName,
  defaultOpenTime,
  defaultCloseTime,
  onClose,
}: {
  locationId: number;
  locationName: string;
  defaultOpenTime: string;
  defaultCloseTime: string;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<LocationDaySchedule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingForBit, setAddingForBit] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({
    openTime: '09:00',
    closeTime: '18:00',
    isClosed: false,
    mode: 'from' as EffectiveMode,
    effectiveFrom: todayIso(),
    effectiveTo: todayIso(),
  });
  const [timeError, setTimeError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  function load() {
    setHistory(null);
    setError(null);
    adminCatalogApi
      .apiAdminCatalogLocationsIdDayScheduleGet(locationId)
      .then(({ data }) => setHistory(data as unknown as LocationDaySchedule[]))
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Failed to load day schedule'));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId]);

  function openAddForm(bit: number) {
    setAddingForBit(bit);
    setEditingId(null);
    setForm({
      openTime: defaultOpenTime.slice(0, 5),
      closeTime: defaultCloseTime.slice(0, 5),
      isClosed: false,
      mode: 'from',
      effectiveFrom: todayIso(),
      effectiveTo: todayIso(),
    });
    setTimeError(null);
    setError(null);
  }

  function openEditForm(entry: LocationDaySchedule) {
    setAddingForBit(entry.dayBit);
    setEditingId(entry.id);
    const from = entry.effectiveFrom.slice(0, 10);
    const to = entry.effectiveTo?.slice(0, 10) ?? from;
    setForm({
      openTime: entry.openTime?.slice(0, 5) ?? defaultOpenTime.slice(0, 5),
      closeTime: entry.closeTime?.slice(0, 5) ?? defaultCloseTime.slice(0, 5),
      isClosed: entry.isClosed,
      mode: entry.effectiveTo === null ? 'from' : entry.effectiveTo === entry.effectiveFrom ? 'single' : 'range',
      effectiveFrom: from,
      effectiveTo: to,
    });
    setTimeError(null);
    setError(null);
  }

  function closeForm() {
    setAddingForBit(null);
    setEditingId(null);
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (addingForBit === null) return;
    setError(null);
    setTimeError(null);

    if (!form.isClosed && form.closeTime <= form.openTime) {
      setTimeError('Close time must be after open time.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        dayBit: addingForBit,
        openTime: form.isClosed ? null : toApiTime(form.openTime)!,
        closeTime: form.isClosed ? null : toApiTime(form.closeTime)!,
        isClosed: form.isClosed,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: resolveEffectiveTo(form.mode, form.effectiveFrom, form.effectiveTo),
      };
      if (editingId !== null) {
        await adminCatalogApi.apiAdminCatalogLocationsIdDayScheduleScheduleIdPut(locationId, editingId, payload);
      } else {
        await adminCatalogApi.apiAdminCatalogLocationsIdDaySchedulePost(locationId, payload);
      }
      closeForm();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : editingId !== null ? 'Failed to update scheduled hours' : 'Failed to schedule hours');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    setError(null);
    setDeletingId(id);
    try {
      await adminCatalogApi.apiAdminCatalogLocationsIdDayScheduleScheduleIdDelete(locationId, id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to cancel scheduled hours');
    } finally {
      setDeletingId(null);
    }
  }

  const today = todayIso();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
      <Card className="w-full max-w-2xl shadow-lift border-border bg-card max-h-[90vh] overflow-y-auto">
        <CardHeader className="border-b border-border/50 pb-4 flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Day Hours for {locationName}</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Schedule an hours or closed-day change for a single date, a date range, or effective from a date onward.
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

          {history === null ? (
            <div className="py-8">
              <LoadingFallback />
            </div>
          ) : (
            <div className="space-y-3">
              {WEEK_DAYS.map((d) => {
                const dayRows = [...history.filter((h) => h.dayBit === d.bit)].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
                const current = [...dayRows].reverse().find((h) => h.effectiveFrom <= today);
                const upcoming = dayRows.filter((h) => h.effectiveFrom > today);

                return (
                  <div key={d.bit} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-foreground">{d.label}</span>
                        <span className="ml-2 text-xs text-muted-foreground font-mono">
                          {current
                            ? formatWindowHours(current, defaultOpenTime, defaultCloseTime)
                            : `${defaultOpenTime.slice(0, 5)} - ${defaultCloseTime.slice(0, 5)} (default)`}
                        </span>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => openAddForm(d.bit)}>
                        + Schedule Change
                      </Button>
                    </div>

                    {upcoming.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {upcoming.map((u) => (
                          <div key={u.id} className="flex items-center justify-between rounded bg-amber-500/10 border border-amber-500/30 px-2 py-1 text-[11px]">
                            <span>
                              <Badge status="Inactive" className="text-[10px] py-0 px-1.5 mr-1">
                                Upcoming
                              </Badge>
                              {formatWindowHours(u, defaultOpenTime, defaultCloseTime)} ({describeEffectiveWindow(u.effectiveFrom.slice(0, 10), u.effectiveTo?.slice(0, 10) ?? null)})
                            </span>
                            <span className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditForm(u)}>
                                Edit
                              </Button>
                              <Button variant="ghost" size="sm" disabled={deletingId === u.id} onClick={() => handleDelete(u.id)}>
                                {deletingId === u.id ? 'Cancelling...' : 'Cancel'}
                              </Button>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {addingForBit === d.bit && (
                      <form onSubmit={handleSave} className="mt-3 space-y-3 border-t border-border/50 pt-3">
                        {editingId !== null && (
                          <p className="text-[11px] font-semibold text-primary">Editing scheduled change</p>
                        )}
                        <label className="flex items-center gap-2 text-xs font-semibold text-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.isClosed}
                            onChange={(e) => setForm({ ...form, isClosed: e.target.checked })}
                            className="rounded-sm border-input text-primary focus:ring-primary h-4 w-4"
                          />
                          Closed all day
                        </label>

                        {!form.isClosed && (
                          <div className="flex flex-wrap items-end gap-2">
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Open</label>
                              <input
                                type="time"
                                required
                                value={form.openTime}
                                onChange={(e) => setForm({ ...form, openTime: e.target.value })}
                                className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-muted-foreground mb-1">Close</label>
                              <input
                                type="time"
                                required
                                value={form.closeTime}
                                onChange={(e) => setForm({ ...form, closeTime: e.target.value })}
                                className="rounded-lg border border-input bg-card px-2 py-1.5 text-xs text-foreground"
                              />
                            </div>
                          </div>
                        )}
                        {timeError && <p className="text-xs font-medium text-destructive">{timeError}</p>}

                        <EffectiveDateFields
                          mode={form.mode}
                          onModeChange={(mode) => setForm({ ...form, mode })}
                          fromDate={form.effectiveFrom}
                          onFromDateChange={(v) => setForm({ ...form, effectiveFrom: v })}
                          toDate={form.effectiveTo}
                          onToDateChange={(v) => setForm({ ...form, effectiveTo: v })}
                          minDate={today}
                        />

                        <div className="flex items-center gap-2">
                          <Button type="submit" size="sm" disabled={submitting}>
                            {submitting ? 'Saving...' : 'Save'}
                          </Button>
                          <Button type="button" variant="outline" size="sm" onClick={closeForm} disabled={submitting}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
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

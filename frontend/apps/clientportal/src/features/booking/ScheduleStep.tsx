import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@saloon/ui';
import { AlertTriangle, Info, MapPin, Store } from 'lucide-react';
import { bookingApi, catalogApi } from '../../api/client';
import type { Treatment } from '../../api/types';
import { useAuth } from '../auth/AuthContext';
import { useBookingContext } from './bookingContext';
import { routes } from '../../routes';
import { MonthYearPicker } from './MonthYearPicker';
import { SlotPicker } from './SlotPicker';
import { TreatmentBar } from './TreatmentBar';
import { useAvailabilityStream } from './useAvailabilityStream';
import { useBookingFlow } from './useBookingFlow';

function formatDateLabel(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const [year, month, day] = parts;
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function ScheduleStep() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isEmulated = user?.isEmulated ?? false;

  const flow = useBookingFlow(Number(bookingId));
  const { state, loadDates, loadSlots } = flow;
  const { booking } = state;
  const locationId = booking?.locationId ?? null;

  // Scoped to the booking's own location, not BookPage context's `treatments` -- see SummaryStep
  // for why (BookPage's selector tracks the ambient "start a new booking" location, not this
  // booking's fixed one). saloonName/locationName are cosmetic display text with a fallback to
  // booking.locationName below, so reusing BookPage's resolution for those is safe.
  const { saloonName, locationName: ctxLocationName } = useBookingContext();
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  useEffect(() => {
    if (!locationId) return;
    let isMounted = true;
    catalogApi.apiCatalogTreatmentsGet(locationId).then(({ data }) => {
      if (isMounted) setTreatments(data as unknown as Treatment[]);
    });
    return () => {
      isMounted = false;
    };
  }, [locationId]);

  const [date, setDate] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [pendingTreatment, setPendingTreatment] = useState<{
    id: number;
    name: string;
    alternativeDate: string | null;
  } | null>(null);

  const prevTreatmentIdsRef = useRef<string>('');

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const allowedDates = state.dates.filter((d) => (isEmulated ? d >= todayStr : d > todayStr));

  const treatmentIdsKey = booking?.treatments.map((t) => t.treatmentId).join(',') ?? '';

  useEffect(() => {
    if (allowedDates.length === 0) return;
    if (!date || !allowedDates.includes(date)) {
      const scheduledDate = booking?.treatments.find((t) => t.startTime)?.startTime?.slice(0, 10);
      let targetDate: string;
      if (scheduledDate && allowedDates.includes(scheduledDate)) {
        targetDate = scheduledDate;
      } else {
        targetDate = allowedDates[0];
      }

      if (date && date !== targetDate && prevTreatmentIdsRef.current !== treatmentIdsKey) {
        setNoticeMessage(`Selected date adjusted to ${formatDateLabel(targetDate)} to fit updated treatments.`);
      }
      setDate(targetDate);
    }
    prevTreatmentIdsRef.current = treatmentIdsKey;
  }, [allowedDates, date, booking, treatmentIdsKey]);

  useEffect(() => {
    if (state.restoring) return;
    if (!booking) navigate(routes.book.root, { replace: true });
  }, [state.restoring, booking, navigate]);

  useEffect(() => {
    if (state.restoring || !booking || !locationId) return;
    const tIds = booking.treatments.map((t) => t.treatmentId);
    loadDates(locationId, tIds, Number(bookingId));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state.restoring, locationId, treatmentIdsKey, loadDates, bookingId]);

  useEffect(() => {
    if (!booking || !locationId || !date) return;
    const tIds = booking.treatments.map((t) => t.treatmentId);
    loadSlots(locationId, date, tIds);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [treatmentIdsKey, locationId, date, loadSlots]);

  const handleRealtimeUpdate = () => {
    if (booking && locationId) {
      const tIds = booking.treatments.map((t) => t.treatmentId);
      loadDates(locationId, tIds, Number(bookingId));
      if (date) {
        loadSlots(locationId, date, tIds);
      }
    }
  };
  useAvailabilityStream(locationId, date, handleRealtimeUpdate);

  const handleMonthYearChange = useCallback(
    (year: number, month: number) => {
      if (!booking || !locationId) return;
      const tIds = booking.treatments.map((t) => t.treatmentId);
      const firstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
      const lastDayNum = new Date(year, month + 1, 0).getDate();
      const lastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDayNum).padStart(2, '0')}`;
      loadDates(locationId, tIds, Number(bookingId), firstDay, lastDay);
    },
    [booking, locationId, bookingId, loadDates],
  );

  if (!booking) return null;

  function pickDate(d: string) {
    setNoticeMessage(null);
    setDate(d);
  }

  const handleAddTreatment = async (treatmentId: number) => {
    const targetTreatment = treatments.find((t) => t.id === treatmentId);
    const treatmentName = targetTreatment?.name ?? 'Treatment';

    if (date && locationId) {
      try {
        const { data: slots } = await bookingApi.apiBookingAvailableSlotsGet(
          locationId,
          String(treatmentId),
          date,
          Number(bookingId)
        );

        if (!slots || slots.length === 0) {
          const currentTIds = booking.treatments.map((t) => t.treatmentId);
          const combinedTIds = [...currentTIds, treatmentId];
          const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30);
          const to = `${toDate.getFullYear()}-${String(toDate.getMonth() + 1).padStart(2, '0')}-${String(toDate.getDate()).padStart(2, '0')}`;

          const { data: openDates } = await bookingApi.apiBookingAvailableDatesGet(
            locationId,
            from,
            to,
            combinedTIds.join(','),
            Number(bookingId)
          );

          const allowedAltDates = openDates.filter((d) => (isEmulated ? d >= todayStr : d > todayStr));
          const altDate = allowedAltDates.find((d) => d !== date) ?? allowedAltDates[0] ?? null;

          setPendingTreatment({
            id: treatmentId,
            name: treatmentName,
            alternativeDate: altDate,
          });
          return;
        }
      } catch (err) {
        console.error('Failed to validate treatment slots', err);
      }
    }

    await flow.addTreatment(treatmentId);
  };

  const confirmSwitchAndAdd = async () => {
    if (!pendingTreatment) return;
    const { id, alternativeDate } = pendingTreatment;
    setPendingTreatment(null);
    if (alternativeDate) {
      setDate(alternativeDate);
    }
    await flow.addTreatment(id);
  };

  const invalidLines = booking.treatments.map((line) => {
    const slots = state.slotsByTreatment[line.treatmentId] ?? [];
    const hasSlots = slots.length > 0;
    const hasSelectedSlot = line.startTime !== null;

    if (!date) {
      return { line, reason: 'No date selected' };
    }
    if (!hasSlots && !state.loading) {
      return { line, reason: 'No slots available on this date' };
    }
    if (hasSlots && !hasSelectedSlot) {
      return { line, reason: 'No time slot selected' };
    }
    return null;
  }).filter(Boolean) as { line: (typeof booking.treatments)[0]; reason: string }[];

  const canContinue = date && invalidLines.length === 0;

  return (
    <div className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {state.error}
        </div>
      )}

      {noticeMessage && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs font-semibold text-sky-800 dark:text-sky-200">
          <Info className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
          <span>{noticeMessage}</span>
        </div>
      )}

      {/* Saloon & Location Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-card p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/15 p-2.5 text-primary border border-primary/20 shadow-2xs">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-primary">
                {saloonName || 'Saloon'}
              </span>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-[11px] font-semibold text-muted-foreground">
                Booking #{booking.id}
              </span>
            </div>
            <h2 className="font-display text-base font-extrabold text-foreground">
              {ctxLocationName || booking.locationName}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground bg-card/80 border border-border/80 px-3 py-1.5 rounded-xl shadow-2xs">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span>{ctxLocationName || booking.locationName}</span>
        </div>
      </div>

      <TreatmentBar
        treatments={treatments}
        lines={booking.treatments}
        onAdd={handleAddTreatment}
        onRemove={flow.removeTreatment}
        loading={state.loading}
      />

      <MonthYearPicker
        dates={state.dates}
        selectedDate={date}
        onPick={pickDate}
        loading={state.loading}
        isEmulated={isEmulated}
        onMonthYearChange={handleMonthYearChange}
      />

      {date && (
        <SlotPicker
          lines={booking.treatments}
          slotsByTreatment={state.slotsByTreatment}
          onSelect={flow.selectSlot}
          onRemove={flow.removeTreatment}
          loading={state.loading}
        />
      )}

      {invalidLines.length > 0 && date && !state.loading && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-xs space-y-2 text-destructive">
          <p className="font-bold text-sm">Please resolve the following before continuing:</p>
          <ul className="list-disc list-inside space-y-1 text-foreground/90 pl-1">
            {invalidLines.map(({ line, reason }) => (
              <li key={line.treatmentId}>
                <span className="font-semibold">{line.treatmentName}</span>: {reason}.{' '}
                {reason.includes('No slots available')
                  ? 'Please select another date on the calendar or remove this treatment.'
                  : 'Please select an available time slot.'}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        type="button"
        disabled={!canContinue}
        onClick={() => navigate(routes.book.summary(bookingId!))}
        className="w-full h-11 text-base font-semibold cursor-pointer disabled:cursor-not-allowed"
      >
        Continue to Summary
      </Button>

      {/* Validation Error Popup Modal */}
      {pendingTreatment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="rounded-full bg-amber-500/15 p-2 border border-amber-500/30">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 className="font-display text-base font-bold text-foreground">
                No Available Slots on {date ? formatDateLabel(date) : 'Selected Date'}
              </h3>
            </div>

            <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
              <p>
                <strong className="text-foreground">{pendingTreatment.name}</strong> cannot be added for{' '}
                <strong className="text-foreground">{date ? formatDateLabel(date) : 'this date'}</strong> because there are no available time slots on this day.
              </p>
              {pendingTreatment.alternativeDate ? (
                <p>
                  Would you like to switch to{' '}
                  <strong className="text-primary font-bold">{formatDateLabel(pendingTreatment.alternativeDate)}</strong> where all selected treatments can be scheduled together?
                </p>
              ) : (
                <p>
                  There are currently no open dates available that fit all selected treatments together.
                </p>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-border/50">
              <Button type="button" variant="outline" onClick={() => setPendingTreatment(null)} className="text-xs font-semibold cursor-pointer">
                Cancel
              </Button>
              {pendingTreatment.alternativeDate && (
                <Button type="button" onClick={confirmSwitchAndAdd} className="text-xs font-semibold cursor-pointer">
                  Switch Date & Add Treatment
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

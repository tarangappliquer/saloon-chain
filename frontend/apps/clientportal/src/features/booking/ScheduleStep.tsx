import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@saloon/ui';
import { catalogApi } from '../../api/client';
import type { Treatment } from '../../api/types';
import { DatePicker } from './DatePicker';
import { SlotPicker } from './SlotPicker';
import { TreatmentBar } from './TreatmentBar';
import { useAvailabilityStream } from './useAvailabilityStream';
import { useBookingFlow } from './useBookingFlow';

export function ScheduleStep() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const flow = useBookingFlow(Number(bookingId));
  const { state, loadDates, loadSlots } = flow;
  const { booking } = state;
  const locationId = booking?.locationId ?? null;

  const [treatments, setTreatments] = useState<Treatment[]>([]);
  useEffect(() => {
    if (!locationId) return;
    catalogApi.apiCatalogTreatmentsGet(locationId).then(({ data }) => setTreatments(data as unknown as Treatment[]));
  }, [locationId]);

  const [date, setDate] = useState<string | null>(null);
  useEffect(() => {
    if (date || !booking) return;
    const scheduled = booking.treatments.find((t) => t.startTime);
    if (scheduled?.startTime) setDate(scheduled.startTime.slice(0, 10));
  }, [date, booking]);

  useEffect(() => {
    if (state.restoring) return;
    if (!booking) navigate('/book', { replace: true });
  }, [state.restoring, booking, navigate]);

  useEffect(() => {
    if (state.restoring || !booking || !locationId) return;
    if (state.dates.length === 0 && !state.loading) loadDates(locationId);
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [state.restoring, booking, locationId, state.dates.length, state.loading]);

  const treatmentIdsKey = booking?.treatments.map((t) => t.treatmentId).join(',') ?? '';

  useEffect(() => {
    if (!booking || !locationId || !date) return;
    loadSlots(locationId, date, booking.treatments.map((t) => t.treatmentId));
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [treatmentIdsKey, locationId, date]);

  const reloadSlots = () => {
    if (booking && locationId && date) loadSlots(locationId, date, booking.treatments.map((t) => t.treatmentId));
  };
  useAvailabilityStream(locationId, date, reloadSlots);

  if (!booking) return null;

  function pickDate(d: string) {
    setDate(d);
  }

  return (
    <div className="space-y-6">
      {state.error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {state.error}
        </div>
      )}

      <TreatmentBar
        treatments={treatments}
        lines={booking.treatments}
        onAdd={flow.addTreatment}
        onRemove={flow.removeTreatment}
        loading={state.loading}
      />

      <DatePicker dates={state.dates} selectedDate={date} onPick={pickDate} loading={state.loading} />

      {date && (
        <SlotPicker
          lines={booking.treatments}
          slotsByTreatment={state.slotsByTreatment}
          onSelect={flow.selectSlot}
          loading={state.loading}
        />
      )}

      <Button
        type="button"
        disabled={!flow.allCovered}
        onClick={() => navigate(`/book/${bookingId}/summary`)}
        className="w-full h-11 text-base font-semibold"
      >
        Continue to Summary
      </Button>
    </div>
  );
}

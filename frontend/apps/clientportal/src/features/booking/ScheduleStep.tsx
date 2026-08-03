import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  const { state } = flow;
  const { booking } = state;
  // The booking's own location is authoritative once a draft exists -- NOT whatever chain/location
  // happens to be selected in the BookPage layout's "start a new booking" picker, which resets to
  // the alphabetically-first chain on every reload and would silently desync from this booking.
  const locationId = booking?.locationId ?? null;

  // Catalog scoped to the booking's own location, for the "+ Add treatment" dropdown -- fetched
  // here rather than reusing BookPage's context list, for the same reason (that list tracks the
  // ambient selector, not this booking).
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  useEffect(() => {
    if (!locationId) return;
    catalogApi.apiCatalogTreatmentsGet(locationId).then(({ data }) => setTreatments(data as unknown as Treatment[]));
  }, [locationId]);

  // The chosen date isn't part of the server model (each treatment carries its own time) -- it's
  // just "what day is the grid showing". Derive a starting point from any already-scheduled line
  // (e.g. after a refresh) so the grids don't come up empty for no reason; otherwise the customer
  // picks fresh.
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
    if (state.dates.length === 0 && !state.loading) flow.loadDates(locationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.restoring, booking, locationId, state.dates.length, state.loading]);

  useEffect(() => {
    if (!booking || !locationId || !date) return;
    flow.loadSlots(locationId, date, booking.treatments.map((t) => t.treatmentId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.treatments.map((t) => t.treatmentId).join(','), locationId, date]);

  const reloadSlots = () => {
    if (booking && locationId && date) flow.loadSlots(locationId, date, booking.treatments.map((t) => t.treatmentId));
  };
  useAvailabilityStream(locationId, date, reloadSlots);

  if (!booking) return null;

  function pickDate(d: string) {
    setDate(d);
  }

  return (
    <div className="space-y-6">
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

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

      <button
        type="button"
        disabled={!flow.allCovered}
        onClick={() => navigate(`/book/${bookingId}/summary`)}
        className="w-full rounded-lg bg-purple-600 py-2.5 font-medium text-white disabled:opacity-40"
      >
        Book
      </button>
    </div>
  );
}

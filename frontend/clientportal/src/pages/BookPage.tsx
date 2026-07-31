import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Chain, Location, Treatment } from '../api/types';
import { BookingSummary } from '../features/booking/BookingSummary';
import { DatePicker } from '../features/booking/DatePicker';
import { SlotPicker } from '../features/booking/SlotPicker';
import { TreatmentPicker } from '../features/booking/TreatmentPicker';
import { useAvailabilityStream } from '../features/booking/useAvailabilityStream';
import { useBookingFlow } from '../features/booking/useBookingFlow';

export function BookPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);

  const flow = useBookingFlow(locationId);

  useEffect(() => {
    api.get<Chain[]>('/api/catalog/chains').then((cs) => {
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!chainId) return;
    api.get<Location[]>(`/api/catalog/locations?chainId=${chainId}`).then((locs) => {
      setLocations(locs);
      if (locs.length > 0) setLocationId(locs[0].id);
    });
  }, [chainId]);

  useEffect(() => {
    if (!locationId) return;
    api.get<Treatment[]>(`/api/catalog/treatments?locationId=${locationId}`).then(setTreatments);
  }, [locationId]);

  const refetchSlots = useCallback(() => {
    if (flow.state.step === 'slot' && flow.state.selectedDate) flow.pickDate(flow.state.selectedDate);
  }, [flow]);

  useAvailabilityStream(locationId, flow.state.selectedDate, refetchSlots);

  if (flow.state.step === 'confirmed') {
    return (
      <div className="mx-auto mt-16 max-w-md px-4 text-center">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Booked!</h1>
        <p className="mt-2 text-gray-500 dark:text-gray-400">See it under My Bookings.</p>
        <button
          type="button"
          onClick={flow.reset}
          className="mt-6 rounded-lg bg-purple-600 px-4 py-2 font-medium text-white"
        >
          Book another
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Book a treatment</h1>

      {locations.length > 1 && (
        <select
          value={locationId ?? ''}
          onChange={(e) => setLocationId(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}

      {flow.state.error && <p className="text-sm text-red-600">{flow.state.error}</p>}

      {flow.state.step === 'treatments' && (
        <TreatmentPicker
          treatments={treatments}
          selectedIds={flow.state.selectedTreatmentIds}
          onToggle={flow.toggleTreatment}
          onNext={flow.loadDates}
          loading={flow.state.loading}
        />
      )}

      {flow.state.step === 'date' && (
        <DatePicker
          dates={flow.state.dates}
          selectedDate={flow.state.selectedDate}
          onPick={flow.pickDate}
          loading={flow.state.loading}
        />
      )}

      {flow.state.step === 'slot' && (
        <SlotPicker slots={flow.state.slots} onSelect={flow.selectSlot} loading={flow.state.loading} />
      )}

      {flow.state.step === 'held' && flow.state.hold && flow.state.heldSlot && (
        <BookingSummary
          slot={flow.state.heldSlot}
          expiresAt={flow.state.hold.expiresAt}
          onConfirm={flow.confirm}
          onCancel={flow.cancelHold}
          loading={flow.state.loading}
        />
      )}
    </div>
  );
}

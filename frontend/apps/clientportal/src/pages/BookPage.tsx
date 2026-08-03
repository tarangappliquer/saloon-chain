import { useCallback, useEffect, useState } from 'react';
import { catalogApi } from '../api/client';
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
    catalogApi.apiCatalogChainsGet().then(({ data }) => {
      const cs = data as unknown as Chain[];
      if (cs.length > 0) setChainId(cs[0].id);
    });
  }, []);

  useEffect(() => {
    if (!chainId) return;
    catalogApi.apiCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data as unknown as Location[];
      setLocations(locs);
      if (locs.length > 0) setLocationId(locs[0].id);
    });
  }, [chainId]);

  useEffect(() => {
    if (!locationId) return;
    catalogApi
      .apiCatalogTreatmentsGet(locationId)
      .then(({ data }) => setTreatments(data as unknown as Treatment[]));
  }, [locationId]);

  const refetchSlots = useCallback(() => {
    if (flow.state.step === 'slot' && flow.state.selectedDate) flow.reloadSlots();
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
        <SlotPicker
          treatments={treatments.filter((t) => flow.state.selectedTreatmentIds.includes(t.id))}
          slotsByTreatment={flow.state.slotsByTreatment}
          holdsByTreatment={Object.fromEntries(flow.state.holds.map((h) => [h.treatmentId, h]))}
          onSelect={flow.selectSlot}
          loading={flow.state.loading}
        />
      )}

      {flow.state.step === 'held' && flow.state.holds.length > 0 && (
        <BookingSummary
          holds={flow.state.holds}
          treatments={treatments}
          onConfirm={flow.confirmAll}
          onCancel={flow.cancelHolds}
          loading={flow.state.loading}
        />
      )}
    </div>
  );
}

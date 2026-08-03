import { useEffect, useState } from 'react';
import { Outlet, useOutletContext, useParams } from 'react-router-dom';
import { bookingApi, catalogApi } from '../api/client';
import type { BookingDetails, Chain, Location, Treatment } from '../api/types';
import { SearchableSelect } from '../components/SearchableSelect';

export interface BookingContext {
  treatments: Treatment[];
  locationId: number | null;
}

export function useBookingContext() {
  return useOutletContext<BookingContext>();
}

export function BookPage() {
  const { bookingId } = useParams<{ bookingId?: string }>();
  const isEditingBooking = Boolean(bookingId);

  const [chains, setChains] = useState<Chain[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);

  useEffect(() => {
    catalogApi.apiCatalogChainsGet().then(({ data }) => {
      const cs = data as unknown as Chain[];
      setChains(cs);
      if (!isEditingBooking && cs.length > 0) {
        setChainId(cs[0].id);
      }
    });
  }, [isEditingBooking]);

  useEffect(() => {
    if (!isEditingBooking || !bookingId) return;

    bookingApi.apiBookingIdGet(Number(bookingId)).then(async ({ data }) => {
      const b = data as unknown as BookingDetails;
      if (!b || !b.locationId) return;

      const targetLocId = b.locationId;
      const chainsRes = await catalogApi.apiCatalogChainsGet();
      const allChains = chainsRes.data as unknown as Chain[];

      for (const c of allChains) {
        const locsRes = await catalogApi.apiCatalogLocationsGet(c.id);
        const locs = locsRes.data as unknown as Location[];
        if (locs.some((l) => l.id === targetLocId)) {
          setChainId(c.id);
          setLocations(locs);
          setLocationId(targetLocId);
          break;
        }
      }
    });
  }, [bookingId, isEditingBooking]);

  useEffect(() => {
    if (isEditingBooking || !chainId) return;
    catalogApi.apiCatalogLocationsGet(chainId).then(({ data }) => {
      const locs = data as unknown as Location[];
      setLocations(locs);
      if (locs.length > 0) setLocationId(locs[0].id);
    });
  }, [chainId, isEditingBooking]);

  useEffect(() => {
    if (!locationId) return;
    catalogApi
      .apiCatalogTreatmentsGet(locationId)
      .then(({ data }) => setTreatments(data as unknown as Treatment[]));
  }, [locationId]);

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Book a treatment</h1>

      <div className="flex flex-wrap gap-2">
        {chains.length > 1 && (
          <SearchableSelect
            disabled={isEditingBooking}
            value={String(chainId ?? '')}
            onChange={(v) => setChainId(Number(v))}
            options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        )}

        {locations.length > 1 && (
          <SearchableSelect
            disabled={isEditingBooking}
            value={String(locationId ?? '')}
            onChange={(v) => setLocationId(Number(v))}
            options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
            className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
          />
        )}
      </div>

      <Outlet key={locationId} context={{ treatments, locationId } satisfies BookingContext} />
    </div>
  );
}

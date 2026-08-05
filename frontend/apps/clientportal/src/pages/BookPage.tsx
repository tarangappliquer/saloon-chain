import { useEffect, useState } from 'react';
import { Outlet, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { PageHeader } from '@saloon/ui';
import { bookingApi, catalogApi } from '../api/client';
import type { BookingDetails, Chain, Location, Treatment } from '../api/types';
import { type SelectOption, selectClassNames } from '../components/reactSelectStyles';

export interface BookingContext {
  treatments: Treatment[];
  locationId: number | null;
}

// oxlint-disable-next-line react/only-export-components
export function useBookingContext() {
  return useOutletContext<BookingContext>();
}

export function BookPage() {
  const { bookingId } = useParams<{ bookingId?: string }>();
  const [searchParams] = useSearchParams();
  const searchLocId = searchParams.get('locationId') ? Number(searchParams.get('locationId')) : null;
  const isEditingBooking = Boolean(bookingId);

  const [chains, setChains] = useState<Chain[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);

  useEffect(() => {
    catalogApi.apiCatalogChainsGet().then(async ({ data }) => {
      const cs = data as unknown as Chain[];
      setChains(cs);

      if (searchLocId && !isEditingBooking) {
        for (const c of cs) {
          const locsRes = await catalogApi.apiCatalogLocationsGet(c.id);
          const locs = locsRes.data as unknown as Location[];
          if (locs.some((l) => l.id === searchLocId)) {
            setChainId(c.id);
            setLocations(locs);
            setLocationId(searchLocId);
            return;
          }
        }
      }

      if (!isEditingBooking && cs.length > 0 && !chainId) {
        setChainId(cs[0].id);
      }
    });
  }, [isEditingBooking, searchLocId]);

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
      if (locs.length > 0 && !searchLocId) setLocationId(locs[0].id);
    });
  }, [chainId, isEditingBooking, searchLocId]);

  useEffect(() => {
    if (!locationId) return;
    catalogApi
      .apiCatalogTreatmentsGet(locationId)
      .then(({ data }) => setTreatments(data as unknown as Treatment[]));
  }, [locationId]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <PageHeader
        title="Book a Treatment"
        description="Select your preferred salon location and choose from our treatment menu."
        action={
          (chains.length > 1 || locations.length > 1) ? (
            <div className="flex flex-wrap items-center gap-2">
              {chains.length > 1 && (
                <Select
                  isClearable
                  isDisabled={isEditingBooking}
                  value={chains.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === String(chainId ?? '')) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setChainId(Number(picked?.value ?? ''))}
                  options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground')}
                />
              )}
              {locations.length > 1 && (
                <Select
                  isClearable
                  isDisabled={isEditingBooking}
                  value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === String(locationId ?? '')) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setLocationId(Number(picked?.value ?? ''))}
                  options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground')}
                />
              )}
            </div>
          ) : undefined
        }
      />

      <Outlet key={locationId} context={{ treatments, locationId } satisfies BookingContext} />
    </div>
  );
}

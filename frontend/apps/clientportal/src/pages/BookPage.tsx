import { useEffect, useState } from 'react';
import { Outlet, useMatch, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import Select, { type SingleValue } from 'react-select';
import { Button, ConfirmDialog, PageHeader } from '@saloon/ui';
import { ApiError, bookingApi, catalogApi } from '../api/client';
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
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const searchLocId = searchParams.get('locationId') ? Number(searchParams.get('locationId')) : null;
  const isEditingBooking = Boolean(bookingId);
  // The confirmation screen has no bookingId (it doesn't belong to one specific booking's edit
  // flow) but still shouldn't let the customer switch saloon/location after the fact. Matched
  // against the route itself (not a raw pathname string check) so it stays correct if this page
  // ever moves under a different parent path.
  const isConfirmedPage = Boolean(useMatch('/book/confirmed'));
  const canSwitchLocation = !isEditingBooking && !isConfirmedPage;

  const [chains, setChains] = useState<Chain[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [chainId, setChainId] = useState<number | null>(null);
  const [locationId, setLocationId] = useState<number | null>(null);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleConfirmCancel() {
    if (!bookingId) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await bookingApi.apiBookingIdDelete(Number(bookingId));
      setShowCancelModal(false);
      navigate('/my-bookings', { replace: true });
    } catch (err) {
      setCancelError(err instanceof ApiError ? err.message : 'Failed to cancel booking.');
    } finally {
      setCancelling(false);
    }
  }

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
  }, [chainId, isEditingBooking, searchLocId]);

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
      <ConfirmDialog
        isOpen={showCancelModal}
        title="Cancel Booking"
        description="Are you sure you want to cancel this booking? Any held slots will be released and this cannot be undone."
        confirmLabel="Yes, Cancel Booking"
        cancelLabel="Keep Booking"
        variant="danger"
        loading={cancelling}
        onConfirm={handleConfirmCancel}
        onClose={() => setShowCancelModal(false)}
      />

      <PageHeader
        title="Book a Treatment"
        description="Select your preferred salon location and choose from our treatment menu."
        action={
          isEditingBooking ? (
            <Button type="button" variant="outline" onClick={() => setShowCancelModal(true)} className="text-xs font-semibold cursor-pointer">
              Cancel Booking
            </Button>
          ) : (chains.length > 0 || locations.length > 0) ? (
            <div className="flex flex-wrap items-center gap-2">
              {chains.length > 1 && (
                <Select
                  isClearable={canSwitchLocation}
                  isDisabled={!canSwitchLocation}
                  value={chains.map((c) => ({ value: String(c.id), label: c.name })).find((o) => o.value === String(chainId ?? '')) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setChainId(Number(picked?.value ?? ''))}
                  options={chains.map((c) => ({ value: String(c.id), label: c.name }))}
                  placeholder="Select Chain..."
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground')}
                />
              )}
              {locations.length > 0 && (
                <Select
                  isClearable={false}
                  isDisabled={!canSwitchLocation}
                  value={locations.map((l) => ({ value: String(l.id), label: l.name })).find((o) => o.value === String(locationId ?? '')) ?? null}
                  onChange={(picked: SingleValue<SelectOption>) => setLocationId(Number(picked?.value ?? ''))}
                  options={locations.map((l) => ({ value: String(l.id), label: l.name }))}
                  placeholder="Select Saloon..."
                  unstyled
                  classNames={selectClassNames('rounded-lg border border-input bg-card px-3 py-1.5 text-xs text-foreground min-w-[180px]')}
                />
              )}
            </div>
          ) : undefined
        }
      />

      {cancelError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-xs font-medium text-destructive">
          {cancelError}
        </div>
      )}

      <Outlet key={locationId} context={{ treatments, locationId } satisfies BookingContext} />
    </div>
  );
}

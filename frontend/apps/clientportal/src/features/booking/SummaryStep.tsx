import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { catalogApi } from '../../api/client';
import type { Treatment } from '../../api/types';
import { routes } from '../../routes';
import { BookingSummary } from './BookingSummary';
import { TreatmentBar } from './TreatmentBar';
import { useBookingFlow } from './useBookingFlow';

export function SummaryStep() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();
  const flow = useBookingFlow(Number(bookingId));
  const { state, allCovered } = flow;
  const { booking } = state;

  // Scoped to the booking's own location (see ScheduleStep for why this isn't the BookPage
  // context's `treatments`, which tracks the ambient "start a new booking" selector instead).
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const locationId = booking?.locationId ?? null;
  useEffect(() => {
    if (!locationId) return;
    catalogApi.apiCatalogTreatmentsGet(locationId).then(({ data }) => setTreatments(data as unknown as Treatment[]));
  }, [locationId]);

  useEffect(() => {
    if (state.restoring) return;
    if (!allCovered) navigate(routes.book.schedule(bookingId!), { replace: true });
  }, [state.restoring, allCovered, navigate, bookingId]);

  function handleProceedToPayment() {
    navigate(routes.book.payment(bookingId!));
  }

  if (!booking || !allCovered) return null;

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

      <BookingSummary
        lines={booking.treatments}
        onConfirm={handleProceedToPayment}
        onEdit={() => navigate(routes.book.schedule(bookingId!))}
        loading={state.loading}
      />
    </div>
  );
}

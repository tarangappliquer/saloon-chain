import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, bookingApi } from '../../api/client';
import type { DraftResponse } from '@saloon/api-client';
import { useBookingContext } from '../../pages/BookPage';
import { routes } from '../../routes';
import { TreatmentPicker } from './TreatmentPicker';

export function TreatmentsStep() {
  const { treatments, locationId } = useBookingContext();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // setLoading(true) below only disables the "Next" button after the next render -- a fast
  // double-click before that repaint can otherwise fire two draft-booking creates.
  const inFlight = useRef(false);

  function toggleTreatment(id: number) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  async function handleNext() {
    if (!locationId || selectedIds.length === 0 || inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    setError(null);
    try {
      const { data } = await bookingApi.apiBookingDraftPost({ locationId, treatmentIds: selectedIds });
      const { bookingId } = data as unknown as DraftResponse;
      navigate(routes.book.schedule(bookingId as unknown as string));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start booking');
      inFlight.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <TreatmentPicker
        treatments={treatments}
        selectedIds={selectedIds}
        onToggle={toggleTreatment}
        onNext={handleNext}
        loading={loading}
      />
    </div>
  );
}

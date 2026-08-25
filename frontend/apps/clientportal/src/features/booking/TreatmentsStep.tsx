import { useActionState, useState } from 'react';
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
  // useActionState's pending flag is derived from the action's own transition, so a fast
  // double-click can't fire this twice -- no separate in-flight guard needed.
  const [error, handleNext, loading] = useActionState<string | null>(async (previousError) => {
    if (!locationId || selectedIds.length === 0) return previousError;
    try {
      const { data } = await bookingApi.apiBookingDraftPost({ locationId, treatmentIds: selectedIds });
      const { bookingId } = data as unknown as DraftResponse;
      navigate(routes.book.schedule(bookingId as unknown as string));
      return null;
    } catch (err) {
      return err instanceof ApiError ? err.message : 'Failed to start booking';
    }
  }, null);

  function toggleTreatment(id: number) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
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

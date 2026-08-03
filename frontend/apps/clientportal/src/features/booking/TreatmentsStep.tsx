import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, bookingApi } from '../../api/client';
import type { DraftResponse } from '@saloon/api-client';
import { useBookingContext } from '../../pages/BookPage';
import { TreatmentPicker } from './TreatmentPicker';

export function TreatmentsStep() {
  const { treatments, locationId } = useBookingContext();
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleTreatment(id: number) {
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }

  async function handleNext() {
    if (!locationId || selectedIds.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await bookingApi.apiBookingDraftPost({ locationId, treatmentIds: selectedIds });
      const { bookingId } = data as unknown as DraftResponse;
      navigate(`/book/${bookingId}/schedule`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to start booking');
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

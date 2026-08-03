import type { HeldSlot, Treatment } from '../../api/types';
import { useCountdown } from './useCountdown';

interface Props {
  holds: HeldSlot[];
  treatments: Treatment[];
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export function BookingSummary({ holds, treatments, onConfirm, onCancel, loading }: Props) {
  // All holds are created in the same short window; the earliest expiry drives one countdown
  // for the whole group. If any expires, confirm is blocked regardless.
  const earliest = holds.reduce<string>(
    (min, h) => (h.expiresAt < min ? h.expiresAt : min),
    holds[0]?.expiresAt ?? null,
  );
  const secondsLeft = useCountdown(earliest);
  const expired = secondsLeft <= 0;
  const treatmentName = (id: number) => treatments.find((t) => t.id === id)?.name ?? 'Treatment';

  return (
    <div className="space-y-4 rounded-lg border border-purple-200 bg-purple-50 p-4 dark:border-purple-800 dark:bg-purple-950/30">
      {holds.map((h) => (
        <div key={h.bookingId}>
          <div className="font-medium text-gray-900 dark:text-gray-100">
            {treatmentName(h.treatmentId)} —{' '}
            {new Date(h.slot.startTime).toLocaleString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            })}
          </div>
        </div>
      ))}
      <div className="text-sm text-gray-500 dark:text-gray-400">
        {expired
          ? 'Hold expired'
          : `Held for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={loading || expired}
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-purple-600 py-2.5 font-medium text-white disabled:opacity-40"
        >
          Confirm bookings
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-gray-700 disabled:opacity-40 dark:border-gray-600 dark:text-gray-200"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
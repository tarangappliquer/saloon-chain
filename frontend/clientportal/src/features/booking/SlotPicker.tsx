import type { AvailableSlot } from '../../api/types';

interface Props {
  slots: AvailableSlot[];
  onSelect: (slot: AvailableSlot) => void;
  loading: boolean;
}

export function SlotPicker({ slots, onSelect, loading }: Props) {
  if (slots.length === 0) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">No open slots that day — try another date.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
      {slots.map((slot) => (
        <button
          key={slot.startTime}
          type="button"
          disabled={loading}
          onClick={() => onSelect(slot)}
          className="rounded-lg border border-gray-200 py-2 text-sm transition hover:border-purple-400 disabled:opacity-40 dark:border-gray-700"
        >
          {new Date(slot.startTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </button>
      ))}
    </div>
  );
}

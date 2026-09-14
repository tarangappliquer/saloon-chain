import { useState } from 'react';
import Select, { type SingleValue } from 'react-select';
import type { BookingTreatmentLine, Treatment } from '../../api/types';
import { type SelectOption, selectClassNames } from '../../components/reactSelectStyles';
import { TreatmentDetailsModal } from './TreatmentDetailsModal';
import { formatVenueDate, formatVenueTime } from '../../lib/time';

interface Props {
  treatments: Treatment[]; // full catalog, for the "add" dropdown
  lines: BookingTreatmentLine[]; // this booking's current treatments
  onAdd: (treatmentId: number) => void;
  onRemove: (treatmentId: number) => void;
  loading: boolean;
  // Shown in the booking's own location zone, not the customer's browser zone -- see lib/time.ts.
  timeZoneId?: string;
}

function fmtTime(iso: string, timeZoneId?: string) {
  return `${formatVenueDate(iso, timeZoneId)}, ${formatVenueTime(iso, timeZoneId)}`;
}

// Persistent strip shown alongside the schedule/summary steps so a treatment can be added or
// dropped without leaving the page.
export function TreatmentBar({ treatments, lines, onAdd, onRemove, loading, timeZoneId }: Props) {
  const [detailsTreatment, setDetailsTreatment] = useState<Treatment | null>(null);
  const selectedIds = new Set(lines.map((l) => l.treatmentId));
  const addable = treatments.filter((t) => !selectedIds.has(t.id));

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      {lines.map((line) => (
        <span
          key={line.treatmentId}
          className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <span className="text-gray-900 dark:text-gray-100">{line.treatmentName}</span>
          <span className="font-semibold text-gray-700 dark:text-gray-300">${(line.price ?? 0).toFixed(2)}</span>
          <span className="text-gray-400">{line.startTime ? fmtTime(line.startTime, timeZoneId) : 'no time yet'}</span>
          <button
            type="button"
            onClick={() => {
              const full = treatments.find((t) => t.id === line.treatmentId);
              if (full) setDetailsTreatment(full);
            }}
            aria-label={`View details for ${line.treatmentName}`}
            className="text-gray-400 hover:text-primary"
          >
            View more
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => line.treatmentId !== undefined && onRemove(line.treatmentId)}
            aria-label={`Remove ${line.treatmentName}`}
            className="text-gray-400 hover:text-red-500 disabled:opacity-40"
          >
            ×
          </button>
        </span>
      ))}

      {addable.length > 0 && (
        <Select
          value={null}
          isDisabled={loading}
          onChange={(picked: SingleValue<SelectOption>) => {
            if (picked?.value) onAdd(Number(picked.value));
          }}
          placeholder="+ Add treatment"
          options={addable.map((t) => ({ value: String(t.id), label: `${t.name} — $${t.price.toFixed(2)}` }))}
          unstyled
          classNames={selectClassNames('rounded-full border border-dashed border-gray-300 bg-transparent px-3 py-1 text-sm text-gray-500 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400')}
        />
      )}

      {detailsTreatment && (
        <TreatmentDetailsModal treatment={detailsTreatment} onClose={() => setDetailsTreatment(null)} />
      )}
    </div>
  );
}

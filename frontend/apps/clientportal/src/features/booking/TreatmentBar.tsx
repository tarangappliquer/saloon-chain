import type { BookingTreatmentLine, Treatment } from '../../api/types';
import { SearchableSelect } from '../../components/SearchableSelect';

interface Props {
  treatments: Treatment[]; // full catalog, for the "add" dropdown
  lines: BookingTreatmentLine[]; // this booking's current treatments
  onAdd: (treatmentId: number) => void;
  onRemove: (treatmentId: number) => void;
  loading: boolean;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Persistent strip shown alongside the schedule/summary steps so a treatment can be added or
// dropped without leaving the page.
export function TreatmentBar({ treatments, lines, onAdd, onRemove, loading }: Props) {
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
          <span className="text-gray-400">{line.startTime ? fmtTime(line.startTime) : 'no time yet'}</span>
          <button
            type="button"
            disabled={loading}
            onClick={() => onRemove(line.treatmentId)}
            aria-label={`Remove ${line.treatmentName}`}
            className="text-gray-400 hover:text-red-500 disabled:opacity-40"
          >
            ×
          </button>
        </span>
      ))}

      {addable.length > 0 && (
        <SearchableSelect
          value=""
          disabled={loading}
          onChange={(v) => {
            if (v) onAdd(Number(v));
          }}
          placeholder="+ Add treatment"
          options={addable.map((t) => ({ value: String(t.id), label: t.name }))}
          className="rounded-full border border-dashed border-gray-300 bg-transparent px-3 py-1 text-sm text-gray-500 disabled:opacity-40 dark:border-gray-600 dark:text-gray-400"
        />
      )}
    </div>
  );
}

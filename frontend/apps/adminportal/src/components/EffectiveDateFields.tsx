import { DateInput } from './DateInput';
import type { EffectiveMode } from '../lib/effectiveDate';

const MODES: { value: EffectiveMode; label: string }[] = [
  { value: 'from', label: 'Effective From' },
  { value: 'range', label: 'Date Range' },
  { value: 'single', label: 'Single Date' },
];

function parseDate(value: string): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d) : undefined;
}

export function EffectiveDateFields({
  mode,
  onModeChange,
  fromDate,
  onFromDateChange,
  toDate,
  onToDateChange,
  minDate,
  fromError,
  toError,
}: {
  mode: EffectiveMode;
  onModeChange: (mode: EffectiveMode) => void;
  fromDate: string;
  onFromDateChange: (value: string) => void;
  toDate: string;
  onToDateChange: (value: string) => void;
  minDate?: string;
  fromError?: string;
  toError?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {MODES.map((m) => (
          <button
            key={m.value}
            type="button"
            onClick={() => onModeChange(m.value)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
              mode === m.value
                ? 'bg-primary/15 text-primary border border-primary/30'
                : 'bg-muted text-muted-foreground border border-border'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <DateInput
        required
        label={mode === 'range' ? 'From Date' : mode === 'single' ? 'Date' : 'Effective From'}
        value={fromDate}
        minDate={parseDate(minDate ?? '')}
        onChange={(e) => onFromDateChange(e.target.value)}
        error={fromError}
      />
      {mode === 'range' && (
        <DateInput
          required
          label="To Date"
          value={toDate}
          minDate={parseDate(fromDate || minDate || '')}
          onChange={(e) => onToDateChange(e.target.value)}
          error={toError}
        />
      )}
    </div>
  );
}

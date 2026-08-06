import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './DateInput.css';

interface DateInputProps {
  label?: string;
  value: string; // 'YYYY-MM-DD'
  onChange: (e: { target: { value: string } }) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
  excludeDates?: Date[];
  filterDate?: (date: Date) => boolean;
}

function parseDateValue(value: string): Date | null {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function formatDateValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function DateInput({ label, value, onChange, error, helperText, required, className, minDate, maxDate, excludeDates, filterDate }: DateInputProps) {
  const inputId = label ? label.toLowerCase().replace(/\s+/g, '-') : undefined;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <DatePicker
        id={inputId}
        selected={parseDateValue(value)}
        onChange={(date: Date | null) => {
          if (date) onChange({ target: { value: formatDateValue(date) } });
        }}
        minDate={minDate}
        maxDate={maxDate}
        excludeDates={excludeDates}
        filterDate={filterDate}
        dateFormat="MM/dd/yyyy"
        required={required}
        className={`flex h-8 w-full rounded-lg border border-input bg-card px-3 py-1 text-xs text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-destructive focus-visible:outline-destructive' : ''} ${className ?? ''}`}
      />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {!error && helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

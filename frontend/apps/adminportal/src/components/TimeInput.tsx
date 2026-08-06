import { Timepicker } from 'timepicker-ui-react';
import { useTheme } from '@saloon/ui';

interface TimeInputProps {
  label?: string;
  value: string; // 'HH:mm', 24h
  onChange: (e: { target: { value: string } }) => void;
  error?: string;
  required?: boolean;
  className?: string;
  incrementMinutes?: number | undefined
}

export function TimeInput({ label, value, onChange, error, required, className, incrementMinutes }: TimeInputProps) {
  const { theme } = useTheme();
  const inputId = label ? label.toLowerCase().replace(/\s+/g, '-') : undefined;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <Timepicker
        id={inputId}
        required={required}
        value={value}
        options={{ clock: { type: '24h', incrementMinutes: incrementMinutes }, ui: { theme: theme === 'dark' ? 'dark' : 'basic' } }}
        onConfirm={({ hour, minutes }) => {
          if (hour && minutes) onChange({ target: { value: `${hour.padStart(2, '0')}:${minutes.padStart(2, '0')}` } });
        }}
        className={`flex h-8 w-full rounded-lg border border-input bg-card px-3 py-1 text-xs text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-destructive focus-visible:outline-destructive' : ''} ${className ?? ''}`}
      />
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}

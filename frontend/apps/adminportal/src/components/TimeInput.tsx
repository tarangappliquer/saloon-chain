import { memo, useMemo, useState, useEffect } from 'react';
import { Timepicker } from 'timepicker-ui-react';
import { useTheme } from '@saloon/ui';

interface TimeInputProps {
  label?: string;
  value: string; // 'HH:mm', 24h
  onChange: (e: { target: { value: string } }) => void;
  minTime?: string; // 'HH:mm'
  maxTime?: string; // 'HH:mm'
  error?: string;
  onErrorChange?: (error: string | null) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  incrementMinutes?: number | undefined;
}

function parseTimeObj(timeStr?: string) {
  if (!timeStr || !timeStr.includes(':')) return undefined;
  const [h, m] = timeStr.split(':');
  return { hour: h.padStart(2, '0'), minutes: m.padStart(2, '0') };
}

function TimeInputBase({
  label,
  value,
  onChange,
  minTime,
  maxTime,
  error: externalError,
  onErrorChange,
  required,
  disabled,
  className,
  incrementMinutes,
}: TimeInputProps) {
  const { theme } = useTheme();
  const [internalError, setInternalError] = useState<string | null>(null);
  const inputId = label ? label.toLowerCase().replace(/\s+/g, '-') : undefined;

  const minObj = useMemo(() => parseTimeObj(minTime), [minTime]);
  const maxObj = useMemo(() => parseTimeObj(maxTime), [maxTime]);

  useEffect(() => {
    if (value && minTime && value < minTime) {
      const msg = `Time cannot be earlier than ${minTime}`;
      setInternalError(msg);
      onErrorChange?.(msg);
    } else if (value && maxTime && value > maxTime) {
      const msg = `Time cannot be later than ${maxTime}`;
      setInternalError(msg);
      onErrorChange?.(msg);
    } else {
      setInternalError(null);
      onErrorChange?.(null);
    }
  }, [value, minTime, maxTime, onErrorChange]);

  const options = useMemo(
    () => ({
      clock: { type: '24h' as const, incrementMinutes },
      ui: { theme: theme === 'dark' ? ('dark' as const) : ('basic' as const) },
      minTime: minObj,
      maxTime: maxObj,
    }),
    [incrementMinutes, theme, minObj, maxObj]
  );

  const displayError = externalError || internalError;

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
        disabled={disabled}
        value={value}
        options={options}
        onConfirm={({ hour, minutes }) => {
          if (hour && minutes) {
            const formatted = `${hour.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
            let err: string | null = null;
            if (minTime && formatted < minTime) {
              err = `Time cannot be earlier than ${minTime}`;
            } else if (maxTime && formatted > maxTime) {
              err = `Time cannot be later than ${maxTime}`;
            }
            setInternalError(err);
            onErrorChange?.(err);
            onChange({ target: { value: formatted } });
          }
        }}
        className={`flex h-8 w-full rounded-lg border border-input bg-card px-3 py-1 text-xs text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${displayError ? 'border-destructive focus-visible:outline-destructive' : ''} ${className ?? ''}`}
      />
      {displayError && <p className="text-xs font-medium text-destructive">{displayError}</p>}
    </div>
  );
}

export const TimeInput = memo(TimeInputBase);

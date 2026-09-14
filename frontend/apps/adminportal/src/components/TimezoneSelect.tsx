import { memo, useMemo } from 'react';

interface TimezoneSelectProps {
  label?: string;
  value: string;
  onChange: (e: { target: { value: string } }) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

// Curated fallback for runtimes without Intl.supportedValuesOf('timeZone') (Safari < 16.4) -- the
// full IANA list is preferred wherever the runtime supports it (see allTimeZones below).
const FALLBACK_ZONES = [
  'UTC',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Africa/Cairo', 'Africa/Johannesburg',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Dhaka', 'Asia/Bangkok', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland',
];

function allTimeZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('timeZone');
    }
  } catch {
    // fall through to the fallback list below
  }
  return FALLBACK_ZONES;
}

// Native <select> of IANA timezone identifiers, styled to match DateInput/TimeInput's box exactly.
// Replaces a free-text "Time Zone ID" field -- typos there (e.g. "Asia/Kolkatta") silently fell back
// to UTC everywhere the backend resolves TimeZoneId (TryGetTimeZone), with no validation error ever
// surfaced. A closed list of real IANA ids makes that class of mistake impossible.
function TimezoneSelectBase({ label, value, onChange, error, helperText, required, disabled, className }: TimezoneSelectProps) {
  const zones = useMemo(allTimeZones, []);
  // The saved value might not be in the list (a since-renamed/obsolete IANA id, or leftover
  // hand-typed junk from before this was a dropdown) -- keep it selectable instead of silently
  // discarding it out from under whoever is editing this location.
  const options = value && !zones.includes(value) ? [value, ...zones] : zones;
  const selectId = label ? label.toLowerCase().replace(/\s+/g, '-') : undefined;

  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </label>
      )}
      <select
        id={selectId}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange({ target: { value: e.target.value } })}
        className={`flex h-8 w-full cursor-pointer rounded-lg border border-input bg-card px-3 py-1 text-xs text-foreground shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 ${error ? 'border-destructive focus-visible:outline-destructive' : ''} ${className ?? ''}`}
      >
        {options.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
      {!error && helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}

export const TimezoneSelect = memo(TimezoneSelectBase);

// The admin panel deliberately shows every booking/appointment instant in the LOCATION's own
// timezone, never converted per-viewer -- an admin managing several locations across zones needs a
// consistent, unambiguous reading of "when this actually happens at that venue", not a reading that
// silently shifts depending on which browser/machine they're on. venueTimezoneTag() below labels
// which zone a given formatVenueTime/formatVenueDate reading is in, so no conversion is implied.
function resolveZone(timeZoneId?: string | null): string {
  return timeZoneId && timeZoneId.trim() ? timeZoneId : 'UTC';
}

export function formatVenueTime(iso?: string | Date | null, timeZoneId?: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '--:--';
  return new Intl.DateTimeFormat('en-US', { timeZone: resolveZone(timeZoneId), hour: 'numeric', minute: '2-digit' }).format(d);
}

export function formatVenueDate(
  iso?: string | Date | null,
  timeZoneId?: string | null,
  opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' },
): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: resolveZone(timeZoneId), ...opts }).format(d);
}

// Short label for the zone a venue-local reading is displayed in -- "UTC", "GMT+5:30", "PDT", etc,
// whatever Intl resolves the IANA zone's abbreviation to for the given instant (abbreviations can
// vary by date for zones that observe DST). Falls back to the raw IANA id if the runtime can't
// produce a short name for it.
export function venueTimezoneTag(timeZoneId?: string | null, at: Date = new Date()): string {
  const zone = resolveZone(timeZoneId);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
  } catch {
    return zone;
  }
}

// 'HH:mm' (what TimeInput produces) -> 'HH:mm:00' (what the API expects), or null for an empty/unset
// time. Was hand-duplicated at every call site that submits a time field; centralized here instead.
export function toApiTime(value: string): string | null {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
}

export interface BreakTimeErrors {
  startError: string | null;
  endError: string | null;
}

// Cross-validates a break-start/break-end pair: both empty is fine (no break), both set requires
// end > start, only one set is an error. Was hand-duplicated (with the same three branches) across
// every chain/location form in this app; centralized here instead.
export function validateBreakTimes(startTime: string, endTime: string): BreakTimeErrors {
  if (startTime && !endTime) {
    return { startError: null, endError: 'Break End Time is required when Start Time is provided.' };
  }
  if (!startTime && endTime) {
    return { startError: 'Break Start Time is required when End Time is provided.', endError: null };
  }
  if (startTime && endTime) {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    if (eh * 60 + em <= sh * 60 + sm) {
      return { startError: null, endError: 'Break End Time must be greater than Break Start Time.' };
    }
  }
  return { startError: null, endError: null };
}

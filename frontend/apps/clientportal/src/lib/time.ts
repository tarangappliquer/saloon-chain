// The booking flow shows every slot/appointment time in the LOCATION's own timezone, never
// converted to the customer's browser zone -- no client-side guessing, one unambiguous reading of
// "when this actually happens at that venue" no matter whose device is looking at it. Matches the
// admin panel's policy (see adminportal/src/lib/time.ts) applied here to ScheduleStep/SlotPicker/
// TreatmentBar.
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

// 'YYYY-MM-DD' calendar date of an instant IN THE VENUE's OWN ZONE -- for matching a scheduled
// treatment's startTime against `allowedDates` (also venue-local, from GET /available-dates).
// Deriving this via the browser's own zone (Date.getFullYear()/getMonth()/getDate(), as this used
// to) can land on the wrong day near midnight venue-local whenever the customer's zone differs from
// the venue's -- same shape as the earlier UTC-vs-venue-local bug, just browser-vs-venue this time.
export function formatVenueDateKey(iso: string, timeZoneId?: string | null): string {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: resolveZone(timeZoneId), year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${day}`;
}

// Short label for the zone a venue-local reading is displayed in -- "UTC", "GMT+5:30", "PDT", etc,
// whatever Intl resolves the IANA zone's abbreviation to for the given instant. Falls back to the
// raw IANA id if the runtime can't produce a short name for it.
export function venueTimezoneTag(timeZoneId?: string | null, at: Date = new Date()): string {
  const zone = resolveZone(timeZoneId);
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(at);
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone;
  } catch {
    return zone;
  }
}

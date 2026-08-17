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

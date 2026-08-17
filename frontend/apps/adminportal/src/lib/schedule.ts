export interface DaySchedule {
  key: string;
  bit: number;
  label: string;
  isOpen: boolean;
  openTime: string;
  closeTime: string;
}

export const WEEK_DAYS: { key: string; bit: number; label: string }[] = [
  { key: 'mon', bit: 1, label: 'Monday' },
  { key: 'tue', bit: 2, label: 'Tuesday' },
  { key: 'wed', bit: 4, label: 'Wednesday' },
  { key: 'thu', bit: 8, label: 'Thursday' },
  { key: 'fri', bit: 16, label: 'Friday' },
  { key: 'sat', bit: 32, label: 'Saturday' },
  { key: 'sun', bit: 64, label: 'Sunday' },
];

// Same bits, short label -- for compact "Operating Days" toggle groups (WEEK_DAYS' full names are
// for the per-day schedule table instead).
export const DAY_BITS: { bit: number; label: string }[] = [
  { bit: 1, label: 'Mon' },
  { bit: 2, label: 'Tue' },
  { bit: 4, label: 'Wed' },
  { bit: 8, label: 'Thu' },
  { bit: 16, label: 'Fri' },
  { bit: 32, label: 'Sat' },
  { bit: 64, label: 'Sun' },
];

export function defaultWeeklySchedule(): DaySchedule[] {
  return WEEK_DAYS.map((d) => ({ key: d.key, bit: d.bit, label: d.label, isOpen: true, openTime: '09:00', closeTime: '18:00' }));
}

export function weeklyScheduleFromLocation(loc: { workingDaysMask: number; openTime: string; closeTime: string }): DaySchedule[] {
  return WEEK_DAYS.map((d) => ({
    key: d.key,
    bit: d.bit,
    label: d.label,
    isOpen: (loc.workingDaysMask & d.bit) !== 0,
    openTime: loc.openTime || '09:00',
    closeTime: loc.closeTime || '18:00',
  }));
}

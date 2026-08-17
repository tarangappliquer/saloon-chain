// Shared with the backend's EffectiveFrom/EffectiveTo convention (LocationDaySchedule,
// TreatmentPrices, TreatmentDurations): EffectiveTo == EffectiveFrom is a single date,
// EffectiveTo > EffectiveFrom is a bounded range, EffectiveTo omitted is open-ended.
export type EffectiveMode = 'from' | 'range' | 'single';

export function resolveEffectiveTo(mode: EffectiveMode, fromDate: string, toDate: string): string | null {
  if (mode === 'single') return fromDate;
  if (mode === 'range') return toDate;
  return null;
}

export function describeEffectiveWindow(effectiveFrom: string, effectiveTo: string | null): string {
  if (!effectiveTo) return `from ${effectiveFrom}`;
  if (effectiveTo === effectiveFrom) return `on ${effectiveFrom}`;
  return `${effectiveFrom} to ${effectiveTo}`;
}

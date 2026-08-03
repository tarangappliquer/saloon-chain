import type { AvailableSlot, HeldSlot, Treatment } from '../../api/types';

interface Props {
  // Only the selected treatments are passed in (the caller filters the full catalog), so each
  // section maps 1:1 to a treatment the user is booking.
  treatments: Treatment[];
  slotsByTreatment: Record<number, AvailableSlot[]>;
  holdsByTreatment: Record<number, HeldSlot>;
  onSelect: (treatmentId: number, slot: AvailableSlot) => void;
  loading: boolean;
}

function sameSlot(a: AvailableSlot, b: AvailableSlot) {
  return a.startTime === b.startTime && a.roomId === b.roomId && a.therapistId === b.therapistId;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Two [start, end) intervals overlap when each starts before the other ends. The customer is one
// person, so a slot that overlaps a hold for a *different* treatment can't be picked — they'd be
// in two treatments at once. Same-treatment holds are excluded so re-picking (which cancels the
// old hold) isn't blocked by the old hold itself.
function overlaps(a: AvailableSlot, b: AvailableSlot) {
  const s1 = new Date(a.startTime).getTime();
  const e1 = new Date(a.endTime).getTime();
  const s2 = new Date(b.startTime).getTime();
  const e2 = new Date(b.endTime).getTime();
  return s1 < e2 && s2 < e1;
}

export function SlotPicker({
  treatments,
  slotsByTreatment,
  holdsByTreatment,
  onSelect,
  loading,
}: Props) {
  // Held slots from other treatments — used to grey out conflicting times in each grid.
  const otherHolds = Object.values(holdsByTreatment);

  return (
    <div className="space-y-6">
      {treatments.map((t) => {
        const held = holdsByTreatment[t.id];
        const slots = slotsByTreatment[t.id] ?? [];
        // A held slot drops out of the available list once the hold is created (the calculator
        // excludes existing bookings), so re-inject it to keep the user's pick visible. Merge then
        // sort by startTime so the grid stays chronological — prepending would shove 9:30 ahead
        // of 9:00.
        const displaySlots = held
          ? [...slots, ...(slots.some((s) => sameSlot(s, held.slot)) ? [] : [held.slot])].sort(
              (a, b) => +new Date(a.startTime) - +new Date(b.startTime),
            )
          : slots;

        return (
          <div key={t.id}>
            <h3 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
              {t.name} <span className="text-gray-400">· {t.durationSlots * 5} min</span>
              {held && <span className="ml-2 text-purple-600 dark:text-purple-400">Held {fmtTime(held.slot.startTime)}</span>}
            </h3>
            {displaySlots.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {loading ? 'Loading slots…' : 'No open slots that day — try another date.'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {displaySlots.map((slot) => {
                  const selected = held && sameSlot(held.slot, slot);
                  // Conflicts with another treatment's held time → the customer can't be in two
                  // places at once, so block it. Same-treatment holds don't count (re-picking
                  // cancels the old hold).
                  const conflict = otherHolds.some(
                    (h) => h.treatmentId !== t.id && overlaps(h.slot, slot),
                  );
                  // isHeld means someone else currently has this exact slot in checkout -- a soft,
                  // temporary block from the server rather than a permanent conflict.
                  const unavailable = conflict || slot.isHeld;
                  // The held slot is this treatment's own block — never disable or fade it, even
                  // during a refetch (loading) or if it happens to overlap another hold. The user
                  // must always see their pick at full strength; re-clicking it is a no-op anyway.
                  return (
                    <button
                      key={slot.startTime}
                      type="button"
                      disabled={!selected && (loading || unavailable)}
                      onClick={() => onSelect(t.id, slot)}
                      className={`rounded-lg border py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 ${
                        selected
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40'
                          : unavailable
                            ? 'border-gray-200 text-gray-300 line-through dark:border-gray-800 dark:text-gray-700'
                            : 'border-gray-200 hover:border-purple-400 dark:border-gray-700'
                      }`}
                    >
                      {fmtTime(slot.startTime)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
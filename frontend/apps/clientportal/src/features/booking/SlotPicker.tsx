import type { AvailableSlot, BookingTreatmentLine } from '../../api/types';

interface Props {
  // This booking's own treatment lines -- each already carries its name/duration and current
  // schedule (nullable until picked), sourced straight from the server.
  lines: BookingTreatmentLine[];
  slotsByTreatment: Record<number, AvailableSlot[]>;
  onSelect: (treatmentId: number, slot: AvailableSlot) => void;
  loading: boolean;
}

function isSameSlot(line: BookingTreatmentLine, slot: AvailableSlot) {
  return line.startTime === slot.startTime && line.roomId === slot.roomId && line.therapistId === slot.therapistId;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Two [start, end) intervals overlap when each starts before the other ends. The customer is one
// person, so a slot that overlaps a hold for a *different* treatment can't be picked — they'd be
// in two treatments at once. Same-treatment holds are excluded so re-picking (which cancels the
// old hold) isn't blocked by the old hold itself.
function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  const s1 = new Date(a.startTime).getTime();
  const e1 = new Date(a.endTime).getTime();
  const s2 = new Date(b.startTime).getTime();
  const e2 = new Date(b.endTime).getTime();
  return s1 < e2 && s2 < e1;
}

export function SlotPicker({ lines, slotsByTreatment, onSelect, loading }: Props) {
  // Scheduled lines — used to grey out conflicting times in each other treatment's grid.
  const scheduled = lines.filter((l) => l.startTime !== null && l.endTime !== null) as (BookingTreatmentLine & {
    startTime: string;
    endTime: string;
  })[];

  return (
    <div className="space-y-6">
      {lines.map((line) => {
        const held = line.startTime !== null;
        const slots = slotsByTreatment[line.treatmentId] ?? [];

        return (
          <div key={line.treatmentId}>
            <h3 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">
              {line.treatmentName} <span className="text-gray-400">· {line.slotCount * 5} min</span>
              {held && line.startTime && (
                <span className="ml-2 text-purple-600 dark:text-purple-400">Held {fmtTime(line.startTime)}</span>
              )}
            </h3>
            {slots.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {loading ? 'Loading slots…' : 'No open slots that day — try another date.'}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => {
                  const selected = held && isSameSlot(line, slot);
                  // Conflicts with another treatment's held time → the customer can't be in two
                  // places at once, so block it. Same-treatment holds don't count (re-picking
                  // cancels the old hold).
                  const conflict = scheduled.some((l) => l.treatmentId !== line.treatmentId && overlaps(l, slot));
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
                      onClick={() => onSelect(line.treatmentId, slot)}
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

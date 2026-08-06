import { AlertTriangle, Trash2 } from 'lucide-react';
import type { AvailableSlot, BookingTreatmentLine } from '../../api/types';

interface Props {
  lines: BookingTreatmentLine[];
  slotsByTreatment: Record<number, AvailableSlot[]>;
  onSelect: (treatmentId: number, slot: AvailableSlot) => void;
  onRemove?: (treatmentId: number) => void;
  loading: boolean;
}

function isSameSlot(line: BookingTreatmentLine, slot: AvailableSlot) {
  return line.startTime === slot.startTime && line.roomId === slot.roomId && line.therapistId === slot.therapistId;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  const s1 = new Date(a.startTime).getTime();
  const e1 = new Date(a.endTime).getTime();
  const s2 = new Date(b.startTime).getTime();
  const e2 = new Date(b.endTime).getTime();
  return s1 < e2 && s2 < e1;
}

export function SlotPicker({ lines, slotsByTreatment, onSelect, onRemove, loading }: Props) {
  const scheduled = lines.filter((l) => l.startTime !== null && l.endTime !== null) as (BookingTreatmentLine & {
    startTime: string;
    endTime: string;
  })[];

  return (
    <div className="space-y-6">
      {lines.map((line) => {
        const held = line.startTime !== null;
        const slots = slotsByTreatment[line.treatmentId] ?? [];
        const noSlotsAvailable = !loading && slots.length === 0;
        const missingSelection = !loading && slots.length > 0 && !held;

        return (
          <div key={line.treatmentId} className="space-y-2.5 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span>{line.treatmentName}</span>
                <span className="text-muted-foreground/70">· {line.slotCount * 5} mins</span>
                {held && line.startTime && (
                  <span className="ml-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Selected {fmtTime(line.startTime)}
                  </span>
                )}
              </h3>

              {onRemove && lines.length > 1 && (
                <button
                  type="button"
                  onClick={() => onRemove(line.treatmentId)}
                  className="flex items-center gap-1 text-[11px] font-semibold text-destructive hover:underline cursor-pointer"
                  title="Remove this treatment"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Remove</span>
                </button>
              )}
            </div>

            {loading && slots.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2 animate-pulse">Loading available slots...</p>
            ) : noSlotsAvailable ? (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-bold">No Available Slots for "{line.treatmentName}"</p>
                    <p className="text-[11px] opacity-90 mt-0.5">
                      No open time slots are available for this treatment on the selected date. Please select another date on the calendar above or remove this treatment.
                    </p>
                  </div>
                </div>
                {onRemove && lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(line.treatmentId)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-amber-700 transition cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Remove "{line.treatmentName}"</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {missingSelection && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-semibold mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>No time slot selected yet. Please tap an available time slot below.</span>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                  {slots.map((slot) => {
                    const selected = held && isSameSlot(line, slot);
                    const conflict = scheduled.some((l) => l.treatmentId !== line.treatmentId && overlaps(l, slot));
                    const unavailable = conflict || slot.isHeld;

                    return (
                      <button
                        key={slot.startTime}
                        type="button"
                        disabled={!selected && (loading || unavailable)}
                        onClick={() => onSelect(line.treatmentId, slot)}
                        className={`rounded-lg border py-2 text-xs font-mono font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${selected
                            ? 'border-primary bg-primary text-primary-foreground shadow-xs font-bold ring-2 ring-primary/40'
                            : unavailable
                              ? 'border-border text-muted-foreground/50 line-through bg-muted/20'
                              : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/40'
                          }`}
                      >
                        {fmtTime(slot.startTime)}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

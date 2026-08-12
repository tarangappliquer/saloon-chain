import { useState } from 'react';
import { AlertTriangle, Trash2, UserCheck } from 'lucide-react';
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

// Used only for the "Selected" badge -- unlike the slot buttons below (all for the single date
// this picker is currently showing), the line's already-assigned time can be on a different date
// than what's on screen right now, so that one spot needs the date spelled out too.
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${date}, ${fmtTime(iso)}`;
}

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  const s1 = new Date(a.startTime).getTime();
  const e1 = new Date(a.endTime).getTime();
  const s2 = new Date(b.startTime).getTime();
  const e2 = new Date(b.endTime).getTime();
  return s1 < e2 && s2 < e1;
}

export function SlotPicker({ lines, slotsByTreatment, onSelect, onRemove, loading }: Props) {
  const [therapistOption, setTherapistOption] = useState<'any' | 'specific'>('any');
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<number[]>([]);

  const scheduled = lines.filter((l) => l.startTime !== null && l.endTime !== null) as (BookingTreatmentLine & {
    startTime: string;
    endTime: string;
  })[];

  // Collect unique therapist IDs across all available slots
  const allSlots = Object.values(slotsByTreatment).flat();
  const availableTherapistIds = Array.from(new Set(allSlots.map((s) => s.therapistId))).sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {/* Applicable Therapist Option Selector */}
      {availableTherapistIds.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <span>Choose Applicable Therapist</span>
            </h3>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="clientTherapistOption"
                value="any"
                checked={therapistOption === 'any'}
                onChange={() => {
                  setTherapistOption('any');
                  setSelectedTherapistIds([]);
                }}
                className="text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Any Therapist (All)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="radio"
                name="clientTherapistOption"
                value="specific"
                checked={therapistOption === 'specific'}
                onChange={() => setTherapistOption('specific')}
                className="text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>Specific Therapist(s)</span>
            </label>
          </div>

          {therapistOption === 'specific' && (
            <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground">Hold Ctrl (or Cmd) to select multiple therapists:</p>
              <select
                multiple
                value={selectedTherapistIds.map(String)}
                onChange={(e) => {
                  const opts = Array.from(e.target.selectedOptions, (option) => Number(option.value));
                  setSelectedTherapistIds(opts);
                }}
                className="w-full rounded-xl border border-input bg-background p-2 text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-primary h-28"
              >
                {availableTherapistIds.map((tId) => (
                  <option key={tId} value={tId} className="py-1 px-2 rounded hover:bg-accent font-medium">
                    Therapist #{tId}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {lines.map((line) => {
        const held = line.startTime !== null;
        const rawSlots = slotsByTreatment[line.treatmentId] ?? [];
        const slots = rawSlots.filter((s) => {
          if (therapistOption === 'specific' && selectedTherapistIds.length > 0) {
            return selectedTherapistIds.includes(s.therapistId);
          }
          return true;
        });

        const noSlotsAvailable = !loading && slots.length === 0;
        const missingSelection = !loading && slots.length > 0 && !held;

        return (
          <div key={line.treatmentId} className="space-y-2.5 rounded-xl border border-border/80 bg-card p-4 shadow-2xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span>{line.treatmentName}</span>
                <span className="text-muted-foreground/70">· {line.slotCount * 15} mins</span>
                {held && line.startTime && (
                  <span className="ml-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                    Selected {fmtDateTime(line.startTime)}
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

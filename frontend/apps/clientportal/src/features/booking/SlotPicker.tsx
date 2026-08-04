import type { AvailableSlot, BookingTreatmentLine } from '../../api/types';

interface Props {
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

function overlaps(a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) {
  const s1 = new Date(a.startTime).getTime();
  const e1 = new Date(a.endTime).getTime();
  const s2 = new Date(b.startTime).getTime();
  const e2 = new Date(b.endTime).getTime();
  return s1 < e2 && s2 < e1;
}

export function SlotPicker({ lines, slotsByTreatment, onSelect, loading }: Props) {
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
          <div key={line.treatmentId} className="space-y-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {line.treatmentName} <span className="text-muted-foreground/70">· {line.slotCount * 5} mins</span>
              {held && line.startTime && (
                <span className="ml-2 font-semibold text-primary">Held {fmtTime(line.startTime)}</span>
              )}
            </h3>
            {slots.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">
                {loading ? 'Loading available slots...' : 'No open slots on this date. Try another date.'}
              </p>
            ) : (
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
                      className={`rounded-lg border py-2 text-xs font-mono font-semibold transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? 'border-primary bg-primary/10 text-primary shadow-2xs ring-1 ring-primary/30'
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
            )}
          </div>
        );
      })}
    </div>
  );
}

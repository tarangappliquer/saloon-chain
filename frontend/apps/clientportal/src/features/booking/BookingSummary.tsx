import { Button, Card } from '@saloon/ui';
import type { BookingTreatmentLine } from '../../api/types';
import { useCountdown } from './useCountdown';

interface Props {
  lines: BookingTreatmentLine[];
  onConfirm: () => void;
  onEdit: () => void;
  loading: boolean;
}

export function BookingSummary({ lines, onConfirm, onEdit, loading }: Props) {
  const earliest = lines.reduce<string | null>(
    (min, l) => (l.expiresAt && (!min || l.expiresAt < min) ? l.expiresAt : min),
    null,
  );
  const secondsLeft = useCountdown(earliest);
  const expired = secondsLeft <= 0;

  const totalAmount = lines.reduce((sum, l) => sum + (l.price || 0), 0);

  return (
    <Card className="p-6 space-y-4 border-primary/20 bg-primary/5">
      <div className="space-y-3">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-foreground">Summary & Reservation</h3>
        {lines.map((line) => (
          <div key={line.id} className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border/40 pb-2">
            <div>
              <span className="font-semibold text-sm text-foreground">{line.treatmentName}</span>
              {line.startTime && (
                <p className="text-xs text-muted-foreground font-mono">
                  {new Date(line.startTime).toLocaleString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </div>
            <span className="font-mono text-xs font-semibold text-primary">${line.price.toFixed(2)}</span>
          </div>
        ))}

        <div className="flex items-center justify-between text-sm font-bold text-foreground pt-2 border-t border-border/60">
          <span>Total Amount</span>
          <span className="font-mono text-base text-primary">${totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
        <span>Hold Reservation Timer</span>
        <span className={`font-mono font-bold ${expired ? 'text-destructive' : 'text-primary'}`}>
          {expired
            ? 'Hold expired'
            : `Held for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
        </span>
      </div>

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          disabled={loading || expired}
          onClick={onConfirm}
          className="flex-1 h-10 font-semibold"
        >
          {loading ? 'Confirming...' : 'Confirm Booking'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={onEdit}
          className="h-10"
        >
          Edit
        </Button>
      </div>
    </Card>
  );
}

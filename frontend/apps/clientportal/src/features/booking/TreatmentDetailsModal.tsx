import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Badge, LoadingFallback } from '@saloon/ui';
import { catalogApi } from '../../api/client';
import type { Treatment, TreatmentDuration, TreatmentPrice } from '../../api/types';

interface Props {
  treatment: Treatment;
  onClose: () => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function TreatmentDetailsModal({ treatment, onClose }: Props) {
  const [prices, setPrices] = useState<TreatmentPrice[]>([]);
  const [durations, setDurations] = useState<TreatmentDuration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      catalogApi.apiCatalogTreatmentsIdPricesGet(treatment.id),
      catalogApi.apiCatalogTreatmentsIdDurationsGet(treatment.id),
    ])
      .then(([pricesRes, durationsRes]) => {
        if (cancelled) return;
        setPrices(pricesRes.data);
        setDurations(durationsRes.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [treatment.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {treatment.categoryName}
            </span>
            <h3 className="font-display text-base font-bold text-foreground">{treatment.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent/50 hover:text-foreground transition cursor-pointer"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {treatment.description && (
          <p className="text-xs text-muted-foreground leading-relaxed">{treatment.description}</p>
        )}

        {loading ? (
          <LoadingFallback />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/50">
            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Price</h4>
              {prices.length === 0 ? (
                <p className="text-xs text-muted-foreground">No price scheduled.</p>
              ) : (
                <ul className="divide-y divide-border/50 text-xs">
                  {prices.map((p) => (
                    <li key={p.id} className="flex items-center justify-between py-1.5 gap-2">
                      <span className="font-mono font-semibold text-primary">${p.price.toFixed(2)}</span>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        from {p.effectiveFrom}
                        {p.effectiveFrom > today() && <Badge variant="warning" showDot={false}>Upcoming</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</h4>
              {durations.length === 0 ? (
                <p className="text-xs text-muted-foreground">No duration scheduled.</p>
              ) : (
                <ul className="divide-y divide-border/50 text-xs">
                  {durations.map((d) => (
                    <li key={d.id} className="flex items-center justify-between py-1.5 gap-2">
                      <span className="font-semibold text-foreground">
                        {d.durationSlots * 15} mins
                        {d.preTimeMinutes > 0 && (
                          <span className="block font-normal text-amber-600 dark:text-amber-400">
                            arrive {d.preTimeMinutes} min early
                          </span>
                        )}
                      </span>
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        from {d.effectiveFrom}
                        {d.effectiveFrom > today() && <Badge variant="warning" showDot={false}>Upcoming</Badge>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

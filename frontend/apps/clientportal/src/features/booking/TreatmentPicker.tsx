import { Badge, Button } from '@saloon/ui';
import type { Treatment } from '../../api/types';

interface Props {
  treatments: Treatment[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onNext: () => void;
  loading: boolean;
}

export function TreatmentPicker({ treatments, selectedIds, onToggle, onNext, loading }: Props) {
  const grouped = new Map<string, Treatment[]>();
  for (const t of treatments) {
    const list = grouped.get(t.categoryName);
    if (list) list.push(t);
    else grouped.set(t.categoryName, [t]);
  }

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([category, items]) => (
        <div key={category} className="space-y-3">
          <h3 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">{category}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((t) => {
              const selected = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onToggle(t.id)}
                  className={`group relative flex flex-col justify-between rounded-xl border p-4 text-left transition-all duration-150 cursor-pointer ${
                    selected
                      ? 'border-primary bg-primary/10 shadow-xs ring-1 ring-primary/30'
                      : 'border-border bg-card hover:border-border-strong hover:bg-accent/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                      {t.name}
                    </span>
                    {selected && <Badge variant="primary" showDot={false}>Selected</Badge>}
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t.durationSlots * 5} mins</span>
                    <span className="font-mono font-semibold text-primary">${t.price.toFixed(2)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div className="pt-4">
        <Button
          type="button"
          disabled={selectedIds.length === 0 || loading}
          onClick={onNext}
          className="w-full h-11 text-base font-semibold"
        >
          {loading ? 'Loading dates...' : `Continue with ${selectedIds.length} treatment${selectedIds.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </div>
  );
}

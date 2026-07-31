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
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold text-gray-500 dark:text-gray-400">{category}</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((t) => {
              const selected = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onToggle(t.id)}
                  className={`rounded-lg border p-3 text-left transition ${
                    selected
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/40'
                      : 'border-gray-200 hover:border-purple-300 dark:border-gray-700'
                  }`}
                >
                  <div className="font-medium text-gray-900 dark:text-gray-100">{t.name}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t.durationSlots * 5} min · ${t.price.toFixed(2)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        type="button"
        disabled={selectedIds.length === 0 || loading}
        onClick={onNext}
        className="w-full rounded-lg bg-purple-600 py-2.5 font-medium text-white disabled:opacity-40"
      >
        {loading ? 'Loading dates…' : `Continue with ${selectedIds.length} treatment(s)`}
      </button>
    </div>
  );
}

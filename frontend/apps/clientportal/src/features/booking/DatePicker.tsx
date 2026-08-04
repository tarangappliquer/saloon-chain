interface Props {
  dates: string[];
  selectedDate: string | null;
  onPick: (date: string) => void;
  loading: boolean;
}

export function DatePicker({ dates, selectedDate, onPick, loading }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {dates.map((date) => {
        const isSelected = selectedDate === date;
        return (
          <button
            key={date}
            type="button"
            disabled={loading}
            onClick={() => onPick(date)}
            className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition-all duration-150 cursor-pointer disabled:opacity-40 ${
              isSelected
                ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                : 'border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent'
            }`}
          >
            {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  dates: string[];
  selectedDate: string | null;
  onPick: (date: string) => void;
  loading: boolean;
}

export function DatePicker({ dates, selectedDate, onPick, loading }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {dates.map((date) => (
        <button
          key={date}
          type="button"
          disabled={loading}
          onClick={() => onPick(date)}
          className={`rounded-full border px-4 py-2 text-sm transition disabled:opacity-40 ${
            selectedDate === date
              ? 'border-purple-500 bg-purple-600 text-white'
              : 'border-gray-200 hover:border-purple-300 dark:border-gray-700'
          }`}
        >
          {new Date(date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
        </button>
      ))}
    </div>
  );
}

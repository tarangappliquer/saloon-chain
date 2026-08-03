export type BadgeStatus = 'Confirmed' | 'Draft' | 'Cancelled' | 'Active' | 'Inactive' | string;

export function Badge({ status, className = '' }: { status: BadgeStatus; className?: string }) {
  const getStyle = (s: string) => {
    switch (s.toLowerCase()) {
      case 'confirmed':
      case 'active':
        return {
          bg: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50',
          dot: 'bg-emerald-500',
        };
      case 'draft':
        return {
          bg: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800/50',
          dot: 'bg-amber-500',
        };
      case 'cancelled':
      case 'inactive':
        return {
          bg: 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-800/50',
          dot: 'bg-rose-500',
        };
      default:
        return {
          bg: 'bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300 border-gray-200 dark:border-gray-800',
          dot: 'bg-gray-400',
        };
    }
  };

  const { bg, dot } = getStyle(status);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${bg} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {status}
    </span>
  );
}

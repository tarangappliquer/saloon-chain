export type BadgeStatus = 'Confirmed' | 'Draft' | 'Cancelled' | 'Active' | 'Inactive' | string;

export function Badge({ status, className = '' }: { status: BadgeStatus; className?: string }) {
  const getStyle = (s: string) => {
    switch (s.toLowerCase()) {
      case 'confirmed':
      case 'active':
        return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
      case 'draft':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
      case 'cancelled':
      case 'inactive':
        return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStyle(status)} ${className}`}>
      {status}
    </span>
  );
}

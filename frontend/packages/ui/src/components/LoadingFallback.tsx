import { Skeleton } from './Skeleton';

export function LoadingFallback({ maxW = 'max-w-2xl', message }: { maxW?: string; message?: string }) {
  return (
    <div className={`mx-auto ${maxW} space-y-6 p-6`}>
      {message && (
        <p className="flex items-center justify-center gap-2.5 text-center text-lg font-semibold text-primary">
          <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-primary animate-pulse" />
          {message}
        </p>
      )}
      <Skeleton className="h-24 rounded-xl" />
      <div className="flex gap-4 border-b border-gray-200 py-2 dark:border-gray-800">
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-lg" />
        <Skeleton className="h-28 rounded-lg" />
      </div>
    </div>
  );
}

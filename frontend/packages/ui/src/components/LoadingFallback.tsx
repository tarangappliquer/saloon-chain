export function LoadingFallback({ maxW = 'max-w-2xl' }: { maxW?: string }) {
  return (
    <div className={`mx-auto ${maxW} space-y-6 p-6 animate-pulse`}>
      <div className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800" />
      <div className="flex gap-4 border-b border-gray-200 py-2 dark:border-gray-800">
        <div className="h-8 w-24 rounded-md bg-gray-200 dark:bg-gray-800" />
        <div className="h-8 w-24 rounded-md bg-gray-200 dark:bg-gray-800" />
      </div>
      <div className="space-y-4">
        <div className="h-28 rounded-lg bg-gray-200 dark:bg-gray-800" />
        <div className="h-28 rounded-lg bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

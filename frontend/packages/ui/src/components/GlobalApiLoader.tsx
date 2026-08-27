import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export interface GlobalApiLoaderProps {
  isLoading?: boolean;
}

export function GlobalApiLoader({ isLoading = false }: GlobalApiLoaderProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (isLoading) {
      // Trigger after 40ms to provide immediate visual feedback when an API call is in-flight
      timer = setTimeout(() => setVisible(true), 40);
    } else {
      setVisible(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none">
      {/* High-visibility top progress bar */}
      <div className="h-1 w-full overflow-hidden bg-primary/20">
        <div className="h-full w-full bg-gradient-to-r from-primary via-indigo-500 to-pink-500 animate-pulse" />
      </div>

      {/* Floating glassmorphic loading badge */}
      <div className="absolute top-3 right-4 flex items-center gap-2.5 rounded-full border border-primary/40 bg-background/95 px-4 py-1.5 shadow-xl backdrop-blur-md">
        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
        <span className="text-xs font-bold tracking-wide text-foreground">Processing request...</span>
      </div>
    </div>
  );
}

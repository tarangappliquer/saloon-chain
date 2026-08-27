import type { ReactNode } from 'react';
import { SearchX } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  variant?: 'card' | 'page';
  className?: string;
}

export function EmptyState({
  title = 'No data found',
  description = 'The requested information could not be found or has not been created yet.',
  icon,
  actionLabel,
  onAction,
  variant = 'card',
  className = '',
}: EmptyStateProps) {
  const isPage = variant === 'page';

  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 transition-all ${
        isPage
          ? 'min-h-[50vh] max-w-xl mx-auto rounded-3xl border border-border/60 bg-card/60 shadow-lg backdrop-blur-md my-8'
          : 'rounded-2xl border border-border/50 bg-muted/20 py-12 px-6'
      } ${className}`}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs ring-1 ring-primary/20">
        {icon ?? <SearchX className="h-8 w-8 stroke-[1.5]" />}
      </div>
      <h3 className="text-lg font-bold tracking-tight text-foreground">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground leading-relaxed">{description}</p>
      {actionLabel && onAction && (
        <div className="mt-6">
          <Button onClick={onAction} variant="outline" size="sm">
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

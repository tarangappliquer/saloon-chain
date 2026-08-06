import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, description, action, children, className = '' }: PageHeaderProps) {
  const sub = subtitle || description;

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border", className)}>
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {sub && <span className="mt-1 text-xs text-muted-foreground text-wrap">{sub}</span>}
      </div>
      {(action || children) && <div className="flex shrink-0 items-center gap-3">{action || children}</div>}
    </div>
  );
}

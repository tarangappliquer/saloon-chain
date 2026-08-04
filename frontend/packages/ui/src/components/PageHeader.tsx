import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, description, action, children, className = '' }: PageHeaderProps) {
  const sub = subtitle || description;

  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border", className)}>
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </div>
      {(action || children) && <div className="flex items-center gap-3">{action || children}</div>}
    </div>
  );
}

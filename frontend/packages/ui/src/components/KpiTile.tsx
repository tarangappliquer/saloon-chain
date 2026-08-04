import type { ReactNode } from "react";

export interface KpiTileProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon?: ReactNode;
  subtext?: string;
}

export function KpiTile({ title, value, change, changeType = "neutral", icon, subtext }: KpiTileProps) {
  const getChangeBadgeColor = () => {
    switch (changeType) {
      case "positive":
        return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
      case "negative":
        return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";
      default:
        return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
    }
  };

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-xs transition hover:shadow-md">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        {icon && <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-foreground font-display">{value}</span>
        {change && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${getChangeBadgeColor()}`}>
            {change}
          </span>
        )}
      </div>
      {subtext && <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>}
    </div>
  );
}

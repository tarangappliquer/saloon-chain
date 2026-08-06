import { memo } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide transition-colors focus:outline-hidden",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/10 text-primary",
        primary: "border-primary/20 bg-primary/10 text-primary",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border text-foreground",
        success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        warning: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
        danger: "border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
        info: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type BadgeStatus = 'Confirmed' | 'Draft' | 'Cancelled' | 'Active' | 'Inactive' | string;

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  status?: BadgeStatus;
  children?: ReactNode;
  showDot?: boolean;
}

function BadgeBase({
  status,
  variant,
  children,
  showDot = true,
  className = "",
  ...props
}: BadgeProps) {
  let resolvedVariant = variant;
  let label = children ?? status;

  if (status && !variant) {
    const s = status.toString().toLowerCase();
    if (["confirmed", "active", "completed"].includes(s)) resolvedVariant = "success";
    else if (["draft", "pending", "in-progress"].includes(s)) resolvedVariant = "warning";
    else if (["cancelled", "inactive", "failed"].includes(s)) resolvedVariant = "danger";
    else resolvedVariant = "secondary";
  }

  const dotColors: Record<string, string> = {
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    info: "bg-sky-500",
    primary: "bg-primary",
    default: "bg-primary",
    secondary: "bg-muted-foreground",
    outline: "bg-foreground",
  };

  const currentVariant = resolvedVariant || "default";

  return (
    <span className={cn(badgeVariants({ variant: currentVariant }), className)} {...props}>
      {showDot && <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotColors[currentVariant])} />}
      {label}
    </span>
  );
}

export const Badge = memo(BadgeBase);

export { badgeVariants };

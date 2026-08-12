import { type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

export interface FilterSelectOption {
  value: string;
  label: string;
}

export interface FilterSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label?: string;
  options: FilterSelectOption[];
  className?: string;
}

// Native <select>, styled to match Input's exact box (height/border/shadow/focus ring) instead of
// the browser's default control -- mixing a styled Input with a bare <select> in the same filter
// row is what made those rows look inconsistent/unstyled.
export function FilterSelect({ label, options, id, className = "", ...props }: FilterSelectProps) {
  const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={selectId} className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          {label}
        </label>
      )}
      <div className="relative">
        <select
          id={selectId}
          className={cn(
            "flex h-9 w-full cursor-pointer appearance-none rounded-lg border border-input bg-card pl-3 pr-8 py-1.5 text-sm text-foreground shadow-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  );
}

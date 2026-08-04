import { Scissors } from "lucide-react";

export function BrandMark({ label = "SaloonChains", subtitle }: { label?: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-md">
        <Scissors className="h-5 w-5 stroke-[2.5]" />
      </div>
      {(label || subtitle) && (
        <div className="flex flex-col">
          {label && <span className="font-display text-base font-bold tracking-tight text-foreground">{label}</span>}
          {subtitle && <span className="text-xs font-medium text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

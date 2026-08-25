import { memo, type ReactNode } from "react";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { cn } from "../lib/utils";

export type TooltipSide = "top" | "bottom" | "left" | "right";

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
  disabled?: boolean;
}

// Themed, portal-rendered replacement for the native `title` attribute. Built on Radix's Tooltip
// primitive rather than a hand-rolled absolutely-positioned span: `asChild` clones the trigger
// with no extra wrapper element (a hand-rolled version's wrapper would hijack the containing block
// of an absolutely-positioned trigger, e.g. Nav's collapse-toggle button), the content is portaled
// to <body> so it's never clipped by an ancestor's overflow:hidden (several call sites live inside
// scrollable grids/tables), and Radix's Popper positioning auto-flips away from the viewport edge
// instead of running off-screen.
function TooltipBase({ content, children, side = "top", className, disabled }: TooltipProps) {
  if (disabled || content == null || content === "") return <>{children}</>;

  return (
    <RadixTooltip.Root delayDuration={300}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className={cn(
            "tooltip-content z-50 max-w-64 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg",
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-popover" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const Tooltip = memo(TooltipBase);

// One Provider is enough for a whole app -- shares delayDuration/skipDelayDuration so hopping
// between adjacent tooltips (e.g. a row of icon buttons) feels instant after the first hover
// instead of re-waiting the full delay each time. Mount it once near the app root.
export const TooltipProvider = RadixTooltip.Provider;

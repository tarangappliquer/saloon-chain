import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium transition-all duration-150 rounded-lg shadow-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-border bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        danger: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
        ghost: "hover:bg-accent hover:text-accent-foreground shadow-none",
        link: "text-primary underline-offset-4 hover:underline shadow-none",
      },
      size: {
        sm: "h-8 px-3 text-xs gap-1.5 rounded-md",
        md: "h-9 px-4 text-sm gap-2 rounded-lg",
        lg: "h-10 px-6 text-base gap-2.5 rounded-xl",
        icon: "h-9 w-9 p-0 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  children?: ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={cn(buttonVariants({ variant, size, className }))} {...props}>
      {children}
    </button>
  );
}

export { buttonVariants };

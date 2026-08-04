import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "../lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  showPasswordIcon?:boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, showPasswordIcon, id, className = "", type, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    const [revealed, setRevealed] = useState(false);
    const isPassword = type === "password";

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </label>
        )}
        <div className="relative flex gap-1">
          <input
            ref={ref}
            id={inputId}
            type={isPassword ? (revealed ? "text" : "password") : type}
            className={cn(
              "flex h-9 w-full rounded-lg border border-input bg-card px-3 py-1.5 text-sm text-foreground shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50",
              isPassword && "pr-9",
              error && "border-destructive focus-visible:outline-destructive",
              className
            )}
            {...props}
          />
          {showPasswordIcon && isPassword && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setRevealed((r) => !r)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={revealed ? "Hide password" : "Show password"}
            >
              {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>
        {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        {!error && helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };

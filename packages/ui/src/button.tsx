import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "./cn";

/**
 * The one canonical button. primary = the single most important action on a
 * screen (max one per view); secondary = important but not the primary path;
 * ghost = low emphasis; destructive = irreversible, in red never teal.
 */
const buttonVariants = cva(
  ["inline-flex items-center justify-center gap-2 whitespace-nowrap select-none", "font-semibold rounded-md border transition-colors duration-fast ease-out", "focus-visible:outline-none focus-visible:shadow-ring", "disabled:opacity-50 disabled:pointer-events-none", "active:translate-y-px"],
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg border-transparent hover:bg-primary-hover active:bg-primary-active",
        secondary: "bg-surface text-fg-1 border-border-strong hover:bg-surface-hover",
        ghost: "bg-transparent text-fg-2 border-transparent hover:bg-surface-hover hover:text-fg-1",
        destructive: "bg-surface text-error-700 border-error-500 hover:bg-error-50",
        link: "bg-transparent text-accent border-transparent underline-offset-4 hover:underline px-0 h-auto",
      },
      size: { sm: "h-8 px-3 text-sm", md: "h-control px-4 text-base", lg: "h-11 px-5 text-base", icon: "h-control w-control p-0" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  leadingIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, loading, leadingIcon, children, disabled, ...props }, ref) => (
  <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <Spinner /> : leadingIcon}
    {children}
  </button>
));
Button.displayName = "Button";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export { buttonVariants };

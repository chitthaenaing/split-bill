"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all whitespace-nowrap " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring " +
    "disabled:opacity-50 disabled:pointer-events-none select-none",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:opacity-90 active:scale-[0.98]",
        accent:
          "bg-accent text-accent-foreground hover:opacity-90 active:scale-[0.98]",
        secondary:
          "bg-muted text-foreground hover:bg-muted/70 border border-border active:scale-[0.98]",
        outline:
          "bg-transparent text-foreground border border-border hover:bg-muted/70 active:scale-[0.98]",
        ghost:
          "bg-transparent text-foreground hover:bg-muted active:scale-[0.98]",
        danger:
          "bg-transparent text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:scale-[0.98]",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10 p-0",
        iconSm: "h-8 w-8 p-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { buttonVariants };

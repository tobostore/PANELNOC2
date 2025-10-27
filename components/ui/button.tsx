"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "outline" | "ghost";
type ButtonSize = "default" | "sm" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-soft hover:bg-[#1A46DC] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary",
  outline:
    "border border-primary text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary",
  ghost:
    "text-primary hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "px-4 py-2.5 text-sm",
  sm: "px-3 py-1.5 text-xs",
  lg: "px-6 py-3 text-base"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, variant = "primary", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-full font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:pointer-events-none",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

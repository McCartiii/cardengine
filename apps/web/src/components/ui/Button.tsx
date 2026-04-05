// apps/web/src/components/ui/Button.tsx
"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "gold";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--tab-deck)] text-white hover:opacity-90 shadow-sm hover:shadow-md active:scale-[0.98]",
  gold:
    "text-white active:scale-[0.98]",
  secondary:
    "bg-surface-raised text-text-primary border border-border hover:border-border-strong hover:shadow-sm active:scale-[0.98]",
  ghost:
    "bg-transparent text-text-secondary border border-border hover:bg-surface-sunken hover:text-text-primary active:scale-[0.98]",
  danger:
    "bg-danger text-white hover:bg-red-600 shadow-sm hover:shadow-md active:scale-[0.98]",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 rounded-lg",
  md: "px-4 py-2.5 text-sm gap-2 rounded-xl",
  lg: "px-6 py-3 text-base gap-2 rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  children,
  disabled,
  className = "",
  style,
  ...props
}: ButtonProps) {
  const goldStyle =
    variant === "gold"
      ? {
          background: "linear-gradient(135deg, var(--accent), var(--accent-text))",
          boxShadow: "0 2px 10px var(--accent-light), inset 0 1px 0 rgba(255,255,255,0.15)",
          ...style,
        }
      : style;

  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer
        ${variantClasses[variant]} ${sizeClasses[size]}
        ${disabled || loading ? "opacity-50 pointer-events-none" : ""}
        ${className}`}
      style={goldStyle}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon ? (
        <span className="shrink-0">{icon}</span>
      ) : null}
      {children}
    </button>
  );
}

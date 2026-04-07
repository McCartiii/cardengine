// apps/web/src/components/ui/Button.tsx
"use client";

import React from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "btn-shimmer text-white shadow-sm active:scale-[0.98] hover:-translate-y-px",
  secondary:
    "bg-surface-raised text-text-primary border border-border hover:border-border-strong hover:-translate-y-px hover:shadow-sm active:scale-[0.98]",
  ghost:
    "bg-transparent text-text-secondary border border-border hover:bg-surface-sunken hover:text-text-primary active:scale-[0.98]",
  danger:
    "btn-shimmer text-white shadow-sm active:scale-[0.98] hover:-translate-y-px",
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
  const gradientStyle =
    variant === "primary"
      ? {
          background: "linear-gradient(135deg, #0D9488, #14B8A6)",
          boxShadow: "0 2px 12px rgba(13,148,136,0.45), inset 0 1px 0 rgba(255,255,255,0.12)",
        }
      : variant === "danger"
      ? {
          background: "linear-gradient(135deg, #F43F5E, #FB7185)",
          boxShadow: "0 2px 12px rgba(244,63,94,0.35)",
        }
      : undefined;

  return (
    <button
      className={`inline-flex items-center justify-center font-semibold transition-all duration-150 cursor-pointer
        ${variantClasses[variant]} ${sizeClasses[size]}
        ${disabled || loading ? "opacity-50 pointer-events-none" : ""}
        ${className}`}
      style={{ ...gradientStyle, ...style }}
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

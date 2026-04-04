"use client";

import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
}

export function Input({
  label,
  icon,
  error,
  className = "",
  ...props
}: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </div>
        )}
        <input
          className={`w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-text-primary
            placeholder:text-text-muted
            focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20
            transition-all duration-150
            ${icon ? "pl-10" : ""}
            ${error ? "border-danger focus:border-danger focus:ring-danger/20" : ""}
            ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

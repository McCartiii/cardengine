"use client";

import React from "react";

interface CardProps {
  children: React.ReactNode;
  interactive?: boolean;
  className?: string;
  onClick?: () => void;
}

export function Card({
  children,
  interactive = false,
  className = "",
  onClick,
}: CardProps) {
  const Component = interactive || onClick ? "button" : "div";

  return (
    <Component
      className={`rounded-2xl border border-border bg-surface p-5
        ${interactive || onClick
          ? "card-hover cursor-pointer text-left w-full"
          : "shadow-[var(--shadow-card)]"
        }
        shadow-[var(--shadow-card)]
        ${className}`}
      onClick={onClick}
    >
      {children}
    </Component>
  );
}

// apps/web/src/components/ui/CardImage.tsx
"use client";

import { useState, useEffect } from "react";

interface CardImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Applied to the outer wrapper div — use for sizing (e.g. "h-32 w-auto") */
  wrapperClassName?: string;
  /** Whether to show the rainbow foil hover effect. Default: true */
  foil?: boolean;
}

/**
 * Drop-in replacement for <img> on card art.
 * Shows a teal conic-spin overlay while loading, fades it out on load.
 * Wraps with rainbow foil hover effect by default.
 */
export function CardImage({
  src,
  alt,
  className = "",
  wrapperClassName = "",
  foil = true,
}: CardImageProps) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
  }, [src]);

  return (
    <div
      className={`relative inline-block ${foil ? "card-foil-hover" : ""} ${wrapperClassName}`}
    >
      {/* Conic-spin loading overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-[120ms]"
        style={{
          opacity: loaded ? 0 : 1,
          borderRadius: "inherit",
          background: `conic-gradient(
            from var(--spin-a) at 50% 50%,
            #0d2020 0deg,
            #0D9488 60deg,
            #2DD4BF 90deg,
            #0D9488 120deg,
            #0d2020 180deg,
            #0d2020 360deg
          )`,
          animation: "conic-spin 1.2s linear infinite",
          zIndex: 3,
        }}
      >
        {/* Inner mask — cuts ring to border only */}
        <div
          className="absolute"
          style={{
            inset: "3px",
            borderRadius: "inherit",
            background: "var(--surface-sunken)",
          }}
        />
      </div>

      <img
        src={src}
        alt={alt}
        className={`block transition-opacity duration-[120ms] ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}

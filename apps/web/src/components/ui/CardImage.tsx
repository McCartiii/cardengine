// apps/web/src/components/ui/CardImage.tsx
"use client";

import { useCallback, useState } from "react";

interface CardImageProps {
  src: string;
  alt: string;
  className?: string;
  /** Applied to the outer wrapper div — use for sizing (e.g. "h-32 w-auto") */
  wrapperClassName?: string;
  /** Whether to show the rainbow foil hover effect. Default: true */
  foil?: boolean;
  /** Load immediately when the image is above the fold. */
  priority?: boolean;
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
  priority = false,
}: CardImageProps) {
  const [imageState, setImageState] = useState<{
    src: string;
    status: "loading" | "loaded" | "error";
  }>({ src, status: "loading" });
  const status = imageState.src === src ? imageState.status : "loading";

  const syncCompletedImage = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image?.complete) return;
      setImageState({
        src,
        status: image.naturalWidth > 0 ? "loaded" : "error",
      });
    },
    [src]
  );

  return (
    <div
      className={`relative inline-block ${foil ? "card-foil-hover" : ""} ${wrapperClassName}`}
    >
      {/* Conic-spin loading overlay */}
      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-[120ms]"
        style={{
          opacity: status === "loading" ? 1 : 0,
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

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-sunken px-3 text-center text-xs text-text-muted">
          Art unavailable
        </div>
      )}

      <img
        ref={syncCompletedImage}
        src={src}
        alt={alt}
        className={`block transition-opacity duration-[120ms] ${status === "loaded" ? "opacity-100" : "opacity-0"} ${className}`}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={() => setImageState({ src, status: "loaded" })}
        onError={() => setImageState({ src, status: "error" })}
      />
    </div>
  );
}

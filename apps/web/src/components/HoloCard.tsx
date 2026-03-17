"use client";

import { useRef, useCallback } from "react";

/* ─── Rarity foil definitions ───────────────────────────────────────────── */
const FOIL: Record<string, { gradient: string; glow: string; blend: string }> = {
  common: {
    gradient: "linear-gradient(135deg, rgba(200,200,220,0.0) 0%, rgba(200,200,220,0.25) 40%, rgba(255,255,255,0.15) 50%, rgba(200,200,220,0.25) 60%, rgba(200,200,220,0.0) 100%)",
    glow: "0 0 24px rgba(180,180,200,0.35), 0 4px 20px rgba(0,0,0,0.6)",
    blend: "screen",
  },
  uncommon: {
    gradient: "linear-gradient(135deg, rgba(80,200,120,0.0) 0%, rgba(80,200,120,0.3) 35%, rgba(160,255,180,0.2) 50%, rgba(80,200,120,0.3) 65%, rgba(80,200,120,0.0) 100%)",
    glow: "0 0 28px rgba(80,200,120,0.45), 0 4px 20px rgba(0,0,0,0.6)",
    blend: "screen",
  },
  rare: {
    gradient: "linear-gradient(125deg, rgba(0,100,255,0.0) 0%, rgba(0,150,255,0.3) 30%, rgba(245,158,11,0.25) 50%, rgba(0,150,255,0.3) 70%, rgba(0,100,255,0.0) 100%)",
    glow: "0 0 32px rgba(0,150,255,0.5), 0 4px 20px rgba(0,0,0,0.6)",
    blend: "screen",
  },
  mythic: {
    gradient: "linear-gradient(135deg, rgba(255,80,0,0.0) 0%, rgba(255,80,0,0.35) 30%, rgba(255,200,0,0.25) 50%, rgba(255,80,0,0.35) 70%, rgba(180,20,0,0.0) 100%)",
    glow: "0 0 36px rgba(255,80,0,0.55), 0 0 60px rgba(255,80,0,0.2), 0 4px 20px rgba(0,0,0,0.6)",
    blend: "screen",
  },
  special: {
    gradient: "linear-gradient(115deg, rgba(255,0,128,0.0) 0%, rgba(0,212,255,0.25) 20%, rgba(168,85,247,0.25) 40%, rgba(255,0,128,0.25) 60%, rgba(245,158,11,0.25) 80%, rgba(0,212,255,0.0) 100%)",
    glow: "0 0 36px rgba(168,85,247,0.5), 0 0 60px rgba(0,212,255,0.2), 0 4px 20px rgba(0,0,0,0.6)",
    blend: "screen",
  },
};

const DEFAULT_FOIL = FOIL.common;

interface HoloCardProps {
  rarity?: string;
  children: React.ReactNode;
  className?: string;
}

export function HoloCard({ rarity = "common", children, className = "" }: HoloCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const foilRef = useRef<HTMLDivElement>(null);
  const foil = FOIL[rarity.toLowerCase()] ?? DEFAULT_FOIL;

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    const foilEl = foilRef.current;
    if (!el || !foilEl) return;

    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;   // 0-1
    const y = (e.clientY - rect.top)  / rect.height;  // 0-1

    const rotY =  (x - 0.5) * 24;   // -12 to +12 deg
    const rotX = -(y - 0.5) * 24;

    el.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.04,1.04,1.04)`;
    el.style.boxShadow = foil.glow;

    // Move foil highlight with cursor
    foilEl.style.backgroundPosition = `${x * 100}% ${y * 100}%`;
    foilEl.style.opacity = "1";
  }, [foil]);

  const handleMouseLeave = useCallback(() => {
    const el = cardRef.current;
    const foilEl = foilRef.current;
    if (!el || !foilEl) return;
    el.style.transform = "perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)";
    el.style.boxShadow = "0 4px 20px rgba(0,0,0,0.5)";
    foilEl.style.opacity = "0";
  }, []);

  return (
    <div
      ref={cardRef}
      className={`relative overflow-hidden transition-transform duration-100 ease-out will-change-transform ${className}`}
      style={{
        boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
        transformStyle: "preserve-3d",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {/* Foil overlay */}
      <div
        ref={foilRef}
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          background: foil.gradient,
          backgroundSize: "200% 200%",
          mixBlendMode: foil.blend as React.CSSProperties["mixBlendMode"],
          opacity: 0,
          zIndex: 10,
        }}
      />
    </div>
  );
}

"use client";

import { RichCard, MTG_COLORS } from "./deck-helpers";

interface HeroBannerProps {
  name: string;
  commander: string | null;
  format: string;
  isPublic: boolean;
  totalCards: number;
  totalValue: number;
  avgCmc: number;
  legality: { valid: boolean; issues: string[] };
  colorIdentity: string[];
  featuredCards: RichCard[];
}

const FAN_POSITIONS = [
  { rotate: -18, x: 60,  y: 30 },
  { rotate: -8,  x: 30,  y: 10 },
  { rotate: 2,   x: 0,   y: 0  },
  { rotate: 12,  x: -30, y: 10 },
  { rotate: 22,  x: -60, y: 30 },
];

const COLOR_GRADIENTS: Record<string, string> = {
  W: "rgba(249,250,244,0.08)",
  U: "rgba(14,104,171,0.12)",
  B: "rgba(50,50,60,0.15)",
  R: "rgba(211,32,42,0.12)",
  G: "rgba(0,115,62,0.12)",
};

export function HeroBanner({
  name, commander, format, isPublic, totalCards, totalValue, avgCmc,
  legality, colorIdentity, featuredCards,
}: HeroBannerProps) {
  const stops = colorIdentity.length > 0
    ? colorIdentity.map(c => COLOR_GRADIENTS[c] ?? "transparent").join(", ")
    : "rgba(13,148,136,0.06)";
  const identityGradient = `radial-gradient(ellipse at 70% 40%, ${stops}, transparent 70%)`;

  const displayCards = featuredCards.slice(0, 5);
  const fanPositions = FAN_POSITIONS.slice(Math.max(0, 5 - displayCards.length));

  return (
    <div
      className="relative overflow-hidden"
      style={{
        height: 230,
        background: "linear-gradient(135deg, #070a12 0%, #0D1824 30%, #0a1628 60%, #0a160d 100%)",
      }}
    >
      {/* Color identity overlay */}
      <div className="absolute inset-0 z-0" style={{ background: identityGradient }} />
      {/* Bottom + side fade */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 1,
          background:
            "linear-gradient(to right, rgba(9,13,20,0.97) 20%, rgba(9,13,20,0.7) 55%, rgba(9,13,20,0.15) 100%), linear-gradient(to top, #090D14 0%, transparent 40%)",
        }}
      />

      {/* Card fan */}
      <div className="absolute" style={{ right: 100, top: "50%", transform: "translateY(-55%)", zIndex: 1 }}>
        {displayCards.map((card, i) => {
          const pos = fanPositions[i] ?? fanPositions[fanPositions.length - 1];
          const imgUrl = card.variant?.imageUri
            ? card.variant.imageUri.replace("/normal", "/art_crop")
            : null;
          return (
            <div
              key={card.id}
              className="absolute"
              style={{
                width: 110,
                height: 154,
                borderRadius: 9,
                border: "1.5px solid rgba(255,255,255,0.12)",
                boxShadow: "-6px 6px 30px rgba(0,0,0,0.9), 0 0 60px rgba(0,0,0,0.4)",
                overflow: "hidden",
                transform: `rotate(${pos.rotate}deg) translate(${pos.x}px, ${pos.y}px)`,
                transformOrigin: "center bottom",
                background: "#161B27",
              }}
            >
              {imgUrl ? (
                <img src={imgUrl} alt={card.cardName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl opacity-20">🃏</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Content */}
      <div className="absolute bottom-0 left-0 right-0 px-9 pb-7" style={{ zIndex: 10 }}>
        {/* Badges */}
        <div className="flex gap-2 mb-3 items-center flex-wrap">
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.25)" }}
          >
            {format}
          </span>
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={
              legality.valid
                ? { background: "rgba(13,148,136,0.1)", color: "#2DD4BF", border: "1px solid rgba(13,148,136,0.2)" }
                : { background: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }
            }
          >
            {legality.valid ? "Legal" : `${legality.issues.length} issue${legality.issues.length !== 1 ? "s" : ""}`}
          </span>
          <span
            className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
            style={{ background: "rgba(100,116,139,0.08)", color: "#64748b", border: "1px solid rgba(100,116,139,0.15)" }}
          >
            {isPublic ? "Public" : "Private"}
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 30,
            fontWeight: 900,
            color: "#F8FAFC",
            lineHeight: 1.1,
            letterSpacing: "-0.6px",
            textShadow: "0 2px 16px rgba(0,0,0,0.8)",
          }}
        >
          {name}
        </h1>
        {commander && (
          <p style={{ fontSize: 14, color: "#94a3b8", marginTop: 5 }}>
            Commander:{" "}
            <strong style={{ color: "#CBD5E1", fontWeight: 600 }}>{commander}</strong>
          </p>
        )}

        {/* Stats row */}
        <div className="flex gap-6 mt-3.5 items-center">
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#F8FAFC", letterSpacing: "-0.3px" }}>{totalCards}</p>
            <p style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>Cards</p>
          </div>
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.06)" }} />
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#14B8A6", letterSpacing: "-0.3px" }}>${totalValue.toFixed(2)}</p>
            <p style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>Value</p>
          </div>
          <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.06)" }} />
          <div>
            <p style={{ fontSize: 18, fontWeight: 800, color: "#F8FAFC", letterSpacing: "-0.3px" }}>{avgCmc.toFixed(1)}</p>
            <p style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 600 }}>Avg CMC</p>
          </div>
          {colorIdentity.length > 0 && (
            <>
              <div style={{ width: 1, height: 32, background: "rgba(255,255,255,0.06)" }} />
              <div className="flex gap-1.5 items-center">
                {MTG_COLORS.filter(c => colorIdentity.includes(c.color)).map(({ color, label, hex }) => (
                  <div
                    key={color}
                    title={label}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      background: hex,
                      border: "1.5px solid rgba(0,0,0,0.5)",
                      boxShadow: "0 1px 4px rgba(0,0,0,0.6)",
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

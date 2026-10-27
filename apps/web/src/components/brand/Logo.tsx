import type { ReactNode } from "react";
import {
  LOCKUP_GAP_RATIO,
  LOCKUP_MARK_RATIO,
  MARK_CARD,
  MARK_RING,
  MARK_SIZE,
  WORDMARK_CAP,
  WORDMARK_CARD,
  WORDMARK_ENGINE,
  WORDMARK_WIDTH,
} from "./logoGeometry";

type LogoVariant = "mark" | "wordmark" | "horizontal";

interface LogoProps {
  variant?: LogoVariant;
  /** Pixel height. Omit to size with CSS (e.g. `className="h-6 w-auto"`). */
  height?: number;
  className?: string;
}

function Mark() {
  return (
    <>
      {MARK_RING.map((seg) => (
        <path key={seg.fill} d={seg.d} fill={seg.fill} />
      ))}
      <rect
        x={MARK_CARD.x}
        y={MARK_CARD.y}
        width={MARK_CARD.width}
        height={MARK_CARD.height}
        rx={MARK_CARD.rx}
        transform={`rotate(${MARK_CARD.rotate} ${MARK_SIZE / 2} ${MARK_SIZE / 2})`}
        fill="currentColor"
      />
    </>
  );
}

function Wordmark() {
  return (
    <>
      <path d={WORDMARK_CARD} fill="currentColor" />
      <path d={WORDMARK_ENGINE} fill="currentColor" />
    </>
  );
}

/**
 * CardEngine logo. The card and the wordmark use `currentColor`, so the logo
 * reads white on dark surfaces and black on light ones — set the text colour
 * of the parent (or `className`) to choose.
 */
export function Logo({ variant = "horizontal", height, className }: LogoProps) {
  let viewW: number;
  let viewH: number;
  let body: ReactNode;

  if (variant === "mark") {
    viewW = MARK_SIZE;
    viewH = MARK_SIZE;
    body = <Mark />;
  } else if (variant === "wordmark") {
    viewW = WORDMARK_WIDTH;
    viewH = WORDMARK_CAP;
    body = <Wordmark />;
  } else {
    const scale = MARK_SIZE / LOCKUP_MARK_RATIO / WORDMARK_CAP;
    const textX = MARK_SIZE * (1 + LOCKUP_GAP_RATIO);
    const textY = (MARK_SIZE - WORDMARK_CAP * scale) / 2;
    viewW = textX + WORDMARK_WIDTH * scale;
    viewH = MARK_SIZE;
    body = (
      <>
        <Mark />
        <g transform={`translate(${textX} ${textY}) scale(${scale})`}>
          <Wordmark />
        </g>
      </>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      height={height}
      width={height ? (height * viewW) / viewH : undefined}
      className={className}
      role="img"
      aria-label="CardEngine"
    >
      {body}
    </svg>
  );
}

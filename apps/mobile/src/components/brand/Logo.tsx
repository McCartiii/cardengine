import React from "react";
import { useColorScheme } from "react-native";
import Svg, { G, Path, Rect } from "react-native-svg";
import {
  BRAND_INK,
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

const IVORY = "#F2ECE4";

// Stacked lockup: wordmark spans ~2× the mark's width, set below it.
const STACK_WORD_WIDTH = MARK_SIZE * 2.07;
const STACK_GAP = MARK_SIZE * 0.32;

type LogoVariant = "mark" | "horizontal" | "stacked";

interface LogoProps {
  variant?: LogoVariant;
  /** Rendered width in points; height follows the logo's aspect ratio. */
  width: number;
  /** Card + wordmark colour. Defaults to ivory in dark mode and ink in light mode. */
  color?: string;
}

/** CardEngine logo; flips to black on light backgrounds unless `color` is given. */
export function Logo({ variant = "stacked", width, color }: LogoProps) {
  const scheme = useColorScheme();
  const ink = color ?? (scheme === "light" ? BRAND_INK : IVORY);

  const mark = (
    <>
      {MARK_RING.map((seg) => (
        <Path key={seg.fill} d={seg.d} fill={seg.fill} />
      ))}
      <Rect
        x={MARK_CARD.x}
        y={MARK_CARD.y}
        width={MARK_CARD.width}
        height={MARK_CARD.height}
        rx={MARK_CARD.rx}
        transform={`rotate(${MARK_CARD.rotate} ${MARK_SIZE / 2} ${MARK_SIZE / 2})`}
        fill={ink}
      />
    </>
  );
  const wordmark = (
    <>
      <Path d={WORDMARK_CARD} fill={ink} />
      <Path d={WORDMARK_ENGINE} fill={ink} />
    </>
  );

  let viewW: number;
  let viewH: number;
  let body: React.ReactNode;

  if (variant === "mark") {
    viewW = MARK_SIZE;
    viewH = MARK_SIZE;
    body = mark;
  } else if (variant === "horizontal") {
    const scale = MARK_SIZE / LOCKUP_MARK_RATIO / WORDMARK_CAP;
    const textX = MARK_SIZE * (1 + LOCKUP_GAP_RATIO);
    viewW = textX + WORDMARK_WIDTH * scale;
    viewH = MARK_SIZE;
    body = (
      <>
        {mark}
        <G x={textX} y={(MARK_SIZE - WORDMARK_CAP * scale) / 2} scale={scale}>
          {wordmark}
        </G>
      </>
    );
  } else {
    const scale = STACK_WORD_WIDTH / WORDMARK_WIDTH;
    viewW = STACK_WORD_WIDTH;
    viewH = MARK_SIZE + STACK_GAP + WORDMARK_CAP * scale;
    body = (
      <>
        <G x={(STACK_WORD_WIDTH - MARK_SIZE) / 2}>{mark}</G>
        <G y={MARK_SIZE + STACK_GAP} scale={scale}>
          {wordmark}
        </G>
      </>
    );
  }

  return (
    <Svg
      width={width}
      height={(width * viewH) / viewW}
      viewBox={`0 0 ${viewW} ${viewH}`}
      accessibilityRole="image"
      accessibilityLabel="CardEngine"
    >
      {body}
    </Svg>
  );
}

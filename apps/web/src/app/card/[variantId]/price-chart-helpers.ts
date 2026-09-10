export interface ChartPoint {
  x: number;
  y: number;
}

export function buildLinePath(points: ChartPoint[]): string {
  return points
    .map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`)
    .join(" ");
}

export function nearestTimestamp(
  timestamps: number[],
  target: number
): number | null {
  if (timestamps.length === 0) return null;
  return timestamps.reduce((nearest, timestamp) =>
    Math.abs(timestamp - target) < Math.abs(nearest - target)
      ? timestamp
      : nearest
  );
}

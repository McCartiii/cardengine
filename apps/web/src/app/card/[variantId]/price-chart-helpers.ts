export interface ChartPoint {
  x: number;
  y: number;
}

export interface TimedPricePoint {
  time: number;
  amount: number;
}

export interface InterpolatedPrice {
  amount: number;
  fromTime: number;
  toTime: number;
  exact: boolean;
}

export function buildSmoothLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  return points.slice(1).reduce((path, point, index) => {
    const previous = points[index];
    const third = (point.x - previous.x) / 3;
    return `${path} C ${previous.x + third} ${previous.y}, ${point.x - third} ${point.y}, ${point.x} ${point.y}`;
  }, `M ${points[0].x} ${points[0].y}`);
}

export function interpolatePriceAtTime(
  points: TimedPricePoint[],
  target: number
): InterpolatedPrice | null {
  if (points.length === 0) return null;
  const sorted = [...points].sort((a, b) => a.time - b.time);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  if (target < first.time || target > last.time) {
    return null;
  }
  if (target === first.time || target === last.time) {
    const point = target === first.time ? first : last;
    return {
      amount: point.amount,
      fromTime: point.time,
      toTime: point.time,
      exact: true,
    };
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1];
    const after = sorted[index];
    if (target > after.time) continue;
    if (target === after.time) {
      return {
        amount: after.amount,
        fromTime: after.time,
        toTime: after.time,
        exact: true,
      };
    }
    const progress = (target - before.time) / (after.time - before.time);
    const easedProgress = progress * progress * (3 - 2 * progress);
    return {
      amount:
        before.amount + (after.amount - before.amount) * easedProgress,
      fromTime: before.time,
      toTime: after.time,
      exact: target === before.time,
    };
  }

  return null;
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

import { describe, expect, it } from "vitest";
import { buildLinePath, nearestTimestamp } from "./price-chart-helpers";

describe("price chart helpers", () => {
  it("builds a continuous line through every plotted price", () => {
    expect(
      buildLinePath([
        { x: 10, y: 20 },
        { x: 30, y: 40 },
        { x: 50, y: 25 },
      ])
    ).toBe("M 10 20 L 30 40 L 50 25");
  });

  it("snaps the hover tracker to the nearest observed date", () => {
    expect(nearestTimestamp([10, 20, 40], 33)).toBe(40);
    expect(nearestTimestamp([10, 20, 40], 26)).toBe(20);
    expect(nearestTimestamp([], 20)).toBeNull();
  });
});

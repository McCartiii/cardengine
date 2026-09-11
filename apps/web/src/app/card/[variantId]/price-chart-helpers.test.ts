import { describe, expect, it } from "vitest";
import {
  buildSmoothLinePath,
  interpolatePriceAtTime,
  nearestTimestamp,
} from "./price-chart-helpers";

describe("price chart helpers", () => {
  it("builds a smooth curve through every plotted price", () => {
    expect(
      buildSmoothLinePath([
        { x: 10, y: 20 },
        { x: 40, y: 50 },
      ])
    ).toBe("M 10 20 C 20 20, 30 50, 40 50");
  });

  it("snaps the hover tracker to the nearest observed date", () => {
    expect(nearestTimestamp([10, 20, 40], 33)).toBe(40);
    expect(nearestTimestamp([10, 20, 40], 26)).toBe(20);
    expect(nearestTimestamp([], 20)).toBeNull();
  });

  it("interpolates a fluid price at every cursor position", () => {
    expect(
      interpolatePriceAtTime(
        [
          { time: 100, amount: 10 },
          { time: 200, amount: 20 },
        ],
        125
      )
    ).toEqual({
      amount: 11.5625,
      fromTime: 100,
      toTime: 200,
      exact: false,
    });
  });

  it("does not present distant observations as current prices", () => {
    expect(interpolatePriceAtTime([{ time: 100, amount: 10 }], 500)).toBeNull();
  });

  it("returns exact observed prices without interpolation", () => {
    expect(
      interpolatePriceAtTime(
        [
          { time: 100, amount: 10 },
          { time: 200, amount: 20 },
        ],
        200
      )
    ).toEqual({
      amount: 20,
      fromTime: 200,
      toTime: 200,
      exact: true,
    });
  });
});

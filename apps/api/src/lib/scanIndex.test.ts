import { describe, expect, it } from "vitest";
import { buildScanIndex } from "./scanIndex";

describe("buildScanIndex", () => {
  it("groups printings by card, drops foil variants and strips the id prefix", () => {
    const index = buildScanIndex(
      [
        { variantId: "scryfall:a", cardId: "c1", name: "Shock", setId: "M21", collectorNumber: "159" },
        { variantId: "scryfall:a-foil", cardId: "c1", name: "Shock", setId: "M21", collectorNumber: "159" },
        { variantId: "scryfall:b", cardId: "c1", name: "Shock", setId: "STA", collectorNumber: "44" },
        { variantId: "scryfall:c", cardId: "c2", name: "Opt", setId: null, collectorNumber: null },
      ],
      "v1"
    );
    expect(index.prefix).toBe("scryfall:");
    expect(index.names).toEqual([
      ["Shock", "c1", [["a", "m21", "159"], ["b", "sta", "44"]]],
      ["Opt", "c2", [["c", "", ""]]],
    ]);
  });
});

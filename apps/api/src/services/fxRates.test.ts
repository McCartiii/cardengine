import { beforeEach, describe, expect, it, vi } from "vitest";
import { getFxRates, resetFxCache } from "./fxRates.js";

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("getFxRates", () => {
  beforeEach(() => resetFxCache());

  it("reads rates and caches them", async () => {
    const f = ok({ date: "2026-10-23", rates: { EUR: 0.9, GBP: 0.8, CAD: 1.4, AUD: 1.5 } });
    const r = await getFxRates(f);
    expect(r.rates).toEqual({ USD: 1, EUR: 0.9, GBP: 0.8, CAD: 1.4, AUD: 1.5 });
    expect(r.asOf).toBe("2026-10-23");
    await getFxRates(f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back when the source fails or sends junk", async () => {
    const down = vi.fn(async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const r = await getFxRates(down);
    expect(r.asOf).toBeNull();
    expect(r.rates.EUR).toBeGreaterThan(0);
    resetFxCache();
    const junk = await getFxRates(ok({ rates: { EUR: -1, GBP: "x" } }));
    expect(junk.rates.EUR).toBeGreaterThan(0);
    expect(junk.rates.GBP).toBeGreaterThan(0);
  });
});

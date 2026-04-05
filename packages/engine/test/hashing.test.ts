import { describe, it, expect } from "vitest";
import { computeDHash, computePHash, hammingDistance } from "../src/hashing/index.js";
import { HashIndex } from "../src/hashing/HashIndex.js";

function makePixels(width: number, height: number, fillFn: (x: number, y: number) => [number, number, number]): Uint8Array {
  const buf = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = fillFn(x, y);
      const i = (y * width + x) * 4;
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
    }
  }
  return buf;
}

describe("computeDHash", () => {
  it("returns a 64-bit bigint", () => {
    const pixels = makePixels(100, 100, () => [128, 128, 128]);
    const hash = computeDHash(pixels, 100, 100);
    expect(typeof hash).toBe("bigint");
    expect(hash >= 0n).toBe(true);
    expect(hash < (1n << 64n)).toBe(true);
  });

  it("identical images produce identical hashes", () => {
    const pixels = makePixels(200, 150, (x) => [x % 255, 100, 50]);
    expect(computeDHash(pixels, 200, 150)).toBe(computeDHash(pixels, 200, 150));
  });

  it("completely different images have high Hamming distance", () => {
    const leftToRight = makePixels(100, 100, (x) => { const v = Math.floor((x / 100) * 255); return [v, v, v]; });
    const rightToLeft = makePixels(100, 100, (x) => { const v = Math.floor(((100 - x) / 100) * 255); return [v, v, v]; });
    const dist = hammingDistance(computeDHash(leftToRight, 100, 100), computeDHash(rightToLeft, 100, 100));
    expect(dist).toBeGreaterThan(20);
  });

  it("slightly different images have low Hamming distance", () => {
    const a = makePixels(100, 100, (x, y) => [x * 2, y * 2, 100]);
    const b = makePixels(100, 100, (x, y) => [x * 2 + 5, y * 2 + 5, 105]);
    const dist = hammingDistance(computeDHash(a, 100, 100), computeDHash(b, 100, 100));
    expect(dist).toBeLessThan(10);
  });
});

describe("computePHash", () => {
  it("returns a 64-bit bigint", () => {
    const pixels = makePixels(100, 100, () => [128, 128, 128]);
    const hash = computePHash(pixels, 100, 100);
    expect(typeof hash).toBe("bigint");
    expect(hash >= 0n).toBe(true);
    expect(hash < (1n << 64n)).toBe(true);
  });

  it("identical images produce identical hashes", () => {
    const pixels = makePixels(200, 150, (x, y) => [x % 200, y % 150, 80]);
    expect(computePHash(pixels, 200, 150)).toBe(computePHash(pixels, 200, 150));
  });

  it("brightness-shifted image has low Hamming distance (foil tolerance)", () => {
    // Use a sinusoidal image (rich frequency content) so AC terms are well above float noise.
    // A uniform brightness shift (+40 luma) only changes the DC component, which is excluded.
    const base = makePixels(100, 100, (x, y) => [
      Math.floor(100 + 50 * Math.sin(x / 8) * Math.cos(y / 10)),
      Math.floor(90 + 45 * Math.sin(x / 5 + 1) * Math.cos(y / 8)),
      Math.floor(110 + 40 * Math.sin(x / 12) * Math.cos(y / 7)),
    ]);
    const foil = makePixels(100, 100, (x, y) => [
      Math.min(255, Math.floor(100 + 50 * Math.sin(x / 8) * Math.cos(y / 10)) + 40),
      Math.min(255, Math.floor(90 + 45 * Math.sin(x / 5 + 1) * Math.cos(y / 8)) + 40),
      Math.min(255, Math.floor(110 + 40 * Math.sin(x / 12) * Math.cos(y / 7)) + 40),
    ]);
    const dist = hammingDistance(computePHash(base, 100, 100), computePHash(foil, 100, 100));
    expect(dist).toBeLessThan(15);
  });
});

describe("hammingDistance", () => {
  it("same hash = distance 0", () => {
    expect(hammingDistance(0b1010n, 0b1010n)).toBe(0);
  });

  it("all bits differ = distance 64", () => {
    const all1s = (1n << 64n) - 1n;
    expect(hammingDistance(0n, all1s)).toBe(64);
  });

  it("one bit differs = distance 1", () => {
    expect(hammingDistance(0n, 1n)).toBe(1);
  });
});

describe("HashIndex", () => {
  it("finds an exact match", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 12345n, pHash: 67890n },
      { variantId: "v2", dHash: 99999n, pHash: 11111n },
    ]);
    const result = index.lookup(12345n, 67890n);
    expect(result?.variantId).toBe("v1");
    expect(result?.distance).toBe(0);
    expect(result?.matchType).toBe("dHash");
  });

  it("finds a close dHash match within threshold", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0b1111n, pHash: 0n },
    ]);
    const result = index.lookup(0b1110n, 0n, { dHashThreshold: 8 });
    expect(result?.variantId).toBe("v1");
    expect(result?.matchType).toBe("dHash");
  });

  it("falls back to pHash when dHash misses", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0n, pHash: 0b11111111n },
    ]);
    const result = index.lookup(0xFFFFFFFFFFFFFFFFn, 0b11110111n, { dHashThreshold: 8, pHashThreshold: 12 });
    expect(result?.variantId).toBe("v1");
    expect(result?.matchType).toBe("pHash");
  });

  it("returns null when nothing is within threshold", () => {
    const index = new HashIndex([
      { variantId: "v1", dHash: 0n, pHash: 0n },
    ]);
    const result = index.lookup(0xFFFFFFFFFFFFFFFFn, 0xFFFFFFFFFFFFFFFFn, { dHashThreshold: 8, pHashThreshold: 12 });
    expect(result).toBeNull();
  });

  it("checks foil hashes when present", () => {
    // row dHash=0n, foilDHash=0b111111110n
    // query dHash=0b111111111n: Hamming vs row dHash = 9 (> threshold 8, misses), Hamming vs foilDHash = 1 (hits)
    const index = new HashIndex([
      { variantId: "v1", dHash: 0n, pHash: 0n, foilDHash: 0b111111110n, foilPHash: 0n },
    ]);
    const result = index.lookup(0b111111111n, 0xFFFFFFFFFFFFFFFFn, { dHashThreshold: 8, pHashThreshold: 12 });
    expect(result?.variantId).toBe("v1");
    expect(result?.matchType).toBe("foilDHash");
  });
});

/**
 * Compute a 63-bit perceptual hash (pHash) via 2D DCT from an RGBA pixel array.
 * Downsamples to 32×32 luma, computes the top-left 8×8 DCT block, then
 * thresholds the 63 AC coefficients (DC at index 0 is excluded) at their median.
 * Excluding DC gives tolerance to uniform brightness shifts (foil cards).
 * Returns a bigint with bits 0–62 set; max Hamming distance between two pHashes is 63.
 */
export function computePHash(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): bigint {
  const SIZE = 32;

  const grid: number[] = new Array(SIZE * SIZE);
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const x = Math.min(width - 1, Math.floor((col / SIZE) * width));
      const y = Math.min(height - 1, Math.floor((row / SIZE) * height));
      const i = (y * width + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      grid[row * SIZE + col] = (r * 299 + g * 587 + b * 114) / 1000;
    }
  }

  const cos = (n: number, k: number): number =>
    Math.cos(((2 * n + 1) * k * Math.PI) / (2 * SIZE));

  const dct: number[] = new Array(64);
  for (let u = 0; u < 8; u++) {
    for (let v = 0; v < 8; v++) {
      let sum = 0;
      for (let x = 0; x < SIZE; x++) {
        const cx = cos(x, u);
        for (let y = 0; y < SIZE; y++) {
          sum += grid[x * SIZE + y]! * cx * cos(y, v);
        }
      }
      const cu = u === 0 ? 1 / Math.sqrt(2) : 1;
      const cv = v === 0 ? 1 / Math.sqrt(2) : 1;
      dct[u * 8 + v] = (2 / SIZE) * cu * cv * sum;
    }
  }

  const vals = dct.slice(1); // skip DC component (u=0,v=0) for brightness/foil tolerance
  const sorted = [...vals].sort((a, b) => a - b);
  const median = (sorted[30]! + sorted[31]!) / 2;

  let hash = 0n;
  for (let i = 0; i < 63; i++) {
    if (vals[i]! > median) {
      hash |= 1n << BigInt(i);
    }
  }
  return hash;
}

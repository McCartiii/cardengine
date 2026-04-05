export function computeDHash(
  pixels: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number
): bigint {
  const SAMPLE_COLS = 9;
  const SAMPLE_ROWS = 8;

  const luma = (col: number, row: number): number => {
    const x = Math.min(width - 1, Math.floor((col / SAMPLE_COLS) * width));
    const y = Math.min(height - 1, Math.floor((row / SAMPLE_ROWS) * height));
    const i = (y * width + x) * 4;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  let hash = 0n;
  let bit = 0;
  for (let row = 0; row < SAMPLE_ROWS; row++) {
    for (let col = 0; col < SAMPLE_COLS - 1; col++) {
      if (luma(col, row) > luma(col + 1, row)) {
        hash |= 1n << BigInt(bit);
      }
      bit++;
    }
  }
  return hash;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let diff = a ^ b;
  let count = 0;
  while (diff > 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/**
 * Worklet-compatible dHash for use inside VisionCamera frame processors.
 * Uses RGB (3-channel) pixel data from vision-camera-resize-plugin output.
 * The 'worklet' directive makes these functions run on the UI/camera thread.
 */

/** Compute dHash from a 9×8 RGB buffer (27 bytes). */
export function computeDHashFromRGB9x8(buffer: Uint8Array): string {
  'worklet';
  let lo = 0;
  let hi = 0;
  let bit = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const i1 = (row * 9 + col) * 3;
      const i2 = (row * 9 + col + 1) * 3;
      const r1 = buffer[i1] ?? 0;
      const g1 = buffer[i1 + 1] ?? 0;
      const b1 = buffer[i1 + 2] ?? 0;
      const r2 = buffer[i2] ?? 0;
      const g2 = buffer[i2 + 1] ?? 0;
      const b2 = buffer[i2 + 2] ?? 0;
      const luma1 = (r1 * 299 + g1 * 587 + b1 * 114) / 1000;
      const luma2 = (r2 * 299 + g2 * 587 + b2 * 114) / 1000;

      if (luma1 > luma2) {
        if (bit < 32) {
          lo |= 1 << bit;
        } else {
          hi |= 1 << (bit - 32);
        }
      }
      bit++;
    }
  }

  // Return as 16-char hex string (two 32-bit halves)
  return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
}

/**
 * Compute dHash from an RGBA pixel array (JS thread, for binder scan).
 * Used when processing captured photos via expo-image-manipulator.
 */
export function computeDHashFromRGBA(
  pixels: Uint8Array,
  width: number,
  height: number
): string {
  const luma = (col: number, row: number): number => {
    const sx = Math.min(width - 1, Math.floor((col / 9) * width));
    const sy = Math.min(height - 1, Math.floor((row / 8) * height));
    const i = (sy * width + sx) * 4;
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    return (r * 299 + g * 587 + b * 114) / 1000;
  };

  let lo = 0;
  let hi = 0;
  let bit = 0;

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if (luma(col, row) > luma(col + 1, row)) {
        if (bit < 32) lo |= 1 << bit;
        else hi |= 1 << (bit - 32);
      }
      bit++;
    }
  }

  return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
}

/**
 * Compute pHash from an RGBA pixel array (JS thread, for binder scan).
 * Slower than dHash but more tolerant of foil/lighting shifts.
 * Uses 63 AC DCT coefficients (DC component excluded) for brightness tolerance.
 */
export function computePHashFromRGBA(
  pixels: Uint8Array,
  width: number,
  height: number
): string {
  const SIZE = 32;
  const grid: number[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const x = Math.min(width - 1, Math.floor((col / SIZE) * width));
      const y = Math.min(height - 1, Math.floor((row / SIZE) * height));
      const i = (y * width + x) * 4;
      const r = pixels[i] ?? 0;
      const g = pixels[i + 1] ?? 0;
      const b = pixels[i + 2] ?? 0;
      grid.push((r * 299 + g * 587 + b * 114) / 1000);
    }
  }

  const cos = (n: number, k: number): number =>
    Math.cos(((2 * n + 1) * k * Math.PI) / (2 * SIZE));

  const dct: number[] = [];
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
      dct.push((2 / SIZE) * cu * cv * sum);
    }
  }

  // Skip DC component (index 0) for brightness/foil tolerance — 63 AC coefficients
  const vals = dct.slice(1);
  const sorted = [...vals].sort((a, b) => a - b);
  const median = (sorted[30]! + sorted[31]!) / 2;

  let lo = 0;
  let hi = 0;
  for (let i = 0; i < 63; i++) {
    if (vals[i]! > median) {
      if (i < 32) lo |= 1 << i;
      else hi |= 1 << (i - 32);
    }
  }

  return lo.toString(16).padStart(8, "0") + hi.toString(16).padStart(8, "0");
}

/** Hamming distance between two 16-char hex hash strings. */
export function hammingDistanceHex(a: string, b: string): number {
  let dist = 0;
  for (let i = 0; i < a.length; i += 8) {
    const va = parseInt(a.slice(i, i + 8), 16);
    const vb = parseInt(b.slice(i, i + 8), 16);
    let xor = (va ^ vb) >>> 0;
    while (xor > 0) {
      dist += xor & 1;
      xor >>>= 1;
    }
  }
  return dist;
}

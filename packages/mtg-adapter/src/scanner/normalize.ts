const CHAR_CONFUSIONS: [RegExp, string][] = [
  [/O(?=\d)/g, "0"],
  [/(?<=\d)O/g, "0"],
  [/I(?=\d)/g, "1"],
  [/(?<=\d)I/g, "1"],
  [/l(?=\d)/g, "1"],
  [/(?<=\d)l/g, "1"],
  [/S(?=\d{2})/g, "5"],
  [/(?<=\d)S/g, "5"],
  [/B(?=\d{2})/g, "8"],
];

export function normalizeCardName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[\u2018\u2019\u0060]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\x20-\x7E]/g, "");
}

export function normalizeCollectorNumber(raw: string): string {
  let s = raw.trim().toUpperCase();
  for (const [pattern, replacement] of CHAR_CONFUSIONS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/[^A-Z0-9/]/g, "");
}

export function normalizeSetCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ocrConfidenceScore(input: {
  nameRaw: string;
  collectorNumberRaw?: string;
  setCodeRaw?: string;
}): number {
  let score = 0;
  const name = normalizeCardName(input.nameRaw);
  if (name.length >= 3) score += 40;
  if (name.length >= 6) score += 10;
  if (input.collectorNumberRaw) {
    const cn = normalizeCollectorNumber(input.collectorNumberRaw);
    if (/^\d+[A-Z]?$/.test(cn)) score += 30;
    else if (cn.length > 0) score += 15;
  }
  if (input.setCodeRaw) {
    const set = normalizeSetCode(input.setCodeRaw);
    if (/^[A-Z0-9]{2,5}$/.test(set)) score += 20;
  }
  return Math.min(score, 100);
}

import { normalizeCardName, normalizeCollectorNumber, normalizeSetCode, ocrConfidenceScore } from "./normalize.js";
import type { CardIndex, ScanCandidate } from "./candidateSearch.js";

export interface OcrResult {
  nameRaw: string;
  collectorNumberRaw?: string;
  setCodeRaw?: string;
  platformConfidence?: number;
}

export interface NormalizedOcr {
  name: string;
  collectorNumber?: string;
  setCode?: string;
  confidence: number;
}

export interface ScanPipelineResult {
  ocr: NormalizedOcr;
  candidates: ScanCandidate[];
  autoConfirmed: boolean;
}

const AUTO_CONFIRM_THRESHOLD = 80;
const DISAMBIGUATION_THRESHOLD = 20;

export function runScanPipeline(input: {
  ocrResult: OcrResult;
  cardIndex: CardIndex;
}): ScanPipelineResult {
  const { ocrResult, cardIndex } = input;

  const name = normalizeCardName(ocrResult.nameRaw);
  const collectorNumber = ocrResult.collectorNumberRaw
    ? normalizeCollectorNumber(ocrResult.collectorNumberRaw)
    : undefined;
  const setCode = ocrResult.setCodeRaw
    ? normalizeSetCode(ocrResult.setCodeRaw)
    : undefined;

  const confInput: { nameRaw: string; collectorNumberRaw?: string; setCodeRaw?: string } = {
    nameRaw: ocrResult.nameRaw,
  };
  if (ocrResult.collectorNumberRaw) confInput.collectorNumberRaw = ocrResult.collectorNumberRaw;
  if (ocrResult.setCodeRaw) confInput.setCodeRaw = ocrResult.setCodeRaw;

  const confidence = ocrConfidenceScore(confInput);
  const ocr: NormalizedOcr = { name, confidence };
  if (collectorNumber) ocr.collectorNumber = collectorNumber;
  if (setCode) ocr.setCode = setCode;

  const searchInput: { limit: number; name?: string; collectorNumber?: string; setCode?: string } = { limit: 3 };
  if (name) searchInput.name = name;
  if (collectorNumber) searchInput.collectorNumber = collectorNumber;
  if (setCode) searchInput.setCode = setCode;

  const candidates = cardIndex.search(searchInput);
  const topCandidate = candidates[0];
  const autoConfirmed =
    topCandidate != null &&
    topCandidate.confidence >= AUTO_CONFIRM_THRESHOLD &&
    (candidates.length < 2 || candidates[1].confidence < topCandidate.confidence - 20);

  const viableCandidates = candidates.filter((c) => c.confidence >= DISAMBIGUATION_THRESHOLD);

  return { ocr, candidates: viableCandidates, autoConfirmed };
}

export function selectBestFrame(frames: OcrResult[]): OcrResult | null {
  if (frames.length === 0) return null;
  let best = frames[0];
  let bestScore = frameScore(best);
  for (let i = 1; i < frames.length; i++) {
    const frame = frames[i];
    const score = frameScore(frame);
    if (score > bestScore) {
      best = frame;
      bestScore = score;
    }
  }
  return best;
}

function frameScore(f: OcrResult): number {
  const input: { nameRaw: string; collectorNumberRaw?: string; setCodeRaw?: string } = {
    nameRaw: f.nameRaw,
  };
  if (f.collectorNumberRaw) input.collectorNumberRaw = f.collectorNumberRaw;
  if (f.setCodeRaw) input.setCodeRaw = f.setCodeRaw;
  return ocrConfidenceScore(input);
}

export { MTG_FORMATS } from "./formats.js";
export { MtgRulesEngine } from "./rules/mtgRulesEngine.js";
export { computeMtgDeckStats, type MtgDeckStats } from "./stats/deckStats.js";
export {
  normalizeCardName,
  normalizeCollectorNumber,
  normalizeSetCode,
  ocrConfidenceScore,
} from "./scanner/normalize.js";
export {
  InMemoryCardIndex,
  type CardIndex,
  type ScanCandidate,
} from "./scanner/candidateSearch.js";
export {
  runScanPipeline,
  selectBestFrame,
  type OcrResult,
  type NormalizedOcr,
  type ScanPipelineResult,
} from "./scanner/pipeline.js";

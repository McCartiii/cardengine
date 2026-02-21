import { useCallback, useRef } from "react";
import { runOnJS } from "react-native-reanimated";
import { useFrameProcessor } from "react-native-vision-camera";
import TextRecognition from "react-native-vision-camera-text-recognition";
import * as Haptics from "expo-haptics";
import { scanIdentify } from "../lib/api";
import { useScanStore } from "../store/scanStore";
import { SCANNER } from "../lib/constants";

// ── OCR text → card name extraction ─────────────────────────────────────────

/**
 * Given raw OCR output from a card frame, extract the most likely card name.
 *
 * MTG card names appear at the top of the card in large title-case text.
 * We take the first line that looks like a name (letters/spaces/apostrophes,
 * no digits, no mana-symbol-only strings, reasonable length).
 */
function extractCardName(rawText: string): string | null {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Must be within length bounds
    if (line.length < SCANNER.MIN_NAME_LEN || line.length > SCANNER.MAX_NAME_LEN) continue;
    // Must start with a letter
    if (!/^[A-Za-z]/.test(line)) continue;
    // Only letters, spaces, apostrophes, commas, hyphens
    if (!/^[A-Za-z][A-Za-z ',\-]*$/.test(line)) continue;
    // Skip obvious non-names: pure mana colors, "Instant", "Sorcery" alone, etc.
    if (/^(Instant|Sorcery|Artifact|Enchantment|Land|Creature|Planeswalker|Battle)$/i.test(line)) continue;
    // Skip power/toughness patterns like "2/2"
    if (/^\d+\/\d+$/.test(line)) continue;

    return line;
  }

  return null;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCardScanner() {
  const { addPending, setDetectedName } = useScanStore();

  // Refs live on the JS thread and survive renders without causing them
  const frameCount = useRef(0);
  const lastSeenText = useRef<{ text: string; since: number } | null>(null);
  const recentlyScanned = useRef<Map<string, number>>(new Map()); // name → timestamp
  const identifying = useRef(false); // prevent overlapping API calls

  // Runs on JS thread — called from worklet via runOnJS
  const onOCRResult = useCallback(
    async (rawText: string) => {
      const cardName = extractCardName(rawText);

      if (!cardName) {
        setDetectedName(null);
        lastSeenText.current = null;
        return;
      }

      const now = Date.now();
      const nameLower = cardName.toLowerCase();

      // Dedup: skip if we scanned this card recently
      const lastScan = recentlyScanned.current.get(nameLower);
      if (lastScan && now - lastScan < SCANNER.DEDUP_WINDOW_MS) {
        setDetectedName(cardName); // still show the name as feedback
        return;
      }

      // Stability: the same text must appear for STABILITY_MS before triggering
      if (lastSeenText.current?.text !== cardName) {
        lastSeenText.current = { text: cardName, since: now };
        setDetectedName(cardName);
        return;
      }

      if (now - lastSeenText.current.since < SCANNER.STABILITY_MS) {
        setDetectedName(cardName);
        return;
      }

      // Guard against concurrent calls
      if (identifying.current) return;
      identifying.current = true;

      // Reset stability tracker so the same card doesn't double-trigger
      lastSeenText.current = null;
      recentlyScanned.current.set(nameLower, now);

      try {
        const result = await scanIdentify({ name: cardName });
        const best = result.candidates[0];

        if (best && best.score >= SCANNER.MIN_CONFIDENCE_SCORE) {
          addPending(best);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else {
          // Low confidence — clear dedup so it can try again sooner
          recentlyScanned.current.delete(nameLower);
        }
      } catch {
        // Network error — clear dedup so it retries
        recentlyScanned.current.delete(nameLower);
      } finally {
        identifying.current = false;
      }
    },
    [addPending, setDetectedName]
  );

  // Frame processor — runs as a worklet on the camera thread (no JS bridge)
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      // Throttle: only process every FRAME_INTERVAL frames
      frameCount.value = (frameCount.value ?? 0) + 1;
      if (frameCount.value % SCANNER.FRAME_INTERVAL !== 0) return;

      const result = TextRecognition.recognize(frame);
      if (result?.text) {
        runOnJS(onOCRResult)(result.text);
      }
    },
    [onOCRResult]
  );

  return { frameProcessor };
}

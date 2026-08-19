import { useCallback, useEffect, useRef } from "react";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import { useFrameProcessor } from "react-native-vision-camera";
import { useTextRecognition } from "react-native-vision-camera-text-recognition";
import { useResizePlugin } from "vision-camera-resize-plugin";
import * as Haptics from "expo-haptics";
import { scanIdentify } from "../lib/api";
import { resolveVariantToCandidate } from "../lib/resolveVariant";
import { useScanStore } from "../store/scanStore";
import { SCANNER } from "../lib/constants";
import { computeDHashFromRGB9x8 } from "../scanner/hashUtils";
import {
  ensureHashIndexReady,
  isHashIndexReady,
  lookupHash,
} from "../scanner/hashIndexManager";

// ── OCR text → card name extraction ─────────────────────────────────────────

function extractCardName(rawText: string): string | null {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.length < SCANNER.MIN_NAME_LEN || line.length > SCANNER.MAX_NAME_LEN) continue;
    if (!/^[A-Za-z]/.test(line)) continue;
    if (!/^[A-Za-z][A-Za-z ',\-]*$/.test(line)) continue;
    if (/^(Instant|Sorcery|Artifact|Enchantment|Land|Creature|Planeswalker|Battle)$/i.test(line)) continue;
    if (/^\d+\/\d+$/.test(line)) continue;
    return line;
  }

  return null;
}

const HASH_RING_SIZE = 8;
const HASH_CONFIRM_COUNT = 3;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCardScanner() {
  const { addPending, setDetectedName, setDetectedPrice, setHashIndexReady } = useScanStore();

  const frameCount = useSharedValue(0);
  const hashReady = useSharedValue(false);

  const lastSeenText = useRef<{ text: string; since: number } | null>(null);
  const recentlyScanned = useRef<Map<string, number>>(new Map());
  const identifying = useRef(false);

  const hashRing = useRef<Array<string | null>>(new Array(HASH_RING_SIZE).fill(null));
  const hashRingIdx = useRef(0);
  const lastHashVariant = useRef<string | null>(null);

  useEffect(() => {
    ensureHashIndexReady().then((ok) => {
      hashReady.value = ok;
      setHashIndexReady(ok);
    });
  }, [hashReady, setHashIndexReady]);

  const confirmCandidate = useCallback(
    async (
      candidate: Awaited<ReturnType<typeof resolveVariantToCandidate>>,
      matchMethod: "hash" | "ocr" | "api"
    ) => {
      if (!candidate) return;

      const nameLower = candidate.name.toLowerCase();
      const now = Date.now();
      const lastScan = recentlyScanned.current.get(nameLower);
      if (lastScan && now - lastScan < SCANNER.DEDUP_WINDOW_MS) {
        setDetectedName(candidate.name);
        return;
      }

      recentlyScanned.current.set(nameLower, now);
      lastSeenText.current = null;
      lastHashVariant.current = candidate.variantId;

      await addPending(candidate, matchMethod);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const usdPrice = candidate.prices.find((p) => p.currency === "USD" && p.kind === "market");
      setDetectedPrice(usdPrice ? `$${usdPrice.amount.toFixed(2)}` : null);
      setDetectedName(candidate.name);
    },
    [addPending, setDetectedName, setDetectedPrice]
  );

  const onHashFrame = useCallback(
    async (dHashHex: string) => {
      if (!isHashIndexReady() || identifying.current) return;

      const match = lookupHash(dHashHex);
      const variantId = match?.variantId ?? null;

      hashRing.current[hashRingIdx.current % HASH_RING_SIZE] = variantId;
      hashRingIdx.current++;

      if (!variantId) return;

      const counts: Record<string, number> = {};
      for (const id of hashRing.current) {
        if (id) counts[id] = (counts[id] ?? 0) + 1;
      }

      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!top || top[1] < HASH_CONFIRM_COUNT) return;

      const matchedId = top[0];
      if (matchedId === lastHashVariant.current) return;

      identifying.current = true;
      hashRing.current = new Array(HASH_RING_SIZE).fill(null);
      hashRingIdx.current = 0;

      try {
        const score = match?.confidence === "high" ? 95 : 85;
        const candidate = await resolveVariantToCandidate(
          matchedId,
          `hash:${match?.matchType ?? "dHash"}`,
          score
        );
        await confirmCandidate(candidate, "hash");
      } finally {
        identifying.current = false;
      }
    },
    [confirmCandidate]
  );

  const onOCRResult = useCallback(
    async (rawText: string) => {
      if (identifying.current) return;

      const cardName = extractCardName(rawText);

      if (!cardName) {
        setDetectedName(null);
        setDetectedPrice(null);
        lastSeenText.current = null;
        return;
      }

      const now = Date.now();
      const nameLower = cardName.toLowerCase();

      const lastScan = recentlyScanned.current.get(nameLower);
      if (lastScan && now - lastScan < SCANNER.DEDUP_WINDOW_MS) {
        setDetectedName(cardName);
        return;
      }

      if (lastSeenText.current?.text !== cardName) {
        lastSeenText.current = { text: cardName, since: now };
        setDetectedName(cardName);
        return;
      }

      if (now - lastSeenText.current.since < SCANNER.STABILITY_MS) {
        setDetectedName(cardName);
        return;
      }

      identifying.current = true;
      lastSeenText.current = null;
      recentlyScanned.current.set(nameLower, now);

      try {
        const result = await scanIdentify({ name: cardName });
        const best = result.candidates[0];

        if (best && best.score >= SCANNER.MIN_CONFIDENCE_SCORE) {
          await confirmCandidate(best, "ocr");
        } else {
          recentlyScanned.current.delete(nameLower);
        }
      } catch {
        recentlyScanned.current.delete(nameLower);
      } finally {
        identifying.current = false;
      }
    },
    [confirmCandidate, setDetectedName, setDetectedPrice]
  );

  const { scanText } = useTextRecognition({ language: "latin" });
  const { resize } = useResizePlugin();

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      frameCount.value = frameCount.value + 1;
      const n = frameCount.value;

      if (hashReady.value && n % 3 === 0) {
        try {
          const resized = resize(frame, {
            scale: { width: 9, height: 8 },
            pixelFormat: "rgb",
            dataType: "uint8",
          });
          const dHash = computeDHashFromRGB9x8(new Uint8Array(resized.buffer));
          runOnJS(onHashFrame)(dHash);
        } catch {
          // ignore resize errors
        }
      }

      if (n % SCANNER.FRAME_INTERVAL === 0) {
        const result = scanText(frame);
        const text = Array.isArray(result)
          ? result.map((t) => t.resultText).filter(Boolean).join("\n")
          : "";
        if (text) {
          runOnJS(onOCRResult)(text);
        }
      }
    },
    [onHashFrame, onOCRResult, scanText, resize, hashReady]
  );

  return { frameProcessor, hashIndexReady: isHashIndexReady() };
}

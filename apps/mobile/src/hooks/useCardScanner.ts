import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { useTextRecognition } from "react-native-vision-camera-text-recognition";
import { useSharedValue, Worklets } from "react-native-worklets-core";
import { haptic } from "@/lib/haptics";
import { scanIdentify, type ScanCandidate } from "../lib/api";
import { useScanStore } from "../store/scanStore";
import { SCANNER } from "../lib/constants";
import { extractCardName, extractPrintInfo } from "../lib/scanText";
import { getCardMatcher, loadCardMatcher } from "../lib/scanIndex";
import { scryfallImage, type CardMatch } from "../lib/cardMatcher";

// A card counts as gone (and can be scanned again) after this many frames without it.
const FRAMES_TO_REARM = 4;
// After a failed lookup, wait this long before asking about the same name again.
const RETRY_AFTER_MS = 2500;

/** A scan candidate built from the on-device index; prices arrive later from the server. */
function localCandidate(
  match: CardMatch,
  variantId: string,
  printing: { setId: string | null; collectorNumber: string | null } = match
): ScanCandidate {
  return {
    variantId,
    cardId: match.cardId,
    name: match.name,
    setId: printing.setId,
    collectorNumber: printing.collectorNumber,
    imageUri: scryfallImage(variantId),
    manaCost: null,
    typeLine: null,
    rarity: null,
    score: 100,
    matchType: match.kind,
    prices: [],
    pricing: true,
  };
}

/**
 * Reads cards from camera frames and adds each match to the pending stack.
 *
 * With the on-device index loaded, a read that matches a card's exact name
 * (or its set + collector number) is accepted on that very frame; a fuzzy
 * read needs a second frame that agrees. Prices and other printings are
 * filled in from the server afterwards, so nothing waits on the network.
 * Without the index it falls back to asking the server once a name holds
 * steady. A card left in frame is added once; it has to leave the frame
 * before it can count again.
 */
export function useCardScanner({ enabled }: { enabled: boolean }) {
  const { addPending, setPhase, enrich } = useScanStore();
  const { scanText } = useTextRecognition({ language: "latin" });

  // Shared with the camera thread, so it must be a worklets-core shared value
  const frameCount = useSharedValue(0);

  // Refs live on the JS thread and survive renders without causing them
  const steady = useRef<{ id: string; since: number } | null>(null);
  const lastAdded = useRef<{ id: string; missing: number } | null>(null);
  const identifying = useRef(false);
  const failed = useRef<{ id: string; at: number } | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    void loadCardMatcher();
  }, []);

  const accept = useCallback(
    (id: string, candidate: ScanCandidate, alternatives: ScanCandidate[], foil: boolean) => {
      const key = addPending(candidate, { finish: foil ? "foil" : "nonfoil", alternatives });
      lastAdded.current = { id, missing: 0 };
      steady.current = null;
      setPhase("matched", candidate.name);
      haptic.success();
      return key;
    },
    [addPending, setPhase]
  );

  const onOCRResult = useCallback(
    async (rawText: string) => {
      if (!enabledRef.current || identifying.current) return;
      const cardName = extractCardName(rawText);
      const print = cardName ? extractPrintInfo(rawText) : null;
      const local = cardName ? getCardMatcher()?.match(cardName, print ?? undefined) ?? null : null;
      // What this frame shows: a known card, or (without a local match) a name to look up.
      const id = local ? `card:${local.cardId}` : cardName ? `name:${cardName.toLowerCase()}` : null;

      // Re-arm once the last card has been out of frame for a few reads.
      if (lastAdded.current && id !== lastAdded.current.id) {
        lastAdded.current.missing += 1;
        if (lastAdded.current.missing >= FRAMES_TO_REARM) lastAdded.current = null;
      } else if (lastAdded.current) {
        lastAdded.current.missing = 0;
        return; // Still the card we just added.
      }

      if (!cardName || !id) {
        steady.current = null;
        if (!lastAdded.current) setPhase("searching", null);
        return;
      }

      const now = Date.now();
      const repeated = steady.current?.id === id;
      if (!repeated) steady.current = { id, since: now };

      // Instant path: matched on the phone.
      if (local) {
        if (local.kind === "fuzzy" && !repeated) {
          setPhase("reading", local.name);
          return;
        }
        const candidate = localCandidate(local, local.variantId);
        const alternatives = local.printings.filter((p) => p.variantId !== local.variantId).map((p) => localCandidate(local, p.variantId, p));
        const key = accept(id, candidate, alternatives, !!print?.foil);
        // Fill in prices and the other printings without holding up the next card.
        scanIdentify({ name: local.name, setCode: local.setId ?? undefined, collectorNumber: local.collectorNumber ?? undefined })
          .then((res) => {
            // Prices only from this exact printing; another printing's would be wrong.
            const same = [...res.candidates, ...(res.printings ?? [])].find((c) => c.variantId === local.variantId);
            const printings = (res.printings ?? []).filter((p) => p.variantId !== local.variantId);
            enrich(key, local.variantId, same ? { prices: same.prices, imageUri: same.imageUri, rarity: same.rarity, typeLine: same.typeLine, manaCost: same.manaCost } : {}, printings);
          })
          .catch(() => enrich(key, local.variantId, {}));
        return;
      }

      // Fallback: ask the server once the name has held steady.
      if (failed.current?.id === id && now - failed.current.at < RETRY_AFTER_MS) return;
      if (!repeated) {
        setPhase("reading", cardName);
        return;
      }
      if (now - steady.current!.since < SCANNER.STABILITY_MS) return;

      identifying.current = true;
      setPhase("identifying", cardName);
      try {
        const result = await scanIdentify({
          name: cardName,
          setCode: print?.setCode ?? undefined,
          collectorNumber: print?.collectorNumber ?? undefined,
        });
        const [best, ...others] = result.candidates;
        if (best && best.score >= SCANNER.MIN_CONFIDENCE_SCORE) {
          const printings = (result.printings ?? []).filter((p) => p.variantId !== best.variantId);
          accept(id, best, [...printings, ...others], !!print?.foil);
        } else {
          failed.current = { id, at: Date.now() };
          setPhase("nomatch", cardName);
          haptic.warning();
        }
      } catch {
        failed.current = { id, at: Date.now() };
        setPhase("nomatch", cardName);
      } finally {
        identifying.current = false;
      }
    },
    [accept, enrich, setPhase]
  );

  // Frame processors run on worklets-core, so Reanimated's runOnJS can't bridge back
  const onOCRResultJS = useMemo(() => Worklets.createRunOnJS(onOCRResult), [onOCRResult]);

  // Frame processor — runs as a worklet on the camera thread (no JS bridge)
  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";

      // Throttle: only process every FRAME_INTERVAL frames
      frameCount.value = frameCount.value + 1;
      if (frameCount.value % SCANNER.FRAME_INTERVAL !== 0) return;

      // The plugin is typed as returning Text[], but its native side returns a
      // single { resultText } object. Accept either shape.
      const result = scanText(frame) as unknown;
      const text = Array.isArray(result)
        ? result.map((r: { resultText?: string }) => r.resultText ?? "").join("\n")
        : (result as { resultText?: string } | undefined)?.resultText;
      onOCRResultJS(text ?? "");
    },
    [scanText, frameCount, onOCRResultJS]
  );

  return { frameProcessor };
}

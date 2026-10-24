import { useCallback, useMemo, useRef } from "react";
import { useFrameProcessor } from "react-native-vision-camera";
import { useTextRecognition } from "react-native-vision-camera-text-recognition";
import { useSharedValue, Worklets } from "react-native-worklets-core";
import * as Haptics from "expo-haptics";
import { scanIdentify } from "../lib/api";
import { useScanStore } from "../store/scanStore";
import { SCANNER } from "../lib/constants";
import { extractCardName, extractPrintInfo } from "../lib/scanText";

// A card counts as gone (and can be scanned again) after this many frames without it.
const FRAMES_TO_REARM = 4;
// After a failed lookup, wait this long before asking about the same name again.
const RETRY_AFTER_MS = 2500;

/**
 * Reads cards from camera frames: waits for a name to hold steady, asks the
 * server to identify it (with set and collector number when the small print
 * is legible), and adds the match to the pending stack. A card left in frame
 * is added once; it has to leave the frame before it can count again.
 */
export function useCardScanner({ enabled }: { enabled: boolean }) {
  const { addPending, setPhase } = useScanStore();
  const { scanText } = useTextRecognition({ language: "latin" });

  // Shared with the camera thread, so it must be a worklets-core shared value
  const frameCount = useSharedValue(0);

  // Refs live on the JS thread and survive renders without causing them
  const steady = useRef<{ name: string; since: number } | null>(null);
  const lastAdded = useRef<{ name: string; missing: number } | null>(null);
  const identifying = useRef(false);
  const failed = useRef<{ name: string; at: number } | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const onOCRResult = useCallback(
    async (rawText: string) => {
      if (!enabledRef.current || identifying.current) return;
      const cardName = extractCardName(rawText);
      const key = cardName?.toLowerCase() ?? null;

      // Re-arm once the last card has been out of frame for a few reads.
      if (lastAdded.current && key !== lastAdded.current.name) {
        lastAdded.current.missing += 1;
        if (lastAdded.current.missing >= FRAMES_TO_REARM) lastAdded.current = null;
      } else if (lastAdded.current) {
        lastAdded.current.missing = 0;
        return; // Still the card we just added.
      }

      if (!cardName || !key) {
        steady.current = null;
        if (!lastAdded.current) setPhase("searching", null);
        return;
      }

      // The same name must hold for STABILITY_MS before we spend a lookup on it.
      const now = Date.now();
      if (failed.current?.name === key && now - failed.current.at < RETRY_AFTER_MS) return;
      if (steady.current?.name !== key) {
        steady.current = { name: key, since: now };
        setPhase("reading", cardName);
        return;
      }
      if (now - steady.current.since < SCANNER.STABILITY_MS) return;

      identifying.current = true;
      steady.current = null;
      setPhase("identifying", cardName);
      const print = extractPrintInfo(rawText);

      try {
        const result = await scanIdentify({
          name: cardName,
          setCode: print.setCode ?? undefined,
          collectorNumber: print.collectorNumber ?? undefined,
        });
        const [best, ...others] = result.candidates;
        if (best && best.score >= SCANNER.MIN_CONFIDENCE_SCORE) {
          const printings = (result.printings ?? []).filter((p) => p.variantId !== best.variantId);
          addPending(best, { finish: print.foil ? "foil" : "nonfoil", alternatives: [...printings, ...others] });
          lastAdded.current = { name: key, missing: 0 };
          setPhase("matched", best.name);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        } else {
          failed.current = { name: key, at: Date.now() };
          setPhase("nomatch", cardName);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
      } catch {
        failed.current = { name: key, at: Date.now() };
        setPhase("nomatch", cardName);
      } finally {
        identifying.current = false;
      }
    },
    [addPending, setPhase]
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

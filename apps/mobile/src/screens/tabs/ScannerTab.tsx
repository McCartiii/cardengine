import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  Vibration,
  FlatList,
  Dimensions,
} from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming, runOnJS } from "react-native-reanimated";
import Animated from "react-native-reanimated";
import { getDb, insertLedgerEvent, searchCards, loadHashIndex } from "../../lib/localDb";
import { downloadHashBundle } from "../../lib/sync";
import { colors, spacing, radii, typography, tabColors } from "../../theme";
import { MobileHashIndex } from "../../scanner/HashIndex";
import { computeDHashFromRGB9x8 } from "../../scanner/hashUtils";

const t = colors.light;
const tc = tabColors.scanner;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CELL_SIZE = (SCREEN_WIDTH - 32) / 3;

// ── Dynamic imports (not available in Expo Go) ──
let Camera: React.ComponentType<any> | null = null;
let useFrameProcessor: ((...args: any[]) => any) | null = null;
let useResizePlugin: (() => any) | null = null;
let TextRecognition: { recognize: (uri: string) => Promise<any> } | null = null;
let ImageManipulator: any = null;

try {
  const VisionCamera = require("react-native-vision-camera");
  Camera = VisionCamera.Camera;
  useFrameProcessor = VisionCamera.useFrameProcessor;
} catch { /* not available in Expo Go */ }

try {
  const ResizePlugin = require("vision-camera-resize-plugin");
  useResizePlugin = ResizePlugin.useResizePlugin;
} catch { /* not available in Expo Go */ }

try {
  TextRecognition = require("@react-native-ml-kit/text-recognition").default;
} catch { /* not available */ }

try {
  ImageManipulator = require("expo-image-manipulator");
} catch { /* not available */ }

// ── Types ──
type ScanMode = "rapid" | "binder";
type GridSize = 9 | 12;
type OverlayState = "idle" | "detecting" | "confirmed" | "lowConfidence" | "ocrFallback";

interface ScanCandidate {
  variantId: string;
  cardId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  imageUri?: string;
  manaCost?: string;
  typeLine?: string;
  rarity?: string;
  score: number;
  matchType: string;
  prices?: Array<{ market: string; kind: string; currency: string; amount: number }>;
}

interface ScannedCard {
  variantId: string;
  cardId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  imageUri?: string;
  quantity: number;
  priceUsd: number;
  addedToCollection: boolean;
}

interface BinderCell {
  variantId: string;
  name: string;
  imageUri?: string;
  setId?: string;
  confidence: "high" | "medium" | "none";
  selected: boolean;
}

// ── Levenshtein (OCR fallback) ──
function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]!
        : 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
    }
    prev = curr;
  }
  return prev[lb]!;
}

// ── OCR field extraction (fallback) ──
function extractCardFields(result: any): {
  name: string; setCode?: string; collectorNumber?: string;
} {
  const blocks = result?.blocks ?? [];
  let nameBlock = "";
  let bottomText = "";
  const imgHeight = result?.height ?? 1000;
  const imgWidth = result?.width ?? 700;
  for (const block of blocks) {
    const frame = block.frame ?? block.boundingBox ?? {};
    const y = frame.y ?? frame.top ?? 0;
    const x = frame.x ?? frame.left ?? 0;
    const text = (block.text ?? "").trim();
    if (!text) continue;
    const yRatio = y / imgHeight;
    const xRatio = x / imgWidth;
    if (yRatio < 0.15 && xRatio < 0.6) {
      if (!nameBlock) nameBlock = text;
    } else if (yRatio > 0.85) {
      bottomText += " " + text;
    }
  }
  if (!nameBlock) {
    const lines = (result?.text ?? "").split("\n").filter((l: string) => l.trim().length > 1);
    nameBlock = lines[0] ?? "";
  }
  const name = nameBlock.replace(/[^a-zA-Z0-9\s,'-]/g, "").trim();
  let setCode: string | undefined;
  let collectorNumber: string | undefined;
  const bottomMatch = bottomText.match(/([A-Z]{3,5})\s*[·•.\-]?\s*(\d{1,4}[a-z]?)/i);
  if (bottomMatch) {
    setCode = bottomMatch[1]!.toUpperCase();
    collectorNumber = bottomMatch[2];
  }
  return { name, setCode, collectorNumber };
}

// ── OCR offline match (fallback) ──
async function matchOfflineOcr(fields: {
  name: string; setCode?: string; collectorNumber?: string;
}): Promise<ScanCandidate | null> {
  try {
    const database = await getDb();
    const nameNorm = fields.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (nameNorm.length < 2) return null;
    const results = await searchCards(database, nameNorm, 20);
    let best: any = null;
    let bestScore = 0;
    for (const row of results) {
      const card = row as any;
      const cName = (card.name ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, "");
      let score = 0;
      let matchType = "fuzzy";
      if (cName === nameNorm) { score = 80; matchType = "exact_name"; }
      else if (cName.startsWith(nameNorm) || nameNorm.startsWith(cName)) { score = 70; matchType = "prefix"; }
      else {
        const dist = levenshtein(nameNorm, cName);
        const maxLen = Math.max(nameNorm.length, cName.length);
        score = Math.round((1 - dist / maxLen) * 60);
      }
      if (fields.setCode && card.setId?.toLowerCase() === fields.setCode.toLowerCase()) {
        score += 10;
        if (fields.collectorNumber && card.collectorNumber === fields.collectorNumber) {
          score += 10; matchType = "set_collector";
        }
      }
      if (score > bestScore) { bestScore = score; best = { ...card, score, matchType }; }
    }
    if (best && best.score >= 50) {
      return {
        variantId: best.variantId, cardId: best.cardId, name: best.name,
        setId: best.setId, collectorNumber: best.collectorNumber,
        imageUri: best.imageUri, manaCost: best.manaCost, typeLine: best.typeLine,
        rarity: best.rarity, score: best.score, matchType: best.matchType, prices: [],
      };
    }
  } catch { /* offline match failed */ }
  return null;
}

// ── Singleton hash index (loaded once per scanner session) ──
const globalHashIndex = new MobileHashIndex();
let hashIndexLoaded = false;

async function ensureHashIndexLoaded(): Promise<void> {
  if (hashIndexLoaded) return;
  const database = await getDb();
  const rows = await loadHashIndex(database);
  if (rows.length === 0) {
    await downloadHashBundle();
    const freshRows = await loadHashIndex(database);
    globalHashIndex.load(freshRows);
  } else {
    globalHashIndex.load(rows);
  }
  hashIndexLoaded = true;
}

// ── Component ──
export function ScannerTab() {
  const [hasPermission, setHasPermission] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("rapid");
  const [isActive, setIsActive] = useState(true);
  const [overlayState, setOverlayState] = useState<OverlayState>("idle");
  const [ocrHint, setOcrHint] = useState<string | null>(null);
  const [hashIndexReady, setHashIndexReady] = useState(false);

  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [scanCount, setScanCount] = useState(0);
  const [sessionValue, setSessionValue] = useState(0);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<ScanCandidate[]>([]);

  const [gridSize, setGridSize] = useState<GridSize>(9);
  const [binderCells, setBinderCells] = useState<BinderCell[]>([]);
  const [binderProcessing, setBinderProcessing] = useState(false);
  const [binderProgress, setBinderProgress] = useState(0);

  const cameraRef = useRef<any>(null);
  const scanLockRef = useRef(false);

  const ringBuffer = useRef<Array<string | null>>(new Array(8).fill(null));
  const ringIdx = useRef(0);

  const confidenceFill = useSharedValue(0);

  useEffect(() => {
    ensureHashIndexLoaded().then(() => setHashIndexReady(true));
  }, []);

  useEffect(() => {
    if (Camera) {
      (async () => {
        try {
          const VisionCamera = require("react-native-vision-camera");
          const status = await VisionCamera.Camera.requestCameraPermission();
          setHasPermission(status === "granted" || status === "authorized");
        } catch {
          setHasPermission(false);
        }
      })();
    }
  }, []);

  const onHashReceived = useCallback((dHashHex: string) => {
    if (scanLockRef.current || scanMode !== "rapid") return;

    const result = globalHashIndex.lookup(dHashHex, dHashHex);
    const variantId = result?.variantId ?? null;

    ringBuffer.current[ringIdx.current % 8] = variantId;
    ringIdx.current++;

    const counts: Record<string, number> = {};
    for (const id of ringBuffer.current) {
      if (id) counts[id] = (counts[id] ?? 0) + 1;
    }

    const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];

    if (topId && topId[1] >= 3) {
      const matchedId = topId[0]!;
      if (matchedId !== lastScannedId) {
        autoConfirmByVariantId(matchedId);
      }
      setOverlayState("confirmed");
      confidenceFill.value = withTiming(1, { duration: 100 });
    } else if (ringIdx.current > 0 && ringIdx.current % 8 === 0 && !topId) {
      setOverlayState("lowConfidence");
      triggerOcrFallback();
    } else if (variantId) {
      setOverlayState("detecting");
      confidenceFill.value = withTiming((topId?.[1] ?? 1) / 3, { duration: 80 });
    } else {
      setOverlayState("idle");
      confidenceFill.value = withTiming(0, { duration: 200 });
    }
  }, [scanMode, lastScannedId]);

  const resize = useResizePlugin ? useResizePlugin() : null;

  const frameProcessor = useFrameProcessor && resize && hashIndexReady
    ? useFrameProcessor((frame: any) => {
        'worklet';
        try {
          const resized = resize(frame, {
            scale: { width: 9, height: 8 },
            pixelFormat: 'rgb',
            dataType: 'uint8',
          });
          const dHash = computeDHashFromRGB9x8(new Uint8Array(resized.buffer));
          runOnJS(onHashReceived)(dHash);
        } catch { /* ignore frame errors */ }
      }, [onHashReceived, resize, hashIndexReady])
    : undefined;

  const autoConfirmByVariantId = useCallback(async (variantId: string) => {
    scanLockRef.current = true;
    Vibration.vibrate(50);
    ringBuffer.current = new Array(8).fill(null);
    ringIdx.current = 0;

    try {
      const database = await getDb();
      const rows = await database.getAllAsync<any>(
        `SELECT * FROM cards WHERE variantId = ? LIMIT 1`, [variantId]
      );
      const card = rows[0];
      if (!card) return;

      setScannedCards((prev) => {
        const existing = prev.find((c) => c.variantId === variantId);
        if (existing) {
          return prev.map((c) =>
            c.variantId === variantId ? { ...c, quantity: c.quantity + 1 } : c
          );
        }
        return [
          {
            variantId: card.variantId,
            cardId: card.cardId,
            name: card.name,
            setId: card.setId,
            collectorNumber: card.collectorNumber,
            imageUri: card.imageUri,
            quantity: 1,
            priceUsd: 0,
            addedToCollection: false,
          },
          ...prev,
        ];
      });

      setLastScannedId(variantId);
      setScanCount((c) => c + 1);
      setOverlayState("confirmed");

      setTimeout(() => {
        scanLockRef.current = false;
        setLastScannedId(null);
        setOverlayState("idle");
        confidenceFill.value = withTiming(0, { duration: 300 });
      }, 1500);
    } catch {
      scanLockRef.current = false;
    }
  }, []);

  const triggerOcrFallback = useCallback(async () => {
    if (scanLockRef.current || !cameraRef.current || !TextRecognition) return;
    scanLockRef.current = true;
    setOverlayState("ocrFallback");
    setOcrHint("Trying text match...");

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "speed" });
      const recognized = await TextRecognition.recognize(photo.path);
      if (!recognized?.text || recognized.text.trim().length < 3) return;

      const fields = extractCardFields(recognized);
      if (!fields.name || fields.name.length < 2) return;

      const candidate = await matchOfflineOcr(fields);
      if (candidate && candidate.score >= 70 && candidate.variantId !== lastScannedId) {
        await autoConfirmByVariantId(candidate.variantId);
      } else if (candidate) {
        setPickerCandidates([candidate]);
        setShowPicker(true);
      }
    } catch { /* ignore */ } finally {
      scanLockRef.current = false;
      setOcrHint(null);
    }
  }, [lastScannedId, autoConfirmByVariantId]);

  const addAllToCollection = useCallback(async () => {
    const toAdd = scannedCards.filter((c) => !c.addedToCollection);
    if (toAdd.length === 0) {
      Alert.alert("Nothing to add", "All cards already in collection.");
      return;
    }
    try {
      const database = await getDb();
      for (const card of toAdd) {
        for (let i = 0; i < card.quantity; i++) {
          await insertLedgerEvent(database, {
            id: `scan-${card.variantId}-${Date.now()}-${i}`,
            at: new Date().toISOString(),
            type: "add",
            variantId: card.variantId,
            payload: { source: "rapid_scan", quantity: 1 },
          });
        }
      }
      setScannedCards((prev) => prev.map((c) => ({ ...c, addedToCollection: true })));
      Alert.alert("Added", `${toAdd.reduce((s, c) => s + c.quantity, 0)} card(s) added.`);
    } catch {
      Alert.alert("Error", "Failed to add cards to collection.");
    }
  }, [scannedCards]);

  const undoLastScan = useCallback(() => {
    setScannedCards((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[0]!;
      if (last.quantity > 1) {
        setScanCount((c) => c - 1);
        setSessionValue((v) => v - last.priceUsd);
        return prev.map((c, i) => i === 0 ? { ...c, quantity: c.quantity - 1 } : c);
      }
      setScanCount((c) => c - 1);
      setSessionValue((v) => v - last.priceUsd);
      return prev.slice(1);
    });
  }, []);

  const captureBinderPage = useCallback(async () => {
    if (!cameraRef.current || !ImageManipulator) return;
    setBinderProcessing(true);
    setBinderCells([]);
    setBinderProgress(0);

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "quality" });
      const photoUri = `file://${photo.path}`;

      const n = gridSize;
      const totalCells = n * n;
      const results: BinderCell[] = [];
      let processed = 0;

      const dimInfo = await ImageManipulator.manipulateAsync(
        photoUri,
        [{ resize: { width: 100 } }],
        { base64: false }
      );
      const aspectRatio = dimInfo.height / dimInfo.width;
      const fullWidth = photo.width ?? 3024;
      const fullHeight = photo.height ?? Math.round(fullWidth * aspectRatio);

      const cellW = Math.floor(fullWidth / n);
      const cellH = Math.floor(fullHeight / n);

      const BATCH = 9;
      for (let start = 0; start < totalCells; start += BATCH) {
        const batchCells = [];
        for (let offset = 0; offset < BATCH && start + offset < totalCells; offset++) {
          const idx = start + offset;
          const row = Math.floor(idx / n);
          const col = idx % n;
          batchCells.push({ row, col, idx });
        }

        await Promise.all(
          batchCells.map(async ({ row, col }) => {
            try {
              const cropped = await ImageManipulator.manipulateAsync(
                photoUri,
                [{
                  crop: {
                    originX: col * cellW,
                    originY: row * cellH,
                    width: cellW,
                    height: cellH,
                  },
                }, { resize: { width: 64, height: 64 } }],
                { base64: true, format: ImageManipulator.SaveFormat?.PNG ?? "png" }
              );

              if (!cropped.base64) return;

              const pixels = decodePngBase64ToRGBA(cropped.base64, 64, 64);
              if (!pixels) return;

              if (isEmptySlot(pixels, 64, 64)) return;

              const { computeDHashFromRGBA, computePHashFromRGBA } = require("../../scanner/hashUtils");
              const dHashHex = computeDHashFromRGBA(pixels, 64, 64);
              const pHashHex = computePHashFromRGBA(pixels, 64, 64);

              const match = globalHashIndex.lookup(dHashHex, pHashHex);
              if (!match) return;

              const database = await getDb();
              const dbRows = await database.getAllAsync<any>(
                `SELECT variantId, name, imageUri, setId FROM cards WHERE variantId = ? LIMIT 1`,
                [match.variantId]
              );
              const card = dbRows[0];
              if (!card) return;

              results.push({
                variantId: card.variantId,
                name: card.name,
                imageUri: card.imageUri,
                setId: card.setId,
                confidence: match.confidence,
                selected: true,
              });
            } catch { /* skip cell on error */ }
          })
        );

        processed += batchCells.length;
        setBinderProgress(Math.round((processed / totalCells) * 100));
        setBinderCells([...results]);
      }

      Vibration.vibrate(100);
    } catch {
      Alert.alert("Scan Error", "Failed to process binder page.");
    } finally {
      setBinderProcessing(false);
    }
  }, [gridSize]);

  const toggleBinderCell = useCallback((variantId: string) => {
    setBinderCells((prev) =>
      prev.map((c) => c.variantId === variantId ? { ...c, selected: !c.selected } : c)
    );
  }, []);

  const addSelectedBinderCards = useCallback(async () => {
    const selected = binderCells.filter((c) => c.selected);
    if (selected.length === 0) {
      Alert.alert("Nothing selected", "Tap cards to select them.");
      return;
    }
    try {
      const database = await getDb();
      await database.withTransactionAsync(async () => {
        for (const card of selected) {
          await insertLedgerEvent(database, {
            id: `binder-${card.variantId}-${Date.now()}`,
            at: new Date().toISOString(),
            type: "add",
            variantId: card.variantId,
            payload: { source: "binder_scan", quantity: 1 },
          });
        }
      });
      Alert.alert("Added", `${selected.length} card(s) added to collection.`);
      setBinderCells([]);
    } catch {
      Alert.alert("Error", "Failed to add cards.");
    }
  }, [binderCells]);

  const overlayBorderStyle = useAnimatedStyle(() => ({
    borderColor:
      overlayState === "confirmed" ? "#22C55E" :
      overlayState === "detecting" ? "#3B82F6" :
      overlayState === "lowConfidence" ? "#F59E0B" :
      overlayState === "ocrFallback" ? "#6B7280" :
      "#FFFFFF",
    opacity: overlayState === "idle" ? 0.4 : 1,
  }));

  if (!Camera) {
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Camera not available</Text>
          <Text style={styles.fallbackSubtitle}>
            Use a development build (not Expo Go) to enable the scanner.
          </Text>
        </View>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackTitle}>Camera permission required</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.modeBar}>
        <TouchableOpacity
          style={[styles.modeBtn, scanMode === "rapid" && styles.modeBtnActive]}
          onPress={() => setScanMode("rapid")}
        >
          <Text style={[styles.modeBtnText, scanMode === "rapid" && styles.modeBtnTextActive]}>
            Single
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, scanMode === "binder" && styles.modeBtnActive]}
          onPress={() => setScanMode("binder")}
        >
          <Text style={[styles.modeBtnText, scanMode === "binder" && styles.modeBtnTextActive]}>
            Binder
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cameraContainer}>
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={undefined}
          isActive={isActive}
          frameProcessor={scanMode === "rapid" ? frameProcessor : undefined}
          photo
        />

        {scanMode === "rapid" && (
          <Animated.View style={[styles.cardOverlay, overlayBorderStyle]}>
            {overlayState === "confirmed" && (
              <Text style={styles.overlayConfirmedText}>✓</Text>
            )}
            {overlayState === "lowConfidence" && (
              <Text style={styles.overlayHintText}>Adjust angle</Text>
            )}
            {overlayState === "ocrFallback" && (
              <Text style={styles.overlayHintText}>{ocrHint}</Text>
            )}
          </Animated.View>
        )}

        {scanMode === "binder" && (
          <View style={styles.binderGridOverlay}>
            {Array.from({ length: gridSize }).map((_, row) =>
              Array.from({ length: gridSize }).map((_, col) => (
                <View
                  key={`${row}-${col}`}
                  style={[
                    styles.binderCell,
                    {
                      width: `${100 / gridSize}%` as any,
                      height: `${100 / gridSize}%` as any,
                    },
                  ]}
                />
              ))
            )}
          </View>
        )}

        {!hashIndexReady && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading card index...</Text>
          </View>
        )}
      </View>

      {scanMode === "rapid" && (
        <View style={styles.rapidControls}>
          <View style={styles.sessionStats}>
            <Text style={styles.statText}>{scanCount} cards</Text>
            {sessionValue > 0 && (
              <Text style={styles.statText}>${sessionValue.toFixed(2)}</Text>
            )}
          </View>
          <View style={styles.rapidActions}>
            <TouchableOpacity style={styles.actionBtn} onPress={undoLastScan}>
              <Text style={styles.actionBtnText}>Undo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={addAllToCollection}>
              <Text style={[styles.actionBtnText, styles.actionBtnTextPrimary]}>
                Add {scanCount > 0 ? scanCount : ""} to Collection
              </Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={scannedCards}
            keyExtractor={(c) => c.variantId}
            horizontal
            style={styles.scannedList}
            renderItem={({ item }) => (
              <View style={styles.scannedCard}>
                {item.imageUri ? (
                  <Image source={{ uri: item.imageUri }} style={styles.scannedCardImage} />
                ) : (
                  <View style={[styles.scannedCardImage, styles.scannedCardPlaceholder]}>
                    <Text style={styles.scannedCardName}>{item.name[0]}</Text>
                  </View>
                )}
                {item.quantity > 1 && (
                  <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>×{item.quantity}</Text>
                  </View>
                )}
                {item.addedToCollection && (
                  <View style={styles.addedBadge}>
                    <Text style={styles.addedText}>✓</Text>
                  </View>
                )}
              </View>
            )}
          />
        </View>
      )}

      {scanMode === "binder" && (
        <View style={styles.binderControls}>
          <View style={styles.gridSizeRow}>
            <Text style={styles.gridSizeLabel}>Grid:</Text>
            {([9, 12] as GridSize[]).map((size) => (
              <TouchableOpacity
                key={size}
                style={[styles.gridSizeBtn, gridSize === size && styles.gridSizeBtnActive]}
                onPress={() => setGridSize(size)}
              >
                <Text style={[styles.gridSizeBtnText, gridSize === size && styles.gridSizeBtnTextActive]}>
                  {size}×{size}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {!binderProcessing && binderCells.length === 0 && (
            <TouchableOpacity style={styles.captureBtn} onPress={captureBinderPage}>
              <Text style={styles.captureBtnText}>Scan Page</Text>
            </TouchableOpacity>
          )}

          {binderProcessing && (
            <View style={styles.processingRow}>
              <ActivityIndicator color={tc.color} />
              <Text style={styles.processingText}>Processing {binderProgress}%</Text>
            </View>
          )}

          {binderCells.length > 0 && (
            <>
              <View style={styles.binderResultsHeader}>
                <Text style={styles.binderResultsTitle}>
                  {binderCells.filter((c) => c.selected).length} of {binderCells.length} selected
                </Text>
                <TouchableOpacity onPress={() => setBinderCells((prev) => prev.map((c) => ({ ...c, selected: true })))}>
                  <Text style={styles.binderSelectAll}>All</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setBinderCells((prev) => prev.map((c) => ({ ...c, selected: false })))}>
                  <Text style={styles.binderSelectAll}>None</Text>
                </TouchableOpacity>
              </View>

              <FlatList
                data={binderCells}
                keyExtractor={(c) => c.variantId}
                numColumns={3}
                style={styles.binderResultsList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.binderResultCell,
                      !item.selected && styles.binderResultCellDeselected,
                      item.confidence === "medium" && styles.binderResultCellMedium,
                    ]}
                    onPress={() => toggleBinderCell(item.variantId)}
                  >
                    {item.imageUri ? (
                      <Image source={{ uri: item.imageUri }} style={styles.binderResultImage} />
                    ) : (
                      <View style={[styles.binderResultImage, styles.binderResultPlaceholder]}>
                        <Text style={styles.binderResultPlaceholderText}>{item.name[0]}</Text>
                      </View>
                    )}
                    <Text style={styles.binderResultName} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                )}
              />

              <TouchableOpacity style={styles.addAllBtn} onPress={addSelectedBinderCards}>
                <Text style={styles.addAllBtnText}>
                  Add {binderCells.filter((c) => c.selected).length} Cards
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.clearBtn} onPress={() => setBinderCells([])}>
                <Text style={styles.clearBtnText}>Clear & Rescan</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── PNG decode helper ──
function decodePngBase64ToRGBA(base64: string, _width: number, _height: number): Uint8Array | null {
  try {
    const { decode } = require("fast-png");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const decoded = decode(bytes);
    if (decoded.channels === 4) return new Uint8Array(decoded.data.buffer);
    const rgba = new Uint8Array(decoded.width * decoded.height * 4);
    for (let i = 0; i < decoded.width * decoded.height; i++) {
      rgba[i * 4] = decoded.data[i * 3]!;
      rgba[i * 4 + 1] = decoded.data[i * 3 + 1]!;
      rgba[i * 4 + 2] = decoded.data[i * 3 + 2]!;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  } catch {
    return null;
  }
}

// ── Empty slot detection ──
function isEmptySlot(pixels: Uint8Array, width: number, height: number): boolean {
  const sampleCount = Math.min(100, Math.floor(pixels.length / 4));
  const step = Math.floor((width * height) / sampleCount);
  let minL = 255, maxL = 0;
  for (let i = 0; i < sampleCount; i++) {
    const idx = (i * step) * 4;
    const r = pixels[idx] ?? 128;
    const g = pixels[idx + 1] ?? 128;
    const b = pixels[idx + 2] ?? 128;
    const l = (r * 299 + g * 587 + b * 114) / 1000;
    if (l < minL) minL = l;
    if (l > maxL) maxL = l;
  }
  return (maxL - minL) < 30;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: t.bg },
  modeBar: {
    flexDirection: "row",
    backgroundColor: t.surface,
    margin: spacing.sm,
    borderRadius: radii.md,
    padding: 2,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: "center",
    borderRadius: radii.sm,
  },
  modeBtnActive: { backgroundColor: tc.color },
  modeBtnText: { ...typography.body, color: t.textSecondary },
  modeBtnTextActive: { color: "#fff", fontWeight: "600" as const },
  cameraContainer: { height: 320, marginHorizontal: spacing.sm, borderRadius: radii.lg, overflow: "hidden", position: "relative" },
  cardOverlay: {
    position: "absolute",
    top: "10%",
    left: "10%",
    right: "10%",
    bottom: "10%",
    borderWidth: 2,
    borderRadius: radii.md,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  overlayConfirmedText: { fontSize: 48, color: "#22C55E" },
  overlayHintText: { fontSize: 14, color: "#fff", backgroundColor: "rgba(0,0,0,0.5)", padding: 4, borderRadius: 4 },
  binderGridOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  binderCell: {
    borderWidth: 0.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: { color: "#fff", ...typography.body },
  rapidControls: { flex: 1, padding: spacing.sm },
  sessionStats: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm },
  statText: { ...typography.body, color: t.textSecondary },
  rapidActions: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  actionBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
    alignItems: "center",
  },
  actionBtnPrimary: { backgroundColor: tc.color, borderColor: tc.color },
  actionBtnText: { ...typography.body, color: t.textPrimary },
  actionBtnTextPrimary: { color: "#fff", fontWeight: "600" as const },
  scannedList: { flexGrow: 0 },
  scannedCard: { width: 60, height: 84, marginRight: spacing.sm, borderRadius: radii.sm, overflow: "hidden", position: "relative" },
  scannedCardImage: { width: "100%", height: "100%" },
  scannedCardPlaceholder: { backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  scannedCardName: { fontSize: 20, fontWeight: "bold" as const, color: t.textPrimary },
  quantityBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    backgroundColor: tc.color,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  quantityText: { fontSize: 10, color: "#fff", fontWeight: "bold" as const },
  addedBadge: {
    position: "absolute",
    top: 2,
    right: 2,
    backgroundColor: "#22C55E",
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  addedText: { fontSize: 10, color: "#fff" },
  binderControls: { flex: 1, padding: spacing.sm },
  gridSizeRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  gridSizeLabel: { ...typography.body, color: t.textSecondary },
  gridSizeBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: t.border,
  },
  gridSizeBtnActive: { backgroundColor: tc.color, borderColor: tc.color },
  gridSizeBtnText: { ...typography.body, color: t.textPrimary },
  gridSizeBtnTextActive: { color: "#fff", fontWeight: "600" as const },
  captureBtn: {
    backgroundColor: tc.color,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  captureBtnText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
  processingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  processingText: { ...typography.body, color: t.textSecondary },
  binderResultsHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  binderResultsTitle: { flex: 1, ...typography.body, color: t.textPrimary },
  binderSelectAll: { ...typography.body, color: tc.color },
  binderResultsList: { flex: 1 },
  binderResultCell: {
    width: CELL_SIZE,
    alignItems: "center",
    marginBottom: spacing.sm,
    borderRadius: radii.sm,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
  },
  binderResultCellDeselected: { opacity: 0.35 },
  binderResultCellMedium: { borderColor: "#F59E0B" },
  binderResultImage: { width: CELL_SIZE, height: CELL_SIZE * 1.4, borderRadius: radii.sm },
  binderResultPlaceholder: { backgroundColor: t.surface, alignItems: "center", justifyContent: "center" },
  binderResultPlaceholderText: { fontSize: 24, color: t.textSecondary },
  binderResultName: { ...typography.caption, color: t.textPrimary, paddingHorizontal: 2, marginTop: 2 },
  addAllBtn: {
    backgroundColor: tc.color,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  addAllBtnText: { color: "#fff", fontWeight: "700" as const, fontSize: 16 },
  clearBtn: {
    alignItems: "center",
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  clearBtnText: { ...typography.body, color: t.textSecondary },
  fallback: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  fallbackTitle: { ...typography.heading, color: t.textPrimary, marginBottom: spacing.sm },
  fallbackSubtitle: { ...typography.body, color: t.textSecondary, textAlign: "center" },
});

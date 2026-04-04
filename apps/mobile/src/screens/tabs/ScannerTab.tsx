import React, { useEffect, useRef, useState, useCallback } from "react";
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
  type ViewStyle,
} from "react-native";
import { getDb, insertLedgerEvent, searchCards } from "../../lib/localDb";
import { colors, spacing, radii, typography, shadows, tabColors } from "../../theme";

const t = colors.light;
const tc = tabColors.scanner;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";
const SCREEN_WIDTH = Dimensions.get("window").width;

// Dynamic imports for native modules (not available in Expo Go)
let Camera: React.ComponentType<any> | null = null;
let TextRecognition: { recognize: (uri: string) => Promise<any> } | null = null;

try {
  const VisionCamera = require("react-native-vision-camera");
  Camera = VisionCamera.Camera;
} catch {
  // Not available in Expo Go
}

try {
  TextRecognition = require("@react-native-ml-kit/text-recognition").default;
} catch {
  // Not available
}

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

type ScanMode = "rapid" | "grid";

function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[lb];
}

/** Extract card fields from ML Kit OCR result */
function extractCardFields(result: any): {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  manaCost?: string;
} {
  const blocks = result?.blocks ?? [];
  if (blocks.length === 0 && result?.text) {
    const lines = result.text.split("\n").filter((l: string) => l.trim().length > 1);
    return { name: lines[0]?.replace(/[^a-zA-Z0-9\s,'-]/g, "").trim() ?? "" };
  }

  let nameBlock = "";
  let bottomText = "";
  let topRightText = "";

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
      // Top-left: card name
      if (!nameBlock || y < (blocks.find((b: any) => b.text === nameBlock)?.frame?.y ?? Infinity)) {
        nameBlock = text;
      }
    } else if (yRatio < 0.15 && xRatio > 0.6) {
      topRightText += " " + text;
    } else if (yRatio > 0.85) {
      bottomText += " " + text;
    }
  }

  // Fallback: use first line
  if (!nameBlock) {
    const lines = (result?.text ?? "").split("\n").filter((l: string) => l.trim().length > 1);
    nameBlock = lines[0] ?? "";
  }

  const name = nameBlock.replace(/[^a-zA-Z0-9\s,'-]/g, "").trim();

  // Extract set code and collector number from bottom text
  let setCode: string | undefined;
  let collectorNumber: string | undefined;
  const bottomMatch = bottomText.match(/([A-Z]{3,5})\s*[·•.\-]?\s*(\d{1,4}[a-z]?)/i);
  if (bottomMatch) {
    setCode = bottomMatch[1].toUpperCase();
    collectorNumber = bottomMatch[2];
  }

  // Extract mana symbols from top-right
  let manaCost: string | undefined;
  const manaMatch = topRightText.match(/[{(]?([WUBRGCX0-9]+)[)}]?/i);
  if (manaMatch) {
    manaCost = manaMatch[0];
  }

  return { name, setCode, collectorNumber, manaCost };
}

/** Try to match card offline using local SQLite DB */
async function matchOffline(fields: { name: string; setCode?: string; collectorNumber?: string }): Promise<ScanCandidate | null> {
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

      if (cName === nameNorm) {
        score = 80;
        matchType = "exact_name";
      } else if (cName.startsWith(nameNorm) || nameNorm.startsWith(cName)) {
        score = 70;
        matchType = "prefix";
      } else {
        const dist = levenshtein(nameNorm, cName);
        const maxLen = Math.max(nameNorm.length, cName.length);
        score = Math.round((1 - dist / maxLen) * 60);
      }

      if (fields.setCode && card.setId?.toLowerCase() === fields.setCode.toLowerCase()) {
        score += 10;
        if (fields.collectorNumber && card.collectorNumber === fields.collectorNumber) {
          score += 10;
          matchType = "set_collector";
        }
      }

      if (score > bestScore) {
        bestScore = score;
        best = { ...card, score, matchType };
      }
    }

    if (best && best.score >= 50) {
      return {
        variantId: best.variantId,
        cardId: best.cardId,
        name: best.name,
        setId: best.setId,
        collectorNumber: best.collectorNumber,
        imageUri: best.imageUri,
        manaCost: best.manaCost,
        typeLine: best.typeLine,
        rarity: best.rarity,
        score: best.score,
        matchType: best.matchType,
        prices: [],
      };
    }
  } catch {
    // Offline match failed
  }
  return null;
}

/** Try to match card via API endpoint */
async function matchOnline(fields: {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  manaCost?: string;
}): Promise<ScanCandidate[]> {
  try {
    const res = await fetch(`${API_URL}/v1/scan/identify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: fields.name,
        setCode: fields.setCode,
        collectorNumber: fields.collectorNumber,
        manaCost: fields.manaCost,
        limit: 5,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.candidates ?? [];
    }
  } catch {
    // API unreachable
  }
  return [];
}

export function ScannerTab() {
  const [hasPermission, setHasPermission] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("rapid");
  const [isActive, setIsActive] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [continuousMode, setContinuousMode] = useState(true);
  const [ocrText, setOcrText] = useState<string | null>(null);

  // Rapid-fire state
  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [sessionValue, setSessionValue] = useState(0);

  // Disambiguation state (when auto-confirm can't decide)
  const [showPicker, setShowPicker] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<ScanCandidate[]>([]);

  // Grid mode state
  const [gridCards, setGridCards] = useState<Array<ScanCandidate & { selected: boolean }>>([]);
  const [gridProcessing, setGridProcessing] = useState(false);

  const cameraRef = useRef<any>(null);
  const scanLockRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Continuous scan loop for rapid-fire mode
  useEffect(() => {
    if (!continuousMode || !isActive || scanMode !== "rapid" || !Camera || !hasPermission) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (!scanLockRef.current && cameraRef.current && TextRecognition) {
        processFrame();
      }
    }, 800);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [continuousMode, isActive, scanMode, hasPermission]);

  const processFrame = useCallback(async () => {
    if (scanLockRef.current || !cameraRef.current || !TextRecognition) return;
    scanLockRef.current = true;
    setScanning(true);

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "speed" });
      const recognized = await TextRecognition.recognize(photo.path);

      if (!recognized?.text || recognized.text.trim().length < 3) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      const fields = extractCardFields(recognized);
      if (!fields.name || fields.name.length < 2) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      setOcrText(fields.name);

      // Try online first, fall back to offline
      let candidates = await matchOnline(fields);
      if (candidates.length === 0) {
        const offlineMatch = await matchOffline(fields);
        if (offlineMatch) candidates = [offlineMatch];
      }

      if (candidates.length === 0) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      const topCandidate = candidates[0];

      // Auto-confirm if score >= 70 and not the same card we just scanned
      if (topCandidate.score >= 70 && topCandidate.variantId !== lastScannedId) {
        autoConfirmCard(topCandidate);
      } else if (topCandidate.score < 70 && candidates.length > 1) {
        // Pause continuous scanning, show disambiguation picker
        setContinuousMode(false);
        setPickerCandidates(candidates);
        setShowPicker(true);
      }
    } catch {
      // Frame processing error, continue
    } finally {
      scanLockRef.current = false;
      setScanning(false);
    }
  }, [lastScannedId]);

  const autoConfirmCard = useCallback((candidate: ScanCandidate) => {
    Vibration.vibrate(50);

    const priceUsd = candidate.prices?.find(
      (p) => p.market === "tcgplayer" && p.kind === "market" && p.currency === "USD"
    )?.amount ?? 0;

    setScannedCards((prev) => {
      const existing = prev.find((c) => c.variantId === candidate.variantId);
      if (existing) {
        return prev.map((c) =>
          c.variantId === candidate.variantId
            ? { ...c, quantity: c.quantity + 1 }
            : c
        );
      }
      return [
        {
          variantId: candidate.variantId,
          cardId: candidate.cardId,
          name: candidate.name,
          setId: candidate.setId,
          collectorNumber: candidate.collectorNumber,
          imageUri: candidate.imageUri,
          quantity: 1,
          priceUsd,
          addedToCollection: false,
        },
        ...prev,
      ];
    });

    setLastScannedId(candidate.variantId);
    setScanCount((c) => c + 1);
    setSessionValue((v) => v + priceUsd);

    // Reset lastScannedId after 2 seconds to allow re-scanning same card
    setTimeout(() => setLastScannedId(null), 2000);
  }, []);

  const pickCandidate = (candidate: ScanCandidate) => {
    autoConfirmCard(candidate);
    setShowPicker(false);
    setPickerCandidates([]);
    setContinuousMode(true);
  };

  const adjustQuantity = (variantId: string, delta: number) => {
    setScannedCards((prev) => {
      const card = prev.find((c) => c.variantId === variantId);
      if (!card) return prev;
      const newQty = card.quantity + delta;
      if (newQty <= 0) {
        setScanCount((c) => c - card.quantity);
        setSessionValue((v) => v - card.priceUsd * card.quantity);
        return prev.filter((c) => c.variantId !== variantId);
      }
      setScanCount((c) => c + delta);
      setSessionValue((v) => v + card.priceUsd * delta);
      return prev.map((c) => (c.variantId === variantId ? { ...c, quantity: newQty } : c));
    });
  };

  const undoLastScan = () => {
    setScannedCards((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[0];
      if (last.quantity > 1) {
        setScanCount((c) => c - 1);
        setSessionValue((v) => v - last.priceUsd);
        return prev.map((c, i) => (i === 0 ? { ...c, quantity: c.quantity - 1 } : c));
      }
      setScanCount((c) => c - 1);
      setSessionValue((v) => v - last.priceUsd);
      return prev.slice(1);
    });
  };

  const addAllToCollection = async () => {
    const cardsToAdd = scannedCards.filter((c) => !c.addedToCollection);
    if (cardsToAdd.length === 0) {
      Alert.alert("Nothing to add", "All scanned cards are already in your collection.");
      return;
    }

    try {
      const database = await getDb();
      for (const card of cardsToAdd) {
        for (let i = 0; i < card.quantity; i++) {
          await insertLedgerEvent(database, {
            id: `scan-${card.variantId}-${Date.now()}-${i}`,
            at: new Date().toISOString(),
            type: "add",
            variantId: card.variantId,
            payload: { source: "scan", quantity: 1 },
          });
        }
      }

      setScannedCards((prev) =>
        prev.map((c) => ({ ...c, addedToCollection: true }))
      );

      const totalCards = cardsToAdd.reduce((sum, c) => sum + c.quantity, 0);
      Alert.alert("Added to Collection", `${totalCards} card(s) added successfully.`);
    } catch {
      Alert.alert("Error", "Failed to add cards to collection.");
    }
  };

  // ── Grid Mode: Capture + Process ──
  const captureGrid = useCallback(async () => {
    if (!cameraRef.current || !TextRecognition) return;
    setGridProcessing(true);
    setGridCards([]);

    try {
      const photo = await cameraRef.current.takePhoto({ qualityPrioritization: "balanced" });
      const recognized = await TextRecognition.recognize(photo.path);

      if (!recognized?.text) {
        Alert.alert("No text found", "Could not detect card text. Ensure cards are well-lit and clearly visible.");
        setGridProcessing(false);
        return;
      }

      // Cluster text blocks by spatial proximity into card regions
      const blocks = recognized.blocks ?? [];
      const imgHeight = recognized.height ?? 1000;
      const imgWidth = recognized.width ?? 700;

      // Group blocks into grid cells based on Y/X position
      const cardRegions: Array<{ texts: string[]; y: number; x: number }> = [];
      const cellHeight = imgHeight / 4;
      const cellWidth = imgWidth / 3;

      for (const block of blocks) {
        const frame = block.frame ?? block.boundingBox ?? {};
        const y = frame.y ?? frame.top ?? 0;
        const x = frame.x ?? frame.left ?? 0;
        const text = (block.text ?? "").trim();
        if (!text || text.length < 2) continue;

        // Find which grid cell this block belongs to
        const cellRow = Math.floor(y / cellHeight);
        const cellCol = Math.floor(x / cellWidth);
        const cellKey = `${cellRow}-${cellCol}`;

        let region = cardRegions.find(
          (r) =>
            Math.floor(r.y / cellHeight) === cellRow &&
            Math.floor(r.x / cellWidth) === cellCol
        );
        if (!region) {
          region = { texts: [], y, x };
          cardRegions.push(region);
        }
        region.texts.push(text);
      }

      // For each region, extract the first meaningful text line as the card name
      const detectedCards: Array<ScanCandidate & { selected: boolean }> = [];

      for (const region of cardRegions) {
        const allText = region.texts.join("\n");
        const lines = allText.split("\n").filter((l) => l.trim().length > 2);
        if (lines.length === 0) continue;

        const candidateName = lines[0].replace(/[^a-zA-Z0-9\s,'-]/g, "").trim();
        if (candidateName.length < 2) continue;

        // Try to match
        let candidates = await matchOnline({ name: candidateName });
        if (candidates.length === 0) {
          const offlineMatch = await matchOffline({ name: candidateName });
          if (offlineMatch) candidates = [offlineMatch];
        }

        if (candidates.length > 0) {
          detectedCards.push({ ...candidates[0], selected: true });
        }
      }

      setGridCards(detectedCards);
      Vibration.vibrate(100);
    } catch {
      Alert.alert("Grid Scan Error", "Failed to process the image.");
    } finally {
      setGridProcessing(false);
    }
  }, []);

  const toggleGridCard = (idx: number) => {
    setGridCards((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, selected: !c.selected } : c))
    );
  };

  const addSelectedGridCards = async () => {
    const selected = gridCards.filter((c) => c.selected);
    if (selected.length === 0) {
      Alert.alert("No cards selected", "Select cards to add to your collection.");
      return;
    }

    try {
      const database = await getDb();
      for (const card of selected) {
        await insertLedgerEvent(database, {
          id: `grid-${card.variantId}-${Date.now()}`,
          at: new Date().toISOString(),
          type: "add",
          variantId: card.variantId,
          payload: { source: "grid_scan", quantity: 1 },
        });
      }
      Alert.alert("Added", `${selected.length} card(s) added to your collection.`);
      setGridCards([]);
    } catch {
      Alert.alert("Error", "Failed to add cards.");
    }
  };

  // Fallback UI when camera is not available (Expo Go)
  if (!Camera) {
    return (
      <View style={styles.container}>
        <View style={styles.fallback}>
          <Text style={styles.fallbackIcon}>&#x1F4F7;</Text>
          <Text style={styles.fallbackTitle}>Card Scanner</Text>
          <Text style={styles.fallbackText}>
            Camera scanning requires a development build.{"\n"}
            Run &quot;npx expo run:ios&quot; or &quot;npx expo run:android&quot;
            to use the scanner.
          </Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeBtn, scanMode === "rapid" && styles.modeBtnActive]}
              onPress={() => setScanMode("rapid")}
            >
              <Text style={[styles.modeBtnText, scanMode === "rapid" && styles.modeBtnTextActive]}>
                Rapid Fire
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, scanMode === "grid" && styles.modeBtnActive]}
              onPress={() => setScanMode("grid")}
            >
              <Text style={[styles.modeBtnText, scanMode === "grid" && styles.modeBtnTextActive]}>
                Grid Mode
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mode Selector */}
      <View style={styles.header}>
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, scanMode === "rapid" && styles.modeBtnActive]}
            onPress={() => { setScanMode("rapid"); setGridCards([]); }}
          >
            <Text style={[styles.modeBtnText, scanMode === "rapid" && styles.modeBtnTextActive]}>
              Rapid Fire
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, scanMode === "grid" && styles.modeBtnActive]}
            onPress={() => { setScanMode("grid"); setContinuousMode(false); }}
          >
            <Text style={[styles.modeBtnText, scanMode === "grid" && styles.modeBtnTextActive]}>
              Grid Mode
            </Text>
          </TouchableOpacity>
        </View>
        {scanMode === "rapid" && (
          <View style={styles.statsRow}>
            <Text style={styles.statText}>{scanCount} scanned</Text>
            <Text style={styles.statDivider}>|</Text>
            <Text style={styles.statValue}>${sessionValue.toFixed(2)}</Text>
          </View>
        )}
      </View>

      {/* Camera */}
      <View style={styles.cameraContainer}>
        {hasPermission ? (
          <>
            <Camera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              photo={true}
              isActive={isActive && !showPicker}
            />
            <View style={styles.overlay}>
              {scanMode === "rapid" ? (
                <View style={[styles.guideBox, scanning && styles.guideBoxScanning]}>
                  <Text style={styles.guideText}>
                    {scanning ? "Reading..." : continuousMode ? "Hold card in frame" : "Paused"}
                  </Text>
                  {ocrText && (
                    <Text style={styles.ocrPreview} numberOfLines={1}>
                      {ocrText}
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.gridGuide}>
                  {/* Grid overlay lines */}
                  <View style={styles.gridLine1H} />
                  <View style={styles.gridLine2H} />
                  <View style={styles.gridLine3H} />
                  <View style={styles.gridLine1V} />
                  <View style={styles.gridLine2V} />
                  <Text style={styles.gridLabel}>
                    {gridProcessing ? "Processing..." : "Arrange cards in grid"}
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : (
          <View style={styles.noPermission}>
            <Text style={styles.noPermissionText}>Camera permission required</Text>
          </View>
        )}
      </View>

      {/* Disambiguation picker */}
      {showPicker && (
        <View style={styles.pickerOverlay}>
          <Text style={styles.pickerTitle}>Which card?</Text>
          <ScrollView style={styles.pickerList}>
            {pickerCandidates.map((c) => (
              <TouchableOpacity
                key={c.variantId}
                style={styles.pickerItem}
                onPress={() => pickCandidate(c)}
              >
                {c.imageUri && (
                  <Image source={{ uri: c.imageUri }} style={styles.pickerImage} resizeMode="contain" />
                )}
                <View style={styles.pickerInfo}>
                  <Text style={styles.pickerName}>{c.name}</Text>
                  <Text style={styles.pickerSet}>
                    {c.setId?.toUpperCase()} {c.collectorNumber} ({c.score}%)
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.pickerCancel}
            onPress={() => {
              setShowPicker(false);
              setPickerCandidates([]);
              setContinuousMode(true);
            }}
          >
            <Text style={styles.pickerCancelText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>
        {scanMode === "rapid" ? (
          <>
            {/* Scan tray */}
            {scannedCards.length > 0 && (
              <FlatList
                data={scannedCards}
                keyExtractor={(item) => item.variantId}
                horizontal
                style={styles.tray}
                showsHorizontalScrollIndicator={false}
                renderItem={({ item }) => (
                  <View style={[styles.trayCard, item.addedToCollection && styles.trayCardAdded]}>
                    {item.imageUri && (
                      <Image source={{ uri: item.imageUri }} style={styles.trayImage} resizeMode="contain" />
                    )}
                    <Text style={styles.trayName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.trayQtyRow}>
                      <TouchableOpacity onPress={() => adjustQuantity(item.variantId, -1)} style={styles.qtyBtn}>
                        <Text style={styles.qtyBtnText}>-</Text>
                      </TouchableOpacity>
                      <Text style={styles.trayQty}>x{item.quantity}</Text>
                      <TouchableOpacity onPress={() => adjustQuantity(item.variantId, 1)} style={styles.qtyBtn}>
                        <Text style={styles.qtyBtnText}>+</Text>
                      </TouchableOpacity>
                    </View>
                    {item.priceUsd > 0 && (
                      <Text style={styles.trayPrice}>${(item.priceUsd * item.quantity).toFixed(2)}</Text>
                    )}
                  </View>
                )}
              />
            )}

            {/* Controls row */}
            <View style={styles.controlRow}>
              <TouchableOpacity
                style={styles.controlBtn}
                onPress={undoLastScan}
                disabled={scannedCards.length === 0}
              >
                <Text style={styles.controlBtnText}>Undo</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.scanToggle, continuousMode && styles.scanToggleActive]}
                onPress={() => setContinuousMode(!continuousMode)}
              >
                <Text style={styles.scanToggleText}>
                  {continuousMode ? "Pause" : "Resume"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.addAllBtn, scannedCards.length === 0 && styles.addAllBtnDisabled]}
                onPress={addAllToCollection}
                disabled={scannedCards.length === 0}
              >
                <Text style={styles.addAllBtnText}>Add All</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Grid results */}
            {gridCards.length > 0 && (
              <ScrollView style={styles.gridResults} horizontal={false}>
                <View style={styles.gridResultsInner}>
                  {gridCards.map((card, idx) => (
                    <TouchableOpacity
                      key={card.variantId + "-" + idx}
                      style={[styles.gridCard, card.selected && styles.gridCardSelected]}
                      onPress={() => toggleGridCard(idx)}
                    >
                      {card.imageUri && (
                        <Image source={{ uri: card.imageUri }} style={styles.gridImage} resizeMode="contain" />
                      )}
                      <Text style={styles.gridCardName} numberOfLines={1}>{card.name}</Text>
                      <View style={[styles.gridCheck, card.selected && styles.gridCheckActive]}>
                        <Text style={styles.gridCheckText}>{card.selected ? "\u2713" : ""}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            )}

            <View style={styles.controlRow}>
              <TouchableOpacity
                style={[styles.scanButton, gridProcessing && styles.scanButtonDisabled]}
                onPress={captureGrid}
                disabled={gridProcessing}
              >
                {gridProcessing ? (
                  <ActivityIndicator color={t.textInverse} />
                ) : (
                  <Text style={styles.scanButtonText}>Capture Grid</Text>
                )}
              </TouchableOpacity>

              {gridCards.length > 0 && (
                <TouchableOpacity style={styles.addAllBtn} onPress={addSelectedGridCards}>
                  <Text style={styles.addAllBtnText}>
                    Add {gridCards.filter((c) => c.selected).length} Cards
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },

  // Header / Mode selector
  header: {
    paddingTop: 50,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: t.surface,
    borderBottomWidth: 1,
    borderBottomColor: t.border,
    ...shadows.card,
  } as ViewStyle,
  modeRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginBottom: 6,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radii.sm,
    backgroundColor: t.surfaceSunken,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.border,
  },
  modeBtnActive: {
    backgroundColor: tc.color,
    borderColor: tc.color,
  },
  modeBtnText: {
    ...typography.caption,
    fontWeight: "600",
    color: t.textSecondary,
  },
  modeBtnTextActive: {
    color: t.textInverse,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  statText: {
    ...typography.caption,
    color: t.textSecondary,
  },
  statDivider: {
    ...typography.caption,
    color: t.border,
  },
  statValue: {
    ...typography.caption,
    fontWeight: "700",
    color: tc.color,
  },

  // Camera — stays dark for viewfinder visibility
  cameraContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: "#000000",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  guideBox: {
    width: 260,
    height: 370,
    borderWidth: 2,
    borderColor: tc.color,
    borderRadius: radii.md,
    justifyContent: "center",
    alignItems: "center",
  },
  guideBoxScanning: {
    borderColor: t.success,
  },
  guideText: {
    ...typography.caption,
    fontWeight: "600",
    color: tc.color,
  },
  ocrPreview: {
    ...typography.small,
    color: t.success,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    textAlign: "center",
  },
  noPermission: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: t.surfaceSunken,
  },
  noPermissionText: {
    ...typography.body,
    color: t.textMuted,
  },

  // Grid guide overlay (camera)
  gridGuide: {
    width: "90%",
    height: "80%",
    borderWidth: 2,
    borderColor: tc.color,
    borderRadius: radii.md,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  gridLine1H: { position: "absolute", top: "25%", left: 8, right: 8, height: 1, backgroundColor: `${tc.color}80` },
  gridLine2H: { position: "absolute", top: "50%", left: 8, right: 8, height: 1, backgroundColor: `${tc.color}80` },
  gridLine3H: { position: "absolute", top: "75%", left: 8, right: 8, height: 1, backgroundColor: `${tc.color}80` },
  gridLine1V: { position: "absolute", left: "33%", top: 8, bottom: 8, width: 1, backgroundColor: `${tc.color}80` },
  gridLine2V: { position: "absolute", left: "66%", top: 8, bottom: 8, width: 1, backgroundColor: `${tc.color}80` },
  gridLabel: {
    ...typography.caption,
    fontWeight: "600",
    color: tc.color,
  },

  // Picker overlay (disambiguation)
  pickerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: t.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    maxHeight: "60%",
    zIndex: 10,
    ...shadows.elevated,
  } as ViewStyle,
  pickerTitle: {
    ...typography.heading,
    color: t.textPrimary,
    marginBottom: spacing.md,
  },
  pickerList: { maxHeight: 300 },
  pickerItem: {
    flexDirection: "row",
    backgroundColor: t.surfaceSunken,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: 6,
    alignItems: "center",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: t.border,
  },
  pickerImage: {
    width: 40,
    height: 56,
    borderRadius: radii.sm,
  },
  pickerInfo: { flex: 1 },
  pickerName: {
    ...typography.body,
    fontWeight: "600",
    color: t.textPrimary,
  },
  pickerSet: {
    ...typography.small,
    color: t.textSecondary,
    marginTop: 2,
  },
  pickerCancel: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: t.surfaceSunken,
    borderRadius: radii.sm,
  },
  pickerCancelText: {
    ...typography.caption,
    fontWeight: "600",
    color: t.textSecondary,
  },

  // Bottom panel
  bottomPanel: {
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
    paddingBottom: spacing["2xl"],
    ...shadows.elevated,
  } as ViewStyle,

  // Scan tray (horizontal card list)
  tray: {
    maxHeight: 140,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  trayCard: {
    width: 90,
    marginRight: spacing.sm,
    backgroundColor: t.surface,
    borderRadius: radii.sm,
    padding: 6,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.border,
    ...shadows.card,
  } as ViewStyle,
  trayCardAdded: {
    borderColor: t.success,
    backgroundColor: t.successLight,
  },
  trayImage: {
    width: 55,
    height: 76,
    borderRadius: radii.sm,
    marginBottom: spacing.xs,
  },
  trayName: {
    ...typography.small,
    fontWeight: "600",
    color: t.textPrimary,
    textAlign: "center",
  },
  trayQtyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  qtyBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: t.surfaceSunken,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.border,
  },
  qtyBtnText: {
    ...typography.body,
    fontWeight: "700",
    color: t.textPrimary,
  },
  trayQty: {
    ...typography.small,
    fontWeight: "600",
    color: t.textSecondary,
  },
  trayPrice: {
    ...typography.small,
    fontWeight: "600",
    color: tc.color,
    marginTop: 2,
  },

  // Control row
  controlRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  controlBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: t.surfaceSunken,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.border,
  },
  controlBtnText: {
    ...typography.caption,
    fontWeight: "600",
    color: t.textSecondary,
  },
  scanToggle: {
    flex: 2,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: tc.color,
    alignItems: "center",
  },
  scanToggleActive: {
    backgroundColor: t.danger,
  },
  scanToggleText: {
    ...typography.caption,
    fontWeight: "700",
    color: t.textInverse,
  },
  addAllBtn: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    backgroundColor: t.success,
    alignItems: "center",
  },
  addAllBtnDisabled: { opacity: 0.4 },
  addAllBtnText: {
    ...typography.caption,
    fontWeight: "700",
    color: t.textInverse,
  },

  // Grid results
  gridResults: {
    maxHeight: 200,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  gridResultsInner: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  gridCard: {
    width: (SCREEN_WIDTH - 40) / 4,
    backgroundColor: t.surface,
    borderRadius: radii.sm,
    padding: spacing.xs,
    alignItems: "center",
    borderWidth: 2,
    borderColor: t.border,
    position: "relative",
    ...shadows.card,
  } as ViewStyle,
  gridCardSelected: {
    borderColor: t.success,
  },
  gridImage: {
    width: "100%",
    height: 70,
    borderRadius: radii.sm,
  },
  gridCardName: {
    fontSize: 9,
    fontWeight: "500",
    color: t.textPrimary,
    textAlign: "center",
    marginTop: 2,
  },
  gridCheck: {
    position: "absolute",
    top: spacing.xs,
    right: spacing.xs,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: t.surfaceSunken,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.borderStrong,
  },
  gridCheckActive: {
    backgroundColor: t.success,
    borderColor: t.success,
  },
  gridCheckText: {
    ...typography.small,
    fontWeight: "700",
    color: t.textInverse,
  },

  // Shared
  scanButton: {
    flex: 1,
    backgroundColor: tc.color,
    borderRadius: radii.md,
    padding: 14,
    alignItems: "center",
  },
  scanButtonDisabled: { opacity: 0.6 },
  scanButtonText: {
    ...typography.body,
    fontWeight: "600",
    color: t.textInverse,
  },

  fallback: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["3xl"],
  },
  fallbackIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  fallbackTitle: {
    ...typography.title,
    color: t.textPrimary,
    marginBottom: spacing.sm,
  },
  fallbackText: {
    ...typography.caption,
    color: t.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
});

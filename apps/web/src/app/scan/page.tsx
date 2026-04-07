"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  searchCardsLocal,
  addCollectionEvent,
  type LocalCard,
} from "@/lib/store/cardStore";
import { runWebSync } from "@/lib/store/sync";
import { createClient } from "@/lib/supabase/client";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

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
  prices?: Array<{
    market: string;
    kind: string;
    currency: string;
    amount: number;
  }>;
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

function levenshtein(a: string, b: string): number {
  const la = a.length,
    lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const curr = [i];
    for (let j = 1; j <= lb; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[lb];
}

/** Try matching against local IndexedDB card store */
async function matchOffline(name: string): Promise<ScanCandidate | null> {
  try {
    const nameNorm = name.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
    if (nameNorm.length < 2) return null;
    const results = await searchCardsLocal(nameNorm, 20);

    let best: (LocalCard & { score: number; matchType: string }) | null = null;

    for (const card of results) {
      const cName = card.name.toLowerCase().replace(/[^a-z0-9 ]/g, "");
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

      if (!best || score > best.score) {
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

/** Try matching via API endpoint */
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
      body: JSON.stringify({ ...fields, limit: 5 }),
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

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<any>(null);
  const scanLockRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tesseractReady, setTesseractReady] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [ocrText, setOcrText] = useState<string | null>(null);

  const [scannedCards, setScannedCards] = useState<ScannedCard[]>([]);
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [sessionValue, setSessionValue] = useState(0);

  const [showPicker, setShowPicker] = useState(false);
  const [pickerCandidates, setPickerCandidates] = useState<ScanCandidate[]>([]);

  const [manualSearch, setManualSearch] = useState("");
  const [manualResults, setManualResults] = useState<ScanCandidate[]>([]);
  const [showManual, setShowManual] = useState(false);

  // Load user for NavBar
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    loadUser();
  }, []);

  // Initialize Tesseract worker
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Tesseract = await import("tesseract.js");
        const worker = await Tesseract.createWorker("eng");
        if (!cancelled) {
          workerRef.current = worker;
          setTesseractReady(true);
        }
      } catch {
        // Tesseract failed to load
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize camera
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
        setCameraError(null);
      }
    } catch (err: any) {
      setCameraError(
        err?.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access."
          : "Camera not available. Use manual search below."
      );
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      if (videoRef.current?.srcObject) {
        const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
        tracks.forEach((t) => t.stop());
      }
      if (workerRef.current) {
        workerRef.current.terminate().catch(() => {});
      }
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startCamera]);

  // Sync collection events before leaving
  useEffect(() => {
    const handler = () => { runWebSync(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // Continuous scan loop
  useEffect(() => {
    if (!continuousMode || !cameraReady || !tesseractReady) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    intervalRef.current = setInterval(() => {
      if (!scanLockRef.current) processFrame();
    }, 1200);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [continuousMode, cameraReady, tesseractReady]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);

    // Crop to center region (where card should be)
    const cropW = Math.round(canvas.width * 0.7);
    const cropH = Math.round(canvas.height * 0.85);
    const cropX = Math.round((canvas.width - cropW) / 2);
    const cropY = Math.round((canvas.height - cropH) / 2);

    const croppedCanvas = document.createElement("canvas");
    croppedCanvas.width = cropW;
    croppedCanvas.height = cropH;
    const croppedCtx = croppedCanvas.getContext("2d");
    if (!croppedCtx) return null;
    croppedCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    return croppedCanvas.toDataURL("image/png");
  }, []);

  const processFrame = useCallback(async () => {
    if (scanLockRef.current || !workerRef.current) return;
    scanLockRef.current = true;
    setScanning(true);

    try {
      const imageData = captureFrame();
      if (!imageData) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      const result = await workerRef.current.recognize(imageData);
      const text = result?.data?.text?.trim() ?? "";

      if (text.length < 3) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      // Extract card name from OCR text
      const lines = text.split("\n").filter((l: string) => l.trim().length > 2);
      const rawName = lines[0] ?? "";
      const cardName = rawName.replace(/[^a-zA-Z0-9\s,'-]/g, "").trim();

      if (cardName.length < 2) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      setOcrText(cardName);

      // Try to extract set code from bottom lines
      let setCode: string | undefined;
      let collectorNumber: string | undefined;
      const lastLines = lines.slice(-3).join(" ");
      const setMatch = lastLines.match(/([A-Z]{3,5})\s*[·•.\-]?\s*(\d{1,4}[a-z]?)/i);
      if (setMatch) {
        setCode = setMatch[1].toUpperCase();
        collectorNumber = setMatch[2];
      }

      // Match the card
      let candidates = await matchOnline({ name: cardName, setCode, collectorNumber });
      if (candidates.length === 0) {
        const offline = await matchOffline(cardName);
        if (offline) candidates = [offline];
      }

      if (candidates.length === 0) {
        scanLockRef.current = false;
        setScanning(false);
        return;
      }

      const top = candidates[0];

      if (top.score >= 70 && top.variantId !== lastScannedId) {
        autoConfirmCard(top);
      } else if (top.score < 70 && candidates.length > 1) {
        setContinuousMode(false);
        setPickerCandidates(candidates);
        setShowPicker(true);
      }
    } catch {
      // Frame error, continue
    } finally {
      scanLockRef.current = false;
      setScanning(false);
    }
  }, [captureFrame, lastScannedId]);

  const autoConfirmCard = useCallback(
    (candidate: ScanCandidate) => {
      const priceUsd =
        candidate.prices?.find(
          (p) =>
            p.market === "tcgplayer" &&
            p.kind === "market" &&
            p.currency === "USD"
        )?.amount ?? 0;

      setScannedCards((prev) => {
        const existing = prev.find(
          (c) => c.variantId === candidate.variantId
        );
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

      setTimeout(() => setLastScannedId(null), 2000);
    },
    []
  );

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
      return prev.map((c) =>
        c.variantId === variantId ? { ...c, quantity: newQty } : c
      );
    });
  };

  const undoLastScan = () => {
    setScannedCards((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[0];
      if (last.quantity > 1) {
        setScanCount((c) => c - 1);
        setSessionValue((v) => v - last.priceUsd);
        return prev.map((c, i) =>
          i === 0 ? { ...c, quantity: c.quantity - 1 } : c
        );
      }
      setScanCount((c) => c - 1);
      setSessionValue((v) => v - last.priceUsd);
      return prev.slice(1);
    });
  };

  const addAllToCollection = async () => {
    const cardsToAdd = scannedCards.filter((c) => !c.addedToCollection);
    if (cardsToAdd.length === 0) return;

    for (const card of cardsToAdd) {
      for (let i = 0; i < card.quantity; i++) {
        await addCollectionEvent({
          id: `scan-${card.variantId}-${Date.now()}-${i}`,
          at: new Date().toISOString(),
          type: "add",
          variantId: card.variantId,
          payload: { source: "web_scan", quantity: 1 },
        });
      }
    }

    setScannedCards((prev) =>
      prev.map((c) => ({ ...c, addedToCollection: true }))
    );

    // Trigger sync in background
    runWebSync().catch(() => {});
  };

  // Manual search
  const handleManualSearch = useCallback(
    async (q: string) => {
      setManualSearch(q);
      if (q.length < 2) {
        setManualResults([]);
        return;
      }
      const candidates = await matchOnline({ name: q });
      if (candidates.length > 0) {
        setManualResults(candidates);
      } else {
        const offline = await matchOffline(q);
        setManualResults(offline ? [offline] : []);
      }
    },
    []
  );

  const singleScan = async () => {
    if (!workerRef.current || !cameraReady) return;
    setScanning(true);
    await processFrame();
    setScanning(false);
  };

  const totalCards = scannedCards.reduce((sum, c) => sum + c.quantity, 0);
  const addableCards = scannedCards.filter((c) => !c.addedToCollection);

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      {/* Sub-header with scan stats */}
      <div className="border-b border-border bg-surface/80 backdrop-blur-sm sticky top-[57px] z-20">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-text-secondary hover:text-text-primary transition-colors text-sm font-medium"
            >
              &larr; Back
            </Link>
            <div className="w-px h-5 bg-border" />
            <h1 className="text-lg font-bold text-text-primary">Card Scanner</h1>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="default">{scanCount} scanned</Badge>
            <Badge variant="accent">${sessionValue.toFixed(2)}</Badge>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto flex flex-col lg:flex-row gap-6 p-6 animate-fade-in">
        {/* Left: Camera + Controls */}
        <div className="flex-1 min-w-0">
          {/* Camera feed — keep dark for visibility */}
          <div className="relative bg-gray-950 rounded-2xl overflow-hidden aspect-[4/3] shadow-[var(--shadow-card)]">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Card alignment guide */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div
                className={`w-[55%] h-[80%] border-2 rounded-xl transition-colors ${
                  scanning
                    ? "border-green-400 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
                    : continuousMode
                    ? "border-rose-400 animate-pulse-soft"
                    : "border-white/30"
                }`}
              >
                <div className="absolute bottom-3 left-0 right-0 text-center">
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full ${
                      scanning
                        ? "bg-green-500/20 text-green-300"
                        : continuousMode
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-black/50 text-white/60"
                    }`}
                  >
                    {scanning
                      ? "Reading..."
                      : continuousMode
                      ? "Hold card in frame"
                      : "Camera ready"}
                  </span>
                </div>
              </div>
            </div>

            {/* OCR detected text overlay */}
            {ocrText && (
              <div className="absolute top-3 left-3 right-3 animate-fade-in">
                <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-sm truncate">
                  <span className="text-white/60 mr-2">Detected:</span>
                  <span className="text-green-400 font-medium">{ocrText}</span>
                </div>
              </div>
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950/90 p-8">
                <div className="text-center">
                  <div className="text-4xl mb-4">&#128247;</div>
                  <p className="text-white/60 mb-4">{cameraError}</p>
                  <button
                    onClick={startCamera}
                    className="px-4 py-2 bg-tab-scan rounded-lg hover:opacity-90 text-white text-sm font-medium transition-colors"
                  >
                    Retry Camera
                  </button>
                </div>
              </div>
            )}

            {/* Tesseract loading indicator */}
            {!tesseractReady && !cameraError && (
              <div className="absolute bottom-3 right-3 animate-fade-in">
                <div className="bg-black/60 backdrop-blur-sm rounded-lg px-3 py-1.5 text-xs text-white/60 flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                  Loading OCR engine...
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="mt-4 flex gap-2 animate-slide-up">
            <button
              onClick={() => setContinuousMode(!continuousMode)}
              disabled={!cameraReady || !tesseractReady}
              className={`flex-1 py-3 rounded-2xl font-semibold text-sm transition-all ${
                continuousMode
                  ? "bg-danger hover:opacity-90 text-white"
                  : "bg-tab-scan hover:opacity-90 text-white"
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {continuousMode ? "Stop Auto-Scan" : "Start Auto-Scan"}
            </button>

            <button
              onClick={singleScan}
              disabled={!cameraReady || !tesseractReady || continuousMode || scanning}
              className="px-6 py-3 rounded-2xl font-semibold text-sm bg-surface border border-border text-text-primary hover:bg-surface-sunken shadow-[var(--shadow-card)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {scanning ? "Scanning..." : "Single Scan"}
            </button>

            <button
              onClick={undoLastScan}
              disabled={scannedCards.length === 0}
              className="px-4 py-3 rounded-2xl font-semibold text-sm bg-surface border border-border text-text-secondary hover:bg-surface-sunken shadow-[var(--shadow-card)] disabled:opacity-40 transition-colors"
            >
              Undo
            </button>
          </div>

          {/* Manual search fallback */}
          <div className="mt-5 animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <button
              onClick={() => setShowManual(!showManual)}
              className="text-sm text-text-muted hover:text-text-primary transition-colors"
            >
              {showManual ? "Hide manual search" : "Can't scan? Search manually"}
            </button>

            {showManual && (
              <div className="mt-3 animate-fade-in">
                <input
                  type="text"
                  value={manualSearch}
                  onChange={(e) => handleManualSearch(e.target.value)}
                  placeholder="Type card name..."
                  className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-tab-scan shadow-[var(--shadow-card)]"
                />
                {manualResults.length > 0 && (
                  <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                    {manualResults.map((c) => (
                      <button
                        key={c.variantId}
                        onClick={() => {
                          autoConfirmCard(c);
                          setManualSearch("");
                          setManualResults([]);
                        }}
                        className="w-full flex items-center gap-3 p-2.5 bg-surface rounded-xl border border-border hover:bg-surface-sunken transition-colors text-left shadow-[var(--shadow-card)] card-hover"
                      >
                        {c.imageUri && (
                          <img
                            src={c.imageUri}
                            alt={c.name}
                            className="w-8 h-11 rounded object-contain"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text-primary truncate">
                            {c.name}
                          </div>
                          <div className="text-xs text-text-muted">
                            {c.setId?.toUpperCase()} {c.collectorNumber}
                          </div>
                        </div>
                        <div className="text-xs text-tab-scan font-semibold">+Add</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Scanned cards sidebar */}
        <div className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <div className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)] overflow-hidden sticky top-28">
            {/* Sidebar header */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between bg-surface-sunken/50">
              <h2 className="font-bold text-sm text-text-primary">
                Scanned Cards{" "}
                <span className="text-text-muted font-normal">({totalCards})</span>
              </h2>
              {addableCards.length > 0 && (
                <button
                  onClick={addAllToCollection}
                  className="px-3 py-1.5 bg-success hover:opacity-90 rounded-lg text-xs font-semibold text-white transition-colors"
                >
                  Add All to Collection
                </button>
              )}
            </div>

            {/* Card list */}
            <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
              {scannedCards.length === 0 ? (
                <div className="p-8 text-center text-text-muted text-sm">
                  <div className="text-3xl mb-2">&#128064;</div>
                  Scanned cards will appear here
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {scannedCards.map((card, idx) => (
                    <div
                      key={card.variantId}
                      className={`flex items-center gap-3 p-3 transition-colors animate-slide-up ${
                        card.addedToCollection ? "bg-success-light" : ""
                      }`}
                      style={{ animationDelay: `${idx * 0.05}s` }}
                    >
                      {card.imageUri ? (
                        <img
                          src={card.imageUri}
                          alt={card.name}
                          className="w-10 h-14 rounded object-contain flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-surface-sunken rounded flex items-center justify-center text-xs text-text-muted flex-shrink-0">
                          ?
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate">
                          {card.name}
                        </div>
                        <div className="text-xs text-text-muted">
                          {card.setId?.toUpperCase()} {card.collectorNumber}
                        </div>
                        {card.priceUsd > 0 && (
                          <div className="text-xs text-tab-scan font-semibold mt-0.5">
                            ${(card.priceUsd * card.quantity).toFixed(2)}
                          </div>
                        )}
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => adjustQuantity(card.variantId, -1)}
                          className="w-6 h-6 rounded-full bg-surface-sunken border border-border hover:bg-border flex items-center justify-center text-xs text-text-secondary transition-colors"
                        >
                          -
                        </button>
                        <span className="text-sm font-medium w-6 text-center text-text-primary">
                          {card.quantity}
                        </span>
                        <button
                          onClick={() => adjustQuantity(card.variantId, 1)}
                          className="w-6 h-6 rounded-full bg-surface-sunken border border-border hover:bg-border flex items-center justify-center text-xs text-text-secondary transition-colors"
                        >
                          +
                        </button>
                      </div>

                      {card.addedToCollection && (
                        <span className="text-success text-xs flex-shrink-0 font-semibold">
                          &#10003;
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Session summary footer */}
            {scannedCards.length > 0 && (
              <div className="px-4 py-3 border-t border-border bg-surface-sunken/50">
                <div className="flex justify-between text-sm">
                  <span className="text-text-secondary">
                    {totalCards} card{totalCards !== 1 ? "s" : ""}
                  </span>
                  <span className="text-tab-scan font-bold">
                    Total: ${sessionValue.toFixed(2)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Disambiguation picker modal */}
      {showPicker && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div className="rounded-2xl border border-border bg-surface shadow-[var(--shadow-elevated)] w-full max-w-md overflow-hidden animate-scale-in">
            <div className="px-4 py-3 border-b border-border bg-surface-sunken/50">
              <h3 className="font-bold text-text-primary">Which card did you scan?</h3>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {pickerCandidates.map((c, idx) => (
                <button
                  key={c.variantId}
                  onClick={() => pickCandidate(c)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-surface-sunken transition-colors text-left border-b border-border last:border-b-0 animate-slide-up"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  {c.imageUri && (
                    <img
                      src={c.imageUri}
                      alt={c.name}
                      className="w-10 h-14 rounded object-contain"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-text-primary truncate">
                      {c.name}
                    </div>
                    <div className="text-xs text-text-muted">
                      {c.setId?.toUpperCase()} {c.collectorNumber}
                    </div>
                  </div>
                  <Badge variant="default">{c.score}%</Badge>
                </button>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <button
                onClick={() => {
                  setShowPicker(false);
                  setPickerCandidates([]);
                  setContinuousMode(true);
                }}
                className="w-full py-2 rounded-xl bg-surface-sunken hover:bg-border text-sm text-text-secondary font-medium transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

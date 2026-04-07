"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { streamDeckAgent, type AgentEvent, type AgentMode, type ParsedCard, type ParsedSwap } from "@/lib/deckAgentStream";
import { StatusPills, type ToolState } from "./components/StatusPills";
import { CardGallery } from "./components/CardGallery";
import { UpgradeDiff } from "./components/UpgradeDiff";
import { InputPanel } from "./components/InputPanel";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DeckStatStrip } from "@/components/ui/DeckStatStrip";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface SearchResult {
  variantId: string;
  cardId: string;
  name: string;
  setId?: string;
  collectorNumber?: string;
  manaCost?: string;
  imageUri?: string;
  typeLine?: string;
  priceUsd?: number | null;
}

interface DeckCard {
  cardId: string;
  variantId: string;
  name: string;
  quantity: number;
  board: "main" | "side" | "commander";
  priceUsd?: number;
  imageUri?: string;
  manaCost?: string;
  typeLine?: string;
  setId?: string;
  collectorNumber?: string;
  rarity?: string;
}

type ImportTab = "paste" | "url";
type AdvisorTab = "recs" | "swaps";

interface CardRecommendation {
  name: string;
  variantId: string | null;
  synergy: number;
  inclusionRate: number;
  owned: boolean;
  priceUsd: number | null;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  category: string;
  reason: string;
}

interface SwapSuggestion {
  cut: { name: string; synergy: number; inclusionRate: number; reason: string };
  add: {
    name: string;
    variantId: string | null;
    synergy: number;
    inclusionRate: number;
    owned: boolean;
    priceUsd: number | null;
    imageUri: string | null;
  };
  netSynergyGain: number;
  category: string;
}

function parseCmc(manaCost: string): number {
  if (!manaCost) return 0;
  let total = 0;
  const genericMatch = manaCost.match(/\{(\d+)\}/);
  if (genericMatch) total += parseInt(genericMatch[1], 10);
  const coloredSymbols = manaCost.match(/\{[WUBRG]\}/g) ?? [];
  const hybridSymbols = manaCost.match(/\{[WUBRG]\/[WUBRG]\}/g) ?? [];
  const phyrexianSymbols = manaCost.match(/\{[WUBRG]\/P\}/g) ?? [];
  total += coloredSymbols.length + hybridSymbols.length + phyrexianSymbols.length;
  return total;
}

export default function DeckEditorPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [deckName, setDeckName] = useState("Untitled Deck");
  const [format, setFormat] = useState("standard");
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  // Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [importTab, setImportTab] = useState<ImportTab>("paste");
  const [importText, setImportText] = useState("");
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{
    total: number;
    resolved: number;
    unresolved: number;
    unresolvedNames: string[];
  } | null>(null);

  // Advisor state
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [advisorTab, setAdvisorTab] = useState<AdvisorTab>("recs");
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<CardRecommendation[]>([]);
  const [swaps, setSwaps] = useState<SwapSuggestion[]>([]);
  const [advisorError, setAdvisorError] = useState<string | null>(null);

  // ── AI panel state ──
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState<AgentMode>("build");
  const [toolStates, setToolStates] = useState<ToolState[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [tierGroups, setTierGroups] = useState<Array<{ name: string; cards: ParsedCard[] }>>([]);
  const [aiSwaps, setAiSwaps] = useState<ParsedSwap[]>([]);
  const [cardDetails] = useState<Map<string, { priceUsd?: number | null; imageUri?: string | null }>>(new Map());
  const [addedByAi, setAddedByAi] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [escalateMessage, setEscalateMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const mainCards = cards.filter((c) => c.board === "main");
  const sideCards = cards.filter((c) => c.board === "side");
  const commanderCards = cards.filter((c) => c.board === "commander");
  const mainCount = mainCards.reduce((a, c) => a + c.quantity, 0);
  const sideCount = sideCards.reduce((a, c) => a + c.quantity, 0);
  const totalValue = cards.reduce(
    (a, c) => a + (c.priceUsd ?? 0) * c.quantity,
    0
  );

  const deckStats = useMemo(() => {
    const mainDeckCards = cards.filter((c) => c.board === "main" || c.board === "commander");
    const total = mainDeckCards.reduce((sum, c) => sum + c.quantity, 0);
    const cmcSum = mainDeckCards.reduce((sum, c) => {
      const cmc = parseCmc(c.manaCost ?? "");
      return sum + cmc * c.quantity;
    }, 0);
    const avgCmc = total > 0 ? cmcSum / total : null;
    const rares = mainDeckCards.filter((c) => c.rarity === "rare").reduce((s, c) => s + c.quantity, 0);
    const mythics = mainDeckCards.filter((c) => c.rarity === "mythic").reduce((s, c) => s + c.quantity, 0);
    return { total, avgCmc, rares, mythics };
  }, [cards]);

  // Load user for NavBar
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    loadUser();
  }, []);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `${API_URL}/v1/search?q=${encodeURIComponent(searchQuery)}&limit=15`
        );
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.cards ?? []);
        }
      } catch {
        // offline
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const addCard = useCallback(
    (result: SearchResult, board: "main" | "side" | "commander" = "main") => {
      setCards((prev) => {
        const existing = prev.find(
          (c) => c.variantId === result.variantId && c.board === board
        );
        if (existing) {
          return prev.map((c) =>
            c.variantId === result.variantId && c.board === board
              ? { ...c, quantity: c.quantity + 1 }
              : c
          );
        }
        return [
          ...prev,
          {
            cardId: result.cardId,
            variantId: result.variantId,
            name: result.name,
            quantity: 1,
            board,
            priceUsd: result.priceUsd ?? undefined,
            imageUri: result.imageUri,
            manaCost: result.manaCost,
            typeLine: result.typeLine,
            setId: result.setId,
            collectorNumber: result.collectorNumber,
          },
        ];
      });
    },
    []
  );

  const runAi = useCallback(async (params: {
    instruction: string;
    bracket: 1 | 2 | 3 | 4 | 5;
    budget: number;
    deckText?: string;
    deckUrl?: string;
    deckId?: string;
  }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setAiLoading(true);
    setToolStates([]);
    setStatusMessage(null);
    setTierGroups([]);
    setAiSwaps([]);
    setEscalateMessage(null);

    let currentTier = "";

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? undefined;

      await streamDeckAgent(
        {
          instruction: params.instruction,
          bracket: params.bracket,
          budget: params.budget,
          deckText: params.deckText,
          deckUrl: params.deckUrl,
          deckId: params.deckId,
          sessionId: sessionId ?? undefined,
          token,
        },
        (event: AgentEvent) => {
          switch (event.type) {
            case "mode":
              setAiMode(event.mode);
              break;
            case "tool_start":
              setToolStates((prev) => [...prev, { tool: event.tool, status: "running" }]);
              break;
            case "tool_done":
              setToolStates((prev) =>
                prev.map((t) => t.tool === event.tool && t.status === "running" ? { ...t, status: "done" } : t)
              );
              break;
            case "status":
              setStatusMessage(event.message);
              break;
            case "escalate":
              setEscalateMessage(event.message);
              setAiLoading(false);
              break;
            case "tier":
              currentTier = event.name;
              setTierGroups((prev) => {
                if (prev.find((g) => g.name === event.name)) return prev;
                return [...prev, { name: event.name, cards: [] }];
              });
              break;
            case "card":
              setTierGroups((prev) =>
                prev.map((g) =>
                  g.name === (event.tier || currentTier)
                    ? { ...g, cards: [...g.cards, event.card] }
                    : g
                )
              );
              break;
            case "swap":
              setAiSwaps((prev) => [...prev, event.swap]);
              break;
            case "session_id":
              setSessionId(event.id);
              break;
            case "done":
              setAiLoading(false);
              setStatusMessage(null);
              break;
          }
        },
        controller.signal
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("[ai panel]", err);
      }
      setAiLoading(false);
    }
  }, [sessionId]);

  const handleAddFromAi = useCallback((cardName: string) => {
    setAddedByAi((prev) => new Set(prev).add(cardName));
    // Find if card exists in search results — if not, add by name only
    const syntheticResult = { variantId: "", cardId: "", name: cardName };
    addCard(syntheticResult as SearchResult, "main");
  }, [addCard]);

  const removeCard = useCallback((variantId: string, board: string) => {
    setCards((prev) => {
      const existing = prev.find(
        (c) => c.variantId === variantId && c.board === board
      );
      if (existing && existing.quantity > 1) {
        return prev.map((c) =>
          c.variantId === variantId && c.board === board
            ? { ...c, quantity: c.quantity - 1 }
            : c
        );
      }
      return prev.filter(
        (c) => !(c.variantId === variantId && c.board === board)
      );
    });
  }, []);

  // ─── Export ─────────────────────────────────────────────────────────────────

  const handleExportText = () => {
    const lines: string[] = [];
    lines.push(`// ${deckName} (${format})`);
    if (commanderCards.length > 0) {
      lines.push("");
      lines.push("// Commander");
      for (const c of commanderCards) lines.push(`${c.quantity} ${c.name}`);
    }
    lines.push("");
    for (const c of mainCards) lines.push(`${c.quantity} ${c.name}`);
    if (sideCards.length > 0) {
      lines.push("");
      lines.push("// Sideboard");
      for (const c of sideCards) lines.push(`${c.quantity} ${c.name}`);
    }
    navigator.clipboard.writeText(lines.join("\n"));
  };

  const handleExportMTGA = () => {
    const lines: string[] = [];
    if (commanderCards.length > 0) {
      lines.push("Commander");
      for (const c of commanderCards)
        lines.push(
          `${c.quantity} ${c.name}${c.setId ? ` (${c.setId.toUpperCase()})` : ""}${c.collectorNumber ? ` ${c.collectorNumber}` : ""}`
        );
      lines.push("");
    }
    lines.push("Deck");
    for (const c of mainCards)
      lines.push(
        `${c.quantity} ${c.name}${c.setId ? ` (${c.setId.toUpperCase()})` : ""}${c.collectorNumber ? ` ${c.collectorNumber}` : ""}`
      );
    if (sideCards.length > 0) {
      lines.push("");
      lines.push("Sideboard");
      for (const c of sideCards)
        lines.push(
          `${c.quantity} ${c.name}${c.setId ? ` (${c.setId.toUpperCase()})` : ""}${c.collectorNumber ? ` ${c.collectorNumber}` : ""}`
        );
    }
    navigator.clipboard.writeText(lines.join("\n"));
  };

  // ─── Import ─────────────────────────────────────────────────────────────────

  const parseAndImport = useCallback(
    async (text: string) => {
      setImporting(true);
      setImportError(null);
      setImportResult(null);

      const lines = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      if (lines.length === 0) {
        setImportError("No card lines found. Paste a decklist in standard format.");
        setImporting(false);
        return;
      }

      try {
        const res = await fetch(`${API_URL}/v1/deck/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines }),
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const data = await res.json();

        // Add resolved cards to the deck
        const newCards: DeckCard[] = [];
        const unresolvedNames: string[] = [];
        for (const card of data.cards) {
          if (card.resolved && card.variantId) {
            newCards.push({
              cardId: card.cardId,
              variantId: card.variantId,
              name: card.name,
              quantity: card.quantity,
              board: card.board,
              priceUsd: card.priceUsd ?? undefined,
              imageUri: card.imageUri ?? undefined,
              manaCost: card.manaCost ?? undefined,
              typeLine: card.typeLine ?? undefined,
              setId: card.setId ?? undefined,
              collectorNumber: card.collectorNumber ?? undefined,
            });
          } else {
            unresolvedNames.push(card.name);
          }
        }

        // Merge with existing cards
        setCards((prev) => {
          const merged = [...prev];
          for (const nc of newCards) {
            const existing = merged.find(
              (c) => c.name.toLowerCase() === nc.name.toLowerCase() && c.board === nc.board
            );
            if (existing) {
              existing.quantity += nc.quantity;
            } else {
              merged.push(nc);
            }
          }
          return merged;
        });

        setImportResult({
          total: data.total,
          resolved: data.resolved,
          unresolved: data.unresolved,
          unresolvedNames,
        });
      } catch (e: unknown) {
        setImportError(e instanceof Error ? e.message : "Import failed");
      } finally {
        setImporting(false);
      }
    },
    []
  );

  const handleImportPaste = () => {
    parseAndImport(importText);
  };

  const handleImportUrl = async () => {
    setImporting(true);
    setImportError(null);

    try {
      const url = importUrl.trim();
      if (!url) {
        setImportError("Please enter a URL");
        setImporting(false);
        return;
      }

      // Moxfield API
      if (url.includes("moxfield.com/decks/")) {
        const deckId = url.split("/decks/")[1]?.split(/[?#]/)[0];
        if (!deckId) throw new Error("Could not parse Moxfield deck ID from URL");
        const res = await fetch(`https://api2.moxfield.com/v3/decks/all/${deckId}`);
        if (!res.ok) throw new Error("Failed to fetch Moxfield deck. Make sure the deck is public.");
        const data = await res.json();

        const lines: string[] = [];
        if (data.commanders) {
          lines.push("// Commander");
          for (const [, entry] of Object.entries(data.commanders) as [string, { quantity: number; card: { name: string } }][]) {
            lines.push(`${entry.quantity} ${entry.card.name}`);
          }
        }
        if (data.mainboard) {
          for (const [, entry] of Object.entries(data.mainboard) as [string, { quantity: number; card: { name: string } }][]) {
            lines.push(`${entry.quantity} ${entry.card.name}`);
          }
        }
        if (data.sideboard) {
          lines.push("// Sideboard");
          for (const [, entry] of Object.entries(data.sideboard) as [string, { quantity: number; card: { name: string } }][]) {
            lines.push(`${entry.quantity} ${entry.card.name}`);
          }
        }
        if (data.name) setDeckName(data.name);
        if (data.format) setFormat(data.format.toLowerCase());

        await parseAndImport(lines.join("\n"));
        return;
      }

      // Archidekt
      if (url.includes("archidekt.com/decks/")) {
        const deckId = url.split("/decks/")[1]?.split(/[?#/]/)[0];
        if (!deckId) throw new Error("Could not parse Archidekt deck ID from URL");
        const res = await fetch(`https://archidekt.com/api/decks/${deckId}/`);
        if (!res.ok) throw new Error("Failed to fetch Archidekt deck. Make sure the deck is public.");
        const data = await res.json();

        const lines: string[] = [];
        for (const card of data.cards ?? []) {
          const cat = card.categories?.[0]?.toLowerCase();
          if (cat === "commander" || cat === "companion") {
            lines.push(`// Commander`);
            lines.push(`${card.quantity} ${card.card?.oracleCard?.name ?? card.card?.name ?? "Unknown"}`);
          } else if (cat === "sideboard") {
            // We'll handle sideboard below
          } else {
            lines.push(`${card.quantity} ${card.card?.oracleCard?.name ?? card.card?.name ?? "Unknown"}`);
          }
        }
        // Now sideboard
        const sideboardCards = (data.cards ?? []).filter(
          (c: { categories?: string[] }) => c.categories?.[0]?.toLowerCase() === "sideboard"
        );
        if (sideboardCards.length > 0) {
          lines.push("// Sideboard");
          for (const card of sideboardCards) {
            lines.push(`${card.quantity} ${card.card?.oracleCard?.name ?? card.card?.name ?? "Unknown"}`);
          }
        }
        if (data.name) setDeckName(data.name);

        await parseAndImport(lines.join("\n"));
        return;
      }

      // For other URLs (MTGGoldfish, TappedOut, etc.), try generic approach:
      // fetch the page and look for a decklist in plain text
      setImportError(
        "Currently supported URL imports: Moxfield and Archidekt. " +
        "For other sites, copy the decklist text and use the Paste tab."
      );
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  // Mana cost formatting
  const formatMana = (cost: string) => {
    return cost
      .replace(/\{W\}/g, "W")
      .replace(/\{U\}/g, "U")
      .replace(/\{B\}/g, "B")
      .replace(/\{R\}/g, "R")
      .replace(/\{G\}/g, "G")
      .replace(/\{(\d+)\}/g, "$1")
      .replace(/\{C\}/g, "C")
      .replace(/[{}]/g, "");
  };

  // ─── Advisor ──────────────────────────────────────────────────────────────

  const commanderName = commanderCards[0]?.name ?? "";
  const canUseAdvisor = format === "commander" && commanderName.length > 0;

  const fetchRecs = useCallback(async () => {
    if (!commanderName) return;
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const currentCardNames = cards.map((c) => c.name);
      const res = await fetch(`${API_URL}/v1/deck/recs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commanderName,
          currentCards: currentCardNames,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setRecommendations(data.recommendations ?? []);
    } catch (e: unknown) {
      setAdvisorError(e instanceof Error ? e.message : "Failed to fetch recommendations");
    } finally {
      setAdvisorLoading(false);
    }
  }, [commanderName, cards]);

  const fetchSwaps = useCallback(async () => {
    if (!commanderName) return;
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const currentCardNames = cards.map((c) => c.name);
      const res = await fetch(`${API_URL}/v1/deck/swaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commanderName,
          currentCards: currentCardNames,
        }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setSwaps(data.swaps ?? []);
    } catch (e: unknown) {
      setAdvisorError(e instanceof Error ? e.message : "Failed to fetch swap suggestions");
    } finally {
      setAdvisorLoading(false);
    }
  }, [commanderName, cards]);

  const handleOpenAdvisor = useCallback((tab: AdvisorTab) => {
    setShowAdvisor(true);
    setAdvisorTab(tab);
    if (tab === "recs") fetchRecs();
    else fetchSwaps();
  }, [fetchRecs, fetchSwaps]);

  const applySwap = useCallback((swap: SwapSuggestion) => {
    setCards((prev) => {
      // Remove the cut card
      let updated = prev.filter(
        (c) => c.name.toLowerCase() !== swap.cut.name.toLowerCase()
      );
      // Add the replacement card if we have a variantId
      if (swap.add.variantId) {
        updated = [
          ...updated,
          {
            cardId: swap.add.variantId.split(":")[1] ?? swap.add.variantId,
            variantId: swap.add.variantId,
            name: swap.add.name,
            quantity: 1,
            board: "main" as const,
            priceUsd: swap.add.priceUsd ?? undefined,
            imageUri: swap.add.imageUri ?? undefined,
          },
        ];
      }
      return updated;
    });
  }, []);

  // ─── Card row component ────────────────────────────────────────────────────

  const CardRow = ({
    card,
    board,
  }: {
    card: DeckCard;
    board: string;
  }) => (
    <div
      className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)] card-hover"
      onMouseEnter={() => setHoveredCard(card.imageUri ?? null)}
      onMouseLeave={() => setHoveredCard(null)}
    >
      <button
        onClick={() => removeCard(card.variantId, board)}
        className="w-5 text-center text-xs text-text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
      >
        -
      </button>
      <span className="w-6 text-center text-sm font-mono font-bold text-text-primary">
        {card.quantity}
      </span>
      <Link
        href={`/card/${encodeURIComponent(card.variantId)}`}
        className="flex-1 text-sm font-medium text-text-primary hover:text-tab-deck transition-colors"
      >
        {card.name}
      </Link>
      {card.manaCost && (
        <span className="text-xs text-text-muted font-mono">
          {formatMana(card.manaCost)}
        </span>
      )}
      {card.priceUsd != null && (
        <span className="text-xs text-tab-deck tabular-nums">
          ${(card.priceUsd * card.quantity).toFixed(2)}
        </span>
      )}
      <button
        onClick={() => addCard(card as unknown as SearchResult)}
        className="w-5 text-center text-xs text-text-muted opacity-0 transition hover:text-success group-hover:opacity-100"
      >
        +
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="text-2xl font-bold bg-transparent text-text-primary border-none outline-none"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="rounded-lg border border-border bg-surface px-3 py-1 text-sm text-text-primary"
          >
            <option value="standard">Standard</option>
            <option value="modern">Modern</option>
            <option value="pioneer">Pioneer</option>
            <option value="legacy">Legacy</option>
            <option value="vintage">Vintage</option>
            <option value="commander">Commander</option>
            <option value="pauper">Pauper</option>
          </select>
        </div>

        <DeckStatStrip
          cardCount={deckStats.total}
          avgCmc={deckStats.avgCmc}
          rareCount={deckStats.rares}
          mythicCount={deckStats.mythics}
          className="mt-3 max-w-xs"
        />

        {/* Stats panel */}
        <div className="mt-4 flex flex-wrap gap-6 rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)] animate-slide-up">
          <div>
            <span className="text-xs text-text-muted">Main</span>
            <p className="text-lg font-bold text-text-primary">
              {mainCount}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Side</span>
            <p className="text-lg font-bold text-text-primary">
              {sideCount}
            </p>
          </div>
          {commanderCards.length > 0 && (
            <div>
              <span className="text-xs text-text-muted">Commander</span>
              <p className="text-lg font-bold text-text-primary">
                {commanderCards.length}
              </p>
            </div>
          )}
          <div>
            <span className="text-xs text-text-muted">Unique</span>
            <p className="text-lg font-bold text-text-primary">
              {new Set(cards.map((c) => c.cardId)).size}
            </p>
          </div>
          <div>
            <span className="text-xs text-text-muted">Value</span>
            <p className="text-lg font-bold text-tab-deck">
              ${totalValue.toFixed(2)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setShowImportModal(true)}
            >
              Import Deck
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportText}
              title="Copy as plain text"
            >
              Copy List
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportMTGA}
              title="Copy in Arena/MTGO format"
            >
              Copy MTGA
            </Button>
            {canUseAdvisor && (
              <>
                <div className="mx-1 h-6 w-px bg-border" />
                <button
                  onClick={() => handleOpenAdvisor("recs")}
                  className="rounded-lg bg-success px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  title="Get card suggestions from EDHREC"
                >
                  Suggest Cards
                </button>
                <button
                  onClick={() => handleOpenAdvisor("swaps")}
                  className="rounded-lg border border-success px-4 py-1.5 text-sm font-semibold text-[var(--success-text)] hover:bg-success-light transition-colors"
                  title="Find cards to swap in/out"
                >
                  Find Swaps
                </button>
              </>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Card list */}
          <div className="lg:col-span-2 animate-slide-up stagger-2">
            {/* Commander section */}
            {commanderCards.length > 0 && (
              <>
                <h2 className="mb-3 text-lg font-semibold text-text-primary">
                  Commander
                </h2>
                <div className="mb-4 space-y-1">
                  {commanderCards.map((card) => (
                    <CardRow key={`cmd-${card.variantId}`} card={card} board="commander" />
                  ))}
                </div>
              </>
            )}

            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Main Deck ({mainCount})
            </h2>
            {mainCards.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                <p className="text-text-muted">Search and add cards, or import a decklist</p>
                <Button
                  size="sm"
                  onClick={() => setShowImportModal(true)}
                  className="mt-3"
                >
                  Import Deck
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {mainCards.map((card) => (
                  <CardRow key={card.variantId} card={card} board="main" />
                ))}
              </div>
            )}

            {sideCards.length > 0 && (
              <>
                <h2 className="mb-3 mt-6 text-lg font-semibold text-text-primary">
                  Sideboard ({sideCount})
                </h2>
                <div className="space-y-1">
                  {sideCards.map((card) => (
                    <CardRow key={`side-${card.variantId}`} card={card} board="side" />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Search + add panel */}
          <div className="animate-slide-up stagger-3">
            <h2 className="mb-3 text-lg font-semibold text-text-primary">
              Add Cards
            </h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a card..."
              className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-deck focus:outline-none transition-colors"
            />

            {/* Card preview on hover */}
            {hoveredCard && (
              <div className="mt-3 animate-fade-in">
                <img
                  src={hoveredCard}
                  alt="Card preview"
                  className="w-full rounded-xl shadow-[var(--shadow-card)]"
                />
              </div>
            )}

            {searching && (
              <p className="mt-3 text-xs text-text-muted">Searching...</p>
            )}

            {searchResults.length > 0 && (
              <div className="mt-3 max-h-96 space-y-1 overflow-y-auto">
                {searchResults.map((r) => (
                  <div
                    key={r.variantId}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-card)] card-hover"
                  >
                    {r.imageUri && (
                      <img
                        src={r.imageUri}
                        alt={r.name}
                        className="h-10 w-auto rounded"
                        loading="lazy"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">
                        {r.name}
                      </p>
                      <p className="text-[10px] text-text-muted">
                        {r.setId?.toUpperCase()}{" "}
                        {r.priceUsd != null && r.priceUsd > 0
                          ? `• $${r.priceUsd.toFixed(2)}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => addCard(r, "main")}
                        className="rounded bg-tab-deck px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 transition-colors"
                      >
                        Main
                      </button>
                      <button
                        onClick={() => addCard(r, "side")}
                        className="rounded border border-border px-2 py-1 text-[10px] font-medium text-text-secondary hover:bg-surface-sunken transition-colors"
                      >
                        Side
                      </button>
                      {format === "commander" && (
                        <button
                          onClick={() => addCard(r, "commander")}
                          className="rounded border border-warning px-2 py-1 text-[10px] font-medium text-[var(--warning-text)] hover:bg-warning-light transition-colors"
                        >
                          Cmdr
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── Advisor Panel ─── */}
      {showAdvisor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-surface shadow-[var(--shadow-modal)] animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-text-primary">
                  Deck Advisor
                </h2>
                <p className="text-xs text-text-secondary">
                  Powered by EDHREC data for {commanderName}
                </p>
              </div>
              <button
                onClick={() => setShowAdvisor(false)}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border">
              <button
                onClick={() => { setAdvisorTab("recs"); fetchRecs(); }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  advisorTab === "recs"
                    ? "border-b-2 border-success text-[var(--success-text)]"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Suggest Cards
              </button>
              <button
                onClick={() => { setAdvisorTab("swaps"); fetchSwaps(); }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  advisorTab === "swaps"
                    ? "border-b-2 border-success text-[var(--success-text)]"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Find Swaps
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {advisorLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-success border-t-transparent" />
                  <span className="ml-3 text-sm text-text-muted">Analyzing deck with EDHREC...</span>
                </div>
              )}

              {advisorError && (
                <div className="rounded-xl border border-danger bg-danger-light p-3">
                  <p className="text-sm text-[var(--danger-text)]">{advisorError}</p>
                </div>
              )}

              {/* Recommendations tab */}
              {!advisorLoading && advisorTab === "recs" && recommendations.length > 0 && (
                <div className="space-y-2">
                  {(() => {
                    const grouped = new Map<string, CardRecommendation[]>();
                    for (const rec of recommendations) {
                      const group = grouped.get(rec.category) ?? [];
                      group.push(rec);
                      grouped.set(rec.category, group);
                    }
                    return [...grouped.entries()].map(([category, recs]) => (
                      <div key={category}>
                        <h3 className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-text-muted">
                          {category}s ({recs.length})
                        </h3>
                        <div className="space-y-1">
                          {recs.map((rec) => (
                            <div
                              key={rec.name}
                              className="group flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)] card-hover"
                              onMouseEnter={() => setHoveredCard(rec.imageUri)}
                              onMouseLeave={() => setHoveredCard(null)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-text-primary truncate">
                                    {rec.name}
                                  </p>
                                  {rec.owned && (
                                    <Badge variant="success" className="text-[10px]">OWNED</Badge>
                                  )}
                                </div>
                                <p className="text-[10px] text-text-muted truncate">
                                  {rec.reason}
                                </p>
                              </div>
                              {rec.manaCost && (
                                <span className="text-xs text-text-muted font-mono shrink-0">
                                  {formatMana(rec.manaCost)}
                                </span>
                              )}
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="success" className="text-[10px] tabular-nums">
                                  +{Math.round(rec.synergy * 100)}%
                                </Badge>
                                {rec.priceUsd != null && (
                                  <span className="text-[10px] text-text-muted tabular-nums">
                                    ${rec.priceUsd.toFixed(2)}
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    if (rec.variantId) {
                                      addCard({
                                        variantId: rec.variantId,
                                        cardId: rec.variantId.split(":")[1] ?? rec.variantId,
                                        name: rec.name,
                                        imageUri: rec.imageUri ?? undefined,
                                        manaCost: rec.manaCost ?? undefined,
                                        typeLine: rec.typeLine ?? undefined,
                                        priceUsd: rec.priceUsd,
                                      }, "main");
                                    }
                                  }}
                                  className="rounded bg-success px-2 py-1 text-[10px] font-medium text-white hover:opacity-90 transition-opacity"
                                >
                                  Add
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {!advisorLoading && advisorTab === "recs" && recommendations.length === 0 && !advisorError && (
                <p className="py-8 text-center text-sm text-text-muted">
                  No recommendations found. Make sure you have a commander set and the deck has some cards.
                </p>
              )}

              {/* Swaps tab */}
              {!advisorLoading && advisorTab === "swaps" && swaps.length > 0 && (
                <div className="space-y-3">
                  {swaps.map((swap, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-card)]"
                    >
                      <div className="flex items-center justify-between">
                        <Badge>{swap.category}</Badge>
                        <Badge variant="success" className="tabular-nums">
                          +{Math.round(swap.netSynergyGain * 100)}% synergy
                        </Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        {/* Cut card */}
                        <div className="rounded-xl border border-danger bg-danger-light p-2">
                          <p className="text-xs font-medium text-[var(--danger-text)]">
                            {swap.cut.name}
                          </p>
                          <p className="text-[10px] text-[var(--danger-text)] opacity-75">
                            {swap.cut.reason}
                          </p>
                        </div>
                        {/* Arrow */}
                        <svg className="h-5 w-5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                        {/* Add card */}
                        <div
                          className="rounded-xl border border-success bg-success-light p-2"
                          onMouseEnter={() => setHoveredCard(swap.add.imageUri)}
                          onMouseLeave={() => setHoveredCard(null)}
                        >
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium text-[var(--success-text)]">
                              {swap.add.name}
                            </p>
                            {swap.add.owned && (
                              <Badge variant="success" className="text-[8px]">OWNED</Badge>
                            )}
                          </div>
                          <p className="text-[10px] text-[var(--success-text)] opacity-75">
                            Synergy: +{Math.round(swap.add.synergy * 100)}% &middot; {Math.round(swap.add.inclusionRate * 100)}% of decks
                            {swap.add.priceUsd != null && ` · $${swap.add.priceUsd.toFixed(2)}`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => applySwap(swap)}
                        className="mt-3 w-full rounded-lg border border-success px-3 py-1.5 text-xs font-medium text-[var(--success-text)] hover:bg-success-light transition-colors"
                      >
                        Apply Swap
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {!advisorLoading && advisorTab === "swaps" && swaps.length === 0 && !advisorError && (
                <p className="py-8 text-center text-sm text-text-muted">
                  No swap suggestions found. Your deck looks solid, or ensure the commander is set.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Import Modal ─── */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-surface shadow-[var(--shadow-modal)] animate-scale-in">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-text-primary">
                Import Deck
              </h2>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportError(null);
                  setImportResult(null);
                }}
                className="text-text-muted hover:text-text-primary transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Tab bar */}
            <div className="flex border-b border-border">
              <button
                onClick={() => setImportTab("paste")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  importTab === "paste"
                    ? "border-b-2 border-tab-deck text-tab-deck"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Paste Decklist
              </button>
              <button
                onClick={() => setImportTab("url")}
                className={`flex-1 px-4 py-3 text-sm font-medium transition ${
                  importTab === "url"
                    ? "border-b-2 border-tab-deck text-tab-deck"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                Import from URL
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              {importTab === "paste" ? (
                <div>
                  <p className="mb-3 text-sm text-text-secondary">
                    Paste your decklist in any standard format (MTGO, Arena, plain text).
                    Supported formats:
                  </p>
                  <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
                    <div className="rounded-lg bg-surface-sunken p-2 font-mono">
                      4 Lightning Bolt<br />
                      2 Counterspell<br />
                      {"// Sideboard"}<br />
                      2 Pyroblast
                    </div>
                    <div className="rounded-lg bg-surface-sunken p-2 font-mono">
                      4 Lightning Bolt (A25) 141<br />
                      2 Counterspell (MH2) 267<br />
                      Sideboard<br />
                      2 Pyroblast (IMA) 145
                    </div>
                  </div>
                  <textarea
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={"4 Lightning Bolt\n2 Counterspell\n4 Dark Ritual\n\n// Sideboard\n2 Pyroblast"}
                    className="h-52 w-full resize-none rounded-xl border border-border bg-surface px-4 py-3 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-tab-deck focus:outline-none transition-colors"
                  />
                  <Button
                    onClick={handleImportPaste}
                    disabled={!importText.trim()}
                    loading={importing}
                    className="mt-3 w-full"
                  >
                    Import Decklist
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="mb-3 text-sm text-text-secondary">
                    Paste a deck URL from a supported site. The deck must be public.
                  </p>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {["Moxfield", "Archidekt"].map((site) => (
                      <Badge key={site} variant="success">{site}</Badge>
                    ))}
                    {["MTGGoldfish", "TappedOut"].map((site) => (
                      <Badge
                        key={site}
                        className="cursor-default"
                      >
                        {site} (paste only)
                      </Badge>
                    ))}
                  </div>
                  <input
                    type="url"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://www.moxfield.com/decks/..."
                    className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-deck focus:outline-none transition-colors"
                  />
                  <Button
                    onClick={handleImportUrl}
                    disabled={!importUrl.trim()}
                    loading={importing}
                    className="mt-3 w-full"
                  >
                    Import from URL
                  </Button>
                </div>
              )}

              {/* Error display */}
              {importError && (
                <div className="mt-4 rounded-xl border border-danger bg-danger-light p-3">
                  <p className="text-sm text-[var(--danger-text)]">{importError}</p>
                </div>
              )}

              {/* Success display */}
              {importResult && (
                <div className="mt-4 rounded-xl border border-success bg-success-light p-3">
                  <p className="text-sm font-medium text-[var(--success-text)]">
                    Imported {importResult.resolved} of {importResult.total} cards
                  </p>
                  {importResult.unresolved > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-[var(--success-text)] opacity-75">
                        Could not find: {importResult.unresolvedNames.join(", ")}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setShowImportModal(false);
                      setImportText("");
                      setImportUrl("");
                      setImportError(null);
                      setImportResult(null);
                    }}
                    className="mt-3 rounded-lg bg-success px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── AI Deck Builder FAB ── */}
      <button
        onClick={() => setShowAiPanel((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-teal-600 hover:bg-teal-500 text-white font-semibold text-sm shadow-xl shadow-teal-900/40 transition-all duration-200"
      >
        <span>✦</span>
        {showAiPanel ? "Close AI" : "Deck AI"}
      </button>

      {/* ── AI Deck Builder Panel ── */}
      {showAiPanel && (
        <div className="fixed inset-y-0 right-0 w-[420px] z-40 flex flex-col bg-slate-900 border-l border-slate-700/50 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <h2 className="font-bold text-slate-100 text-sm">✦ Deck AI</h2>
            <button onClick={() => setShowAiPanel(false)} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
            <InputPanel
              savedDecks={[]}
              onSubmit={runAi}
              loading={aiLoading}
            />

            {escalateMessage && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                {escalateMessage.replace("ESCALATE — ", "")}
              </div>
            )}

            <StatusPills tools={toolStates} statusMessage={statusMessage} />

            {aiMode === "upgrade" && aiSwaps.length > 0 && (
              <UpgradeDiff
                swaps={aiSwaps}
                onAccept={(swap) => handleAddFromAi(swap.add.name)}
                onReject={() => {}}
              />
            )}

            {aiMode !== "upgrade" && tierGroups.length > 0 && (
              <CardGallery
                tiers={tierGroups}
                cardDetails={cardDetails}
                onAddCard={handleAddFromAi}
                addedCards={addedByAi}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

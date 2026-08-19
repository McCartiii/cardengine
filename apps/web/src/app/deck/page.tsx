"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { streamDeckAgent, type AgentEvent, type AgentMode, type AgentSessionContext, type DeckValidationResult, type ParsedCard, type ParsedSwap } from "@/lib/deckAgentStream";
import { StatusPills, type ToolState } from "./components/StatusPills";
import { CardGallery } from "./components/CardGallery";
import { UpgradeDiff } from "./components/UpgradeDiff";
import { InputPanel } from "./components/InputPanel";
import { ValidationPanel } from "./components/ValidationPanel";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CardImage } from "@/components/ui/CardImage";
import { api, setToken } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_STORAGE_KEY = "deck-ai-session-id";

interface SavedDeckOption {
  id: string;
  name: string;
  commander?: string | null;
}

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

const FORMATS = ["standard", "modern", "pioneer", "legacy", "vintage", "commander", "pauper"] as const;

function getTypeGroup(typeLine?: string): string {
  if (!typeLine) return "Other";
  const t = typeLine.toLowerCase();
  if (t.includes("land")) return "Lands";
  if (t.includes("creature")) return "Creatures";
  if (t.includes("planeswalker")) return "Planeswalkers";
  if (t.includes("instant")) return "Instants";
  if (t.includes("sorcery")) return "Sorceries";
  if (t.includes("artifact")) return "Artifacts";
  if (t.includes("enchantment")) return "Enchantments";
  return "Other";
}

const TYPE_ORDER = ["Creatures", "Planeswalkers", "Instants", "Sorceries", "Artifacts", "Enchantments", "Lands", "Other"];

function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
        {label}{count != null ? ` (${count})` : ""}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
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
  const [sessionContext, setSessionContext] = useState<AgentSessionContext | null>(null);
  const [validationResult, setValidationResult] = useState<DeckValidationResult | null>(null);
  const [savedDecks, setSavedDecks] = useState<SavedDeckOption[]>([]);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyResult, setApplyResult] = useState<{ resolved: number; unresolved: string[] } | null>(null);
  const [escalateMessage, setEscalateMessage] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
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

  const groupedMainCards = useMemo(() => {
    const groups = new Map<string, DeckCard[]>();
    for (const card of mainCards) {
      const group = getTypeGroup(card.typeLine);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group)!.push(card);
    }
    return TYPE_ORDER.filter((t) => groups.has(t)).map((t) => ({
      name: t,
      cards: groups.get(t)!,
      count: groups.get(t)!.reduce((sum, c) => sum + c.quantity, 0),
    }));
  }, [mainCards]);

  // Load user for NavBar + saved decks
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          setToken(session.access_token);
          try {
            const { decks } = await api.decks.list();
            setSavedDecks(
              decks.map((d) => ({
                id: d.id,
                name: d.name,
                commander: d.commander,
              }))
            );
          } catch {
            // offline or unauthenticated API
          }
        }
      }
    }
    loadUser();
  }, []);

  // Restore AI session id from local storage
  useEffect(() => {
    const stored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (stored) setSessionId(stored);
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
        const existing = prev.find((c) => {
          if (result.variantId) return c.variantId === result.variantId && c.board === board;
          return c.name.toLowerCase() === result.name.toLowerCase() && c.board === board;
        });
        if (existing) {
          return prev.map((c) =>
            ((result.variantId && c.variantId === result.variantId) ||
              (!result.variantId && c.name.toLowerCase() === result.name.toLowerCase())) &&
            c.board === board
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
    format: "commander" | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper";
    bracket: 1 | 2 | 3 | 4 | 5;
    budget: number;
    deckText?: string;
    deckUrl?: string;
    deckId?: string;
    blueprint?: {
      goals?: string[];
      keyCards?: string[];
      avoidCards?: string[];
      modelAfter?: string;
      playSpeed?: "slow" | "balanced" | "fast";
      comboTolerance?: "none" | "low" | "medium" | "high";
      tablePressure?: "low" | "medium" | "high";
      notes?: string;
    };
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
    setAiError(null);
    setValidationResult(null);
    setApplyResult(null);

    let currentTier = "";

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? undefined;

      const hasExplicitImport = Boolean(params.deckUrl || params.deckText || params.deckId);
      const deckCardsForAgent = hasExplicitImport
        ? undefined
        : cards.flatMap((c) => Array.from({ length: c.quantity }, () => c.name));

      await streamDeckAgent(
        {
          instruction: params.instruction,
          format: params.format,
          bracket: params.bracket,
          budget: params.budget,
          commander: commanderCards[0]?.name,
          deckCards: deckCardsForAgent?.length ? deckCardsForAgent : undefined,
          deckText: params.deckText,
          deckUrl: params.deckUrl,
          deckId: params.deckId,
          sessionId: sessionId ?? undefined,
          token,
          blueprint: params.blueprint,
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
            case "tool_result":
              if (event.tool === "validate_deck" && event.result) {
                setValidationResult(event.result as DeckValidationResult);
              }
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
              localStorage.setItem(SESSION_STORAGE_KEY, event.id);
              break;
            case "session_context":
              setSessionContext(event.context);
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
        setAiError((err as Error).message ?? "Something went wrong. Check that the API is deployed.");
      }
      setAiLoading(false);
    }
  }, [sessionId, commanderCards, cards]);

  const handleAddFromAi = useCallback(async (cardName: string) => {
    setAddedByAi((prev) => new Set(prev).add(cardName));
    try {
      const res = await fetch(`${API_URL}/v1/search?q=${encodeURIComponent(cardName)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        const exact = (data.cards ?? []).find(
          (c: SearchResult) => c.name.toLowerCase() === cardName.toLowerCase()
        );
        if (exact) {
          addCard(exact, "main");
          return;
        }
      }
    } catch {
      // fallback below
    }
    const syntheticResult = {
      variantId: `ai:${cardName.toLowerCase().replace(/\s+/g, "-")}`,
      cardId: "",
      name: cardName,
    };
    addCard(syntheticResult as SearchResult, "main");
  }, [addCard]);

  const removeCardByName = useCallback((cardName: string, board: "main" | "side" | "commander" = "main") => {
    setCards((prev) => {
      const idx = prev.findIndex((c) => c.board === board && c.name.toLowerCase() === cardName.toLowerCase());
      if (idx === -1) return prev;
      const next = [...prev];
      const item = next[idx];
      if (item.quantity > 1) {
        next[idx] = { ...item, quantity: item.quantity - 1 };
      } else {
        next.splice(idx, 1);
      }
      return next;
    });
  }, []);

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
    async (text: string, options?: { replace?: boolean }) => {
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
        return { resolved: 0, unresolved: [] as string[] };
      }

      try {
        const res = await fetch(`${API_URL}/v1/deck/import`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lines }),
        });

        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const data = await res.json();

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

        setCards((prev) => {
          const base = options?.replace ? [] : [...prev];
          for (const nc of newCards) {
            const existing = base.find(
              (c) => c.name.toLowerCase() === nc.name.toLowerCase() && c.board === nc.board
            );
            if (existing) {
              existing.quantity += nc.quantity;
            } else {
              base.push(nc);
            }
          }
          return base;
        });

        const result = {
          total: data.total,
          resolved: data.resolved,
          unresolved: data.unresolved,
          unresolvedNames,
        };
        setImportResult(result);
        return { resolved: data.resolved as number, unresolved: unresolvedNames };
      } catch (e: unknown) {
        setImportError(e instanceof Error ? e.message : "Import failed");
        return { resolved: 0, unresolved: [] as string[] };
      } finally {
        setImporting(false);
      }
    },
    []
  );

  const proposedCardNames = useMemo(() => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const tier of tierGroups) {
      for (const card of tier.cards) {
        const key = card.name.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          names.push(card.name);
        }
      }
    }
    return names;
  }, [tierGroups]);

  const applyFullDeckFromAi = useCallback(async () => {
    if (proposedCardNames.length === 0) return;
    const confirmed = window.confirm(
      `Replace the current deck with ${proposedCardNames.length} AI-proposed cards? This cannot be undone from here.`
    );
    if (!confirmed) return;

    setApplyingAll(true);
    setApplyResult(null);

    const commanderName = commanderCards[0]?.name ?? sessionContext?.commander ?? undefined;
    const lines: string[] = [];

    if (format === "commander" && commanderName) {
      lines.push("// Commander");
      lines.push(`1 ${commanderName}`);
    }

    for (const name of proposedCardNames) {
      if (commanderName && name.toLowerCase() === commanderName.toLowerCase()) continue;
      lines.push(`1 ${name}`);
    }

    const { resolved, unresolved } = await parseAndImport(lines.join("\n"), { replace: true });
    setApplyResult({ resolved, unresolved });
    setApplyingAll(false);

    if (resolved > 0) {
      setAddedByAi(new Set(proposedCardNames));
    }
  }, [proposedCardNames, commanderCards, sessionContext?.commander, format, parseAndImport]);

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
      className="group flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-surface-raised transition-colors"
      onMouseEnter={() => setHoveredCard(card.imageUri ?? null)}
      onMouseLeave={() => setHoveredCard(null)}
    >
      <span className="w-5 text-center text-xs font-bold text-text-muted tabular-nums shrink-0 select-none">
        {card.quantity}
      </span>
      <Link
        href={`/card/${encodeURIComponent(card.variantId)}`}
        className="flex-1 text-sm text-text-primary hover:text-tab-deck transition-colors truncate min-w-0"
      >
        {card.name}
      </Link>
      {card.manaCost && (
        <span className="text-[11px] text-text-muted/50 font-mono shrink-0 group-hover:text-text-muted transition-colors">
          {formatMana(card.manaCost)}
        </span>
      )}
      {card.priceUsd != null && (
        <span className="text-xs text-text-muted/50 tabular-nums shrink-0 group-hover:text-text-muted transition-colors w-14 text-right">
          ${(card.priceUsd * card.quantity).toFixed(2)}
        </span>
      )}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.preventDefault(); removeCard(card.variantId, board); }}
          className="w-5 h-5 flex items-center justify-center text-sm rounded text-text-muted hover:text-white hover:bg-red-500/50 transition-colors leading-none"
        >
          −
        </button>
        <button
          onClick={(e) => { e.preventDefault(); addCard(card as unknown as SearchResult); }}
          className="w-5 h-5 flex items-center justify-center text-sm rounded text-text-muted hover:text-white hover:bg-teal-500/50 transition-colors leading-none"
        >
          +
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      {/* ─── Sticky header ─────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-3">
          <input
            type="text"
            value={deckName}
            onChange={(e) => setDeckName(e.target.value)}
            className="text-lg font-bold bg-transparent text-text-primary outline-none hover:bg-surface-sunken focus:bg-surface-sunken rounded-lg px-2 py-1 transition-colors max-w-[220px]"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="rounded-lg border border-border bg-surface-sunken px-2.5 py-1 text-xs font-semibold text-text-secondary focus:outline-none focus:border-tab-deck"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </option>
            ))}
          </select>
          <div className="hidden sm:flex items-center gap-4 ml-2 text-sm text-text-muted">
            <span>
              <span className="font-bold tabular-nums text-text-primary">{deckStats.total}</span>
              {" "}cards
            </span>
            {deckStats.avgCmc != null && (
              <span>
                avg CMC{" "}
                <span className="font-bold tabular-nums text-text-primary">{deckStats.avgCmc.toFixed(2)}</span>
              </span>
            )}
            <span className="font-bold tabular-nums text-tab-deck">${totalValue.toFixed(2)}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button size="sm" onClick={() => setShowImportModal(true)}>Import</Button>
            <button
              onClick={handleExportText}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary border border-border hover:border-slate-500 hover:text-text-primary transition-colors bg-surface-sunken"
            >
              Copy List
            </button>
            <button
              onClick={handleExportMTGA}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-text-secondary border border-border hover:border-slate-500 hover:text-text-primary transition-colors bg-surface-sunken"
            >
              MTGA
            </button>
            {canUseAdvisor && (
              <>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button
                  onClick={() => handleOpenAdvisor("recs")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--success-text)] border border-success/40 hover:bg-success-light transition-colors"
                >
                  Suggest Cards
                </button>
                <button
                  onClick={() => handleOpenAdvisor("swaps")}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[var(--success-text)] border border-success/40 hover:bg-success-light transition-colors"
                >
                  Find Swaps
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main content ─────────────────────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-6 py-6 animate-fade-in">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">

          {/* ── Card list ── */}
          <div className="min-w-0">
            {commanderCards.length > 0 && (
              <div className="mb-5">
                <SectionHeader label="Commander" />
                <div className="space-y-0.5">
                  {commanderCards.map((card) => (
                    <CardRow key={`cmd-${card.variantId}`} card={card} board="commander" />
                  ))}
                </div>
              </div>
            )}

            {mainCards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-5 animate-slide-up">
                <p className="text-sm text-text-muted">Your deck is empty — add cards to get started.</p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex flex-col items-center gap-2 px-7 py-5 rounded-2xl border-2 border-dashed border-border hover:border-tab-deck hover:bg-surface-raised transition-all duration-200 group"
                  >
                    <span className="text-3xl opacity-40 group-hover:opacity-100 transition-opacity">↑</span>
                    <span className="text-sm font-semibold text-text-secondary group-hover:text-tab-deck transition-colors">Import Deck</span>
                    <span className="text-[10px] text-text-muted">Moxfield · Archidekt · paste list</span>
                  </button>
                  <button
                    onClick={() => setShowAiPanel(true)}
                    className="flex flex-col items-center gap-2 px-7 py-5 rounded-2xl border-2 border-dashed border-teal-600/30 hover:border-teal-500 hover:bg-teal-600/5 transition-all duration-200 group"
                  >
                    <span className="text-3xl opacity-40 group-hover:opacity-100 transition-opacity">✦</span>
                    <span className="text-sm font-semibold text-text-secondary group-hover:text-teal-400 transition-colors">Build with AI</span>
                    <span className="text-[10px] text-text-muted">Describe your deck concept</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {groupedMainCards.map((group) => (
                  <div key={group.name}>
                    <SectionHeader label={group.name} count={group.count} />
                    <div className="space-y-0.5">
                      {group.cards.map((card) => (
                        <CardRow key={card.variantId} card={card} board="main" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {sideCards.length > 0 && (
              <div className="mt-6">
                <SectionHeader label="Sideboard" count={sideCount} />
                <div className="space-y-0.5">
                  {sideCards.map((card) => (
                    <CardRow key={`side-${card.variantId}`} card={card} board="side" />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Search sidebar ── */}
          <div className="space-y-3 lg:sticky lg:top-[57px] lg:self-start">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a card…"
              className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-deck focus:outline-none transition-colors"
            />

            {hoveredCard && (
              <div className="animate-fade-in">
                <CardImage
                  src={hoveredCard}
                  alt="Card preview"
                  className="w-full rounded-xl"
                  wrapperClassName="w-full rounded-xl"
                  foil={false}
                />
              </div>
            )}

            {searching && (
              <p className="text-xs text-text-muted px-1">Searching…</p>
            )}

            {searchResults.length > 0 && (
              <div className="space-y-1">
                {searchResults.map((r) => (
                  <div
                    key={r.variantId}
                    className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2 hover:border-slate-600 transition-colors"
                    onMouseEnter={() => setHoveredCard(r.imageUri ?? null)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    {r.imageUri && (
                      <CardImage
                        src={r.imageUri}
                        alt={r.name}
                        className="h-9 w-auto rounded"
                        wrapperClassName="rounded shrink-0"
                        foil={false}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-text-primary truncate">{r.name}</p>
                      <p className="text-[10px] text-text-muted">
                        {r.setId?.toUpperCase()}
                        {r.priceUsd != null && r.priceUsd > 0 && ` · $${r.priceUsd.toFixed(2)}`}
                      </p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => addCard(r, "main")}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-tab-deck text-sm font-bold text-white hover:opacity-90 transition-opacity"
                      >
                        +
                      </button>
                      {format === "commander" && (
                        <button
                          onClick={() => addCard(r, "commander")}
                          className="w-7 h-7 flex items-center justify-center rounded-lg border border-amber-500/50 text-xs text-amber-400 hover:bg-amber-500/10 transition-colors"
                          title="Add as Commander"
                        >
                          ⚜
                        </button>
                      )}
                      <button
                        onClick={() => addCard(r, "side")}
                        className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-xs text-text-muted hover:text-text-secondary hover:border-slate-500 transition-colors"
                        title="Add to sideboard"
                      >
                        S
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!searchQuery && searchResults.length === 0 && !searching && (
              <div className="rounded-xl border border-border/60 bg-surface-sunken/40 p-4 text-center">
                <p className="text-xs text-text-muted mb-2.5">Quick search</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {["Sol Ring", "Lightning Bolt", "Brainstorm"].map((name) => (
                    <button
                      key={name}
                      onClick={() => setSearchQuery(name)}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-surface border border-border text-text-muted hover:text-text-primary hover:border-slate-500 transition-colors"
                    >
                      {name}
                    </button>
                  ))}
                </div>
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
        <div className="fixed inset-y-0 right-0 w-[440px] z-40 flex flex-col bg-slate-950/95 border-l border-teal-900/35 shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="relative flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal-400/50 to-transparent" />
            <div>
              <h2 className="font-bold text-slate-100 text-sm tracking-tight">Deck Intelligence</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Build, tune, and pilot with AI</p>
            </div>
            <button onClick={() => setShowAiPanel(false)} className="text-slate-400 hover:text-slate-200 text-lg leading-none">✕</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6 bg-[radial-gradient(circle_at_top_right,rgba(45,212,191,0.12),transparent_35%)]">
            <InputPanel
              key={sessionId ?? "new-session"}
              format={format as "commander" | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper"}
              savedDecks={savedDecks}
              initialValues={
                sessionContext
                  ? {
                      bracket: sessionContext.bracket,
                      budget: sessionContext.budget,
                      blueprint: sessionContext.blueprint ?? undefined,
                    }
                  : undefined
              }
              onSubmit={runAi}
              loading={aiLoading}
            />

            {escalateMessage && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-sm">
                {escalateMessage.replace("ESCALATE — ", "")}
              </div>
            )}

            {aiError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {aiError}
              </div>
            )}

            <StatusPills tools={toolStates} statusMessage={statusMessage} />

            {validationResult && <ValidationPanel result={validationResult} />}

            {applyResult && (
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs text-teal-200">
                Applied {applyResult.resolved} cards to the editor.
                {applyResult.unresolved.length > 0 && (
                  <span className="block mt-1 text-teal-200/70">
                    Unresolved: {applyResult.unresolved.slice(0, 5).join(", ")}
                    {applyResult.unresolved.length > 5 ? "…" : ""}
                  </span>
                )}
              </div>
            )}

            {aiMode === "upgrade" && aiSwaps.length > 0 && (
              <UpgradeDiff
                swaps={aiSwaps}
                onAccept={(swap) => {
                  removeCardByName(swap.cut.name, "main");
                  void handleAddFromAi(swap.add.name);
                }}
                onReject={() => {}}
              />
            )}

            {aiMode !== "upgrade" && tierGroups.length > 0 && (
              <CardGallery
                tiers={tierGroups}
                cardDetails={cardDetails}
                onAddCard={(cardName) => void handleAddFromAi(cardName)}
                onApplyAll={aiMode === "build" ? () => void applyFullDeckFromAi() : undefined}
                applyingAll={applyingAll}
                addedCards={addedByAi}
                totalCards={proposedCardNames.length}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { API_BASE_URL } from "./constants";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error?: string }).error ?? "Request failed"), {
      status: res.status,
    });
  }

  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ScanCandidate {
  variantId: string;
  cardId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  imageUri: string | null;
  manaCost: string | null;
  typeLine: string | null;
  rarity: string | null;
  score: number;
  matchType: string;
  prices: Array<{ market: string; kind: string; currency: string; amount: number }>;
  /** Matched on the phone; prices are still on their way. */
  pricing?: boolean;
}

export interface CollectionEntry {
  variantId: string;
  name: string;
  imageUri: string | null;
  quantity: number;
  priceUsd: number | null;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

// ── Card detail ──────────────────────────────────────────────────────────────

export interface CardDetail {
  variantId: string;
  name: string;
  game: string;
  setId: string | null;
  collectorNumber: string | null;
  imageUri: string | null;
  manaCost: string | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string[] | null;
  colorIdentity: string[] | null;
  cmc: number | null;
  rarity: string | null;
  storePricing: StorePricing[];
}

interface StorePricing {
  store: string;
  prices: Array<{ label: string; amount: number; currency: string }>;
  buyUrl: string | null;
}

export async function getCardDetail(
  variantId: string
): Promise<{ card: CardDetail }> {
  const response = await request<{
    card: Omit<CardDetail, "storePricing">;
    storePricing: StorePricing[];
  }>("GET", `/v1/cards/${encodeURIComponent(variantId)}`);
  return {
    card: {
      ...response.card,
      storePricing: response.storePricing,
    },
  };
}

export async function scanIdentify(params: {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  manaCost?: string;
}): Promise<{ candidates: ScanCandidate[]; printings?: ScanCandidate[] }> {
  return request("POST", "/v1/scan/identify", { ...params, limit: 5 });
}

export async function addCollectionEvents(
  events: Array<{
    id: string;
    at: string;
    type: "add";
    variantId: string;
    payload: {
      quantity: number;
      finish?: "nonfoil" | "foil" | "etched";
    };
  }>
): Promise<{ ok: boolean; inserted: number }> {
  return request("POST", "/v1/collection/events", { events });
}

export async function getCollection(userId: string): Promise<{
  userId: string;
  events: Array<{ id: string; at: string; type: string; variantId: string; payload: unknown }>;
}> {
  return request("GET", `/v1/collection/${userId}`);
}

export interface OwnedCard {
  holdingId: string;
  variantId: string;
  finish: "nonfoil" | "foil" | "etched";
  name: string;
  imageUri: string | null;
  setId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  typeLine: string | null;
  manaCost: string | null;
  quantity: number;
  priceUsd: number | null;
  lineValue: number | null;
  /** Price change over the last week, in percent; null without enough history. */
  changePct?: number | null;
  addedAt: string | null;
}

export type CollectionSort = "value" | "price" | "change" | "type" | "rarity" | "added" | "name" | "qty";

export async function getCollectionCards(params?: {
  q?: string;
  sort?: CollectionSort;
  dir?: "asc" | "desc";
  page?: number;
  limit?: number;
}): Promise<{
  cards: OwnedCard[];
  totalCards: number;
  totalValue: number;
  page: number;
  hasMore: boolean;
}> {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {}).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return request("GET", `/v1/collection/cards${qs ? `?${qs}` : ""}`);
}

export async function getProfile(): Promise<{
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  minorSafe: boolean;
  createdAt: string;
}> {
  return request("GET", "/v1/profile");
}

export async function updateProfile(data: { displayName?: string | null; avatarUrl?: string | null }): Promise<{ avatarUrl: string | null; displayName: string | null }> {
  return request("PUT", "/v1/profile", data);
}

export interface SearchFilters {
  /** Card colors, e.g. "WU", or "C" for colorless. */
  colors?: string;
  type?: string;
  rarity?: string[];
  minPrice?: number;
  maxPrice?: number;
  sort?: "name-asc" | "price-asc" | "price-desc" | "popular" | "rarity";
}

export async function searchCards(q: string, limit = 30, filters: SearchFilters = {}): Promise<{
  cards: Array<{
    variantId: string;
    name: string;
    imageUri: string | null;
    rarity: string | null;
    setId: string | null;
    collectorNumber: string | null;
    priceUsd: number | null;
    typeLine: string | null;
    manaCost: string | null;
  }>;
}> {
  const params = new URLSearchParams({ q, limit: String(limit) });
  if (filters.colors) params.set("colors", filters.colors);
  if (filters.type) params.set("type", filters.type);
  if (filters.rarity?.length) params.set("rarity", filters.rarity.join(","));
  if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.sort) params.set("sort", filters.sort);
  return request("GET", `/v1/search?${params}`);
}

/** US dollar exchange rates for the display currency. */
export async function getFxRates(): Promise<{ rates: Record<"USD" | "EUR" | "GBP" | "CAD" | "AUD", number>; asOf: string | null }> {
  return request("GET", "/v1/fx");
}

/** Deletes the account and everything in it. */
export async function deleteAccount(): Promise<{ ok: boolean }> {
  return request("DELETE", "/v1/me");
}

export async function registerPushToken(token: string, platform: "ios" | "android"): Promise<{ ok: boolean }> {
  return request("POST", "/v1/push-token", { token, platform });
}

export async function unregisterPushToken(token: string): Promise<{ ok: boolean }> {
  return request("DELETE", "/v1/push-token", { token });
}

/** Sends a test notification to this account's phones. */
export async function sendTestPush(): Promise<{ ok: boolean; sent: number }> {
  return request("POST", "/v1/push-test");
}

// ── Decks ────────────────────────────────────────────────────────────────────

export interface Deck {
  id: string;
  name: string;
  format: string;
  game: string;
  commander: string | null;
  partner?: string | null;
  description: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { cards: number };
}

export interface DeckCard {
  id: string;
  cardName: string;
  variantId: string | null;
  quantity: number;
  section: string;
  price?: number | null;
  variant?: {
    name: string;
    imageUri: string | null;
    manaCost: string | null;
    typeLine: string | null;
    rarity: string | null;
    cmc: number | null;
    colors?: string[] | null;
    colorIdentity?: string[] | null;
    oracleText?: string | null;
  } | null;
}

export async function listDecks(params?: { format?: string; game?: string }): Promise<{ decks: Deck[] }> {
  const qs = new URLSearchParams(params as Record<string, string>).toString();
  return request("GET", `/v1/decks${qs ? `?${qs}` : ""}`);
}

export async function getDeck(id: string): Promise<{
  deck: Deck & { cards: DeckCard[] };
  totalValue: number;
  legality: { valid: boolean; issues: string[] };
}> {
  return request("GET", `/v1/decks/${id}`);
}

export async function createDeck(data: {
  name: string;
  format?: string;
  commander?: string;
  description?: string;
}): Promise<{ ok: boolean; deck: Deck }> {
  return request("POST", "/v1/decks", data);
}

export async function updateDeck(id: string, data: Partial<Deck>): Promise<{ ok: boolean; deck: Deck }> {
  return request("PUT", `/v1/decks/${id}`, data);
}

export async function deleteDeck(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/v1/decks/${id}`);
}

export async function toggleDeckVisibility(id: string, isPublic: boolean): Promise<{ ok: boolean; isPublic: boolean }> {
  return request("PATCH", `/v1/decks/${id}/visibility`, { isPublic });
}

export async function importDeckText(
  id: string,
  text: string,
  replace = true
): Promise<{ ok: boolean; imported: number; resolved: number; legality: { valid: boolean; issues: string[] } }> {
  return request("POST", `/v1/decks/${id}/import`, { text, replace });
}

/** Pull a deck from Moxfield, Archidekt or MTGGoldfish: a new deck, or the cards of deckId replaced. */
export async function importDeckFromUrl(params: { url: string; deckId?: string }): Promise<{
  ok: boolean;
  deck: Deck;
  source: "moxfield" | "archidekt" | "mtggoldfish";
  imported: number;
  unresolved: string[];
  legality: { valid: boolean; issues: string[] };
}> {
  return request("POST", "/v1/decks/import-url", params);
}

/** True for links the deck importer understands. */
export function isDeckUrl(text: string): boolean {
  return /^https?:\/\/(www\.)?(moxfield\.com\/decks\/|archidekt\.com\/decks\/|mtggoldfish\.com\/deck\/)/i.test(text.trim());
}

export async function updateDeckCards(
  id: string,
  cards: Array<{ cardName: string; variantId?: string; quantity: number; section: string }>
): Promise<{ ok: boolean; cardCount: number; legality: { valid: boolean; issues: string[] } }> {
  return request("PUT", `/v1/decks/${id}/cards`, { cards });
}

export async function getDeckEdhrec(id: string): Promise<{
  commander: string;
  num_decks: number;
  avg_price: number;
  themes: string[];
  recommendations: Array<{
    name: string;
    synergy: number;
    inclusion: number;
    primary_type: string;
    cmc: number;
    image: string | null;
    price_usd: number | null;
    alreadyInDeck: boolean;
  }>;
}> {
  return request("GET", `/v1/decks/${id}/edhrec`);
}

export async function getAiAdvice(params: {
  deckId?: string;
  commander?: string;
  question?: string;
}): Promise<{ advice: string }> {
  return request("POST", "/v1/ai/deck-advice", params);
}

export async function getCollectionValue(): Promise<{
  totalValue: number;
  currency: string;
  cardCount: number;
  breakdown: Array<{ variantId: string; qty: number; price: number; lineValue: number }>;
}> {
  return request("GET", "/v1/collection/value");
}

// ── Shops ────────────────────────────────────────────────────────────────────

export interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  category: string;
  verified: boolean;
  distance: number | null;
}

export async function getNearbyShops(params: {
  lat?: number;
  lng?: number;
  radius?: number;
  city?: string;
}): Promise<{ shops: Shop[] }> {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
  ).toString();
  return request("GET", `/v1/shops?${qs}`);
}

// ── Watchlist ─────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  id: string;
  variantId: string;
  cardName: string;
  imageUri: string | null;
  market: string;
  kind: string;
  currency: string;
  thresholdAmount: number;
  direction: "above" | "below";
  enabled: boolean;
  currentPrice: number | null;
  createdAt: string;
}

export async function getWatchlist(): Promise<{ entries: WatchlistEntry[] }> {
  return request("GET", "/v1/watchlist");
}

export async function addWatchlistEntry(data: {
  variantId: string;
  market: string;
  kind?: string;
  currency?: string;
  thresholdAmount: number;
  direction: "above" | "below";
}): Promise<{ ok: boolean }> {
  return request("POST", "/v1/watchlist", data);
}

export async function deleteWatchlistEntry(id: string): Promise<{ ok: boolean }> {
  return request("DELETE", `/v1/watchlist/${id}`);
}

export async function toggleWatchlistEntry(id: string, enabled: boolean): Promise<{ ok: boolean }> {
  return request("PATCH", `/v1/watchlist/${id}`, { enabled });
}

// ── Market ───────────────────────────────────────────────────────────────────

export interface MarketCard {
  variantId: string;
  name: string;
  setId: string | null;
  collectorNumber: string | null;
  rarity: string | null;
  imageUri: string | null;
  priceUsd: number | null;
  bestUsd: number | null;
  bestMarket: string | null;
  sparkline: number[];
  deltaPct: number | null;
  previousUsd: number | null;
}

export async function getMarketHome(): Promise<{
  generatedAt: string;
  movers: MarketCard[];
  newCards: MarketCard[];
  popular: MarketCard[];
}> {
  return request("GET", "/v1/market/home");
}

export async function getPriceHistory(
  variantId: string,
  days = 30,
  market = "tcgplayer"
): Promise<{ points: Array<{ at: string; kind: string; value: { amount: number; currency: string } }> }> {
  return request("GET", `/v1/prices/history/${encodeURIComponent(variantId)}?days=${days}&market=${market}`);
}

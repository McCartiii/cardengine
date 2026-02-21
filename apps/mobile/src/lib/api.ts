import { API_BASE_URL } from "./constants";

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
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
}

export interface CollectionEntry {
  variantId: string;
  name: string;
  imageUri: string | null;
  quantity: number;
  priceUsd: number | null;
}

// ── Endpoints ────────────────────────────────────────────────────────────────

export async function scanIdentify(params: {
  name: string;
  setCode?: string;
  collectorNumber?: string;
  manaCost?: string;
}): Promise<{ candidates: ScanCandidate[] }> {
  return request("POST", "/v1/scan/identify", { ...params, limit: 5 });
}

export async function addCollectionEvents(
  events: Array<{
    id: string;
    at: string;
    type: "add";
    variantId: string;
    payload: { quantity: number };
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

export async function getProfile(): Promise<{
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  minorSafe: boolean;
  createdAt: string;
}> {
  return request("GET", "/v1/profile");
}

export async function searchCards(q: string, limit = 30): Promise<{
  cards: Array<{
    variantId: string;
    name: string;
    imageUri: string | null;
    rarity: string | null;
    priceUsd: number | null;
    typeLine: string | null;
    manaCost: string | null;
  }>;
}> {
  return request("GET", `/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

// ── Decks ────────────────────────────────────────────────────────────────────

export interface Deck {
  id: string;
  name: string;
  format: string;
  game: string;
  commander: string | null;
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

export async function importDeckText(
  id: string,
  text: string,
  replace = true
): Promise<{ ok: boolean; imported: number; resolved: number; legality: { valid: boolean; issues: string[] } }> {
  return request("POST", `/v1/decks/${id}/import`, { text, replace });
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

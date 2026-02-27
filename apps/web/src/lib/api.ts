const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

let _token: string | null = null;
export function setToken(t: string | null) { _token = t; }
export function getToken() { return _token; }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (_token) headers["Authorization"] = `Bearer ${_token}`;
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error((err as { error?: string }).error ?? "Request failed"), { status: res.status });
  }
  return res.json() as Promise<T>;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface CardVariant {
  variantId: string;
  name: string;
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
  priceUsd?: number | null;
}

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
}

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

export interface Shop {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  website: string | null;
  hours: string | null;
  verified: boolean;
  distance: number | null;
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

export const api = {
  search: (q: string, limit = 40) =>
    request<{ cards: CardVariant[] }>("GET", `/v1/search?q=${encodeURIComponent(q)}&limit=${limit}`),

  card: (variantId: string) =>
    request<{ card: CardVariant & { storePricing: unknown[] } }>("GET", `/v1/cards/${encodeURIComponent(variantId)}`),

  decks: {
    list: (params?: { format?: string }) =>
      request<{ decks: Deck[] }>("GET", `/v1/decks${params?.format ? `?format=${params.format}` : ""}`),
    get: (id: string) =>
      request<{ deck: Deck & { cards: DeckCard[] }; totalValue: number; legality: { valid: boolean; issues: string[] } }>("GET", `/v1/decks/${id}`),
    create: (data: { name: string; format?: string; commander?: string; description?: string }) =>
      request<{ ok: boolean; deck: Deck }>("POST", "/v1/decks", data),
    update: (id: string, data: Partial<Deck>) =>
      request<{ ok: boolean; deck: Deck }>("PUT", `/v1/decks/${id}`, data),
    delete: (id: string) =>
      request<{ ok: boolean }>("DELETE", `/v1/decks/${id}`),
    importText: (id: string, text: string, replace = true) =>
      request<{ ok: boolean; imported: number; resolved?: number; legality: { valid: boolean; issues: string[] } }>("POST", `/v1/decks/${id}/import`, { text, replace }),
    edhrec: (id: string) =>
      request<{ commander: string; recommendations: unknown[] }>("GET", `/v1/decks/${id}/edhrec`),
    aiAdvice: (deckId: string, question?: string) =>
      request<{ advice: string }>("POST", "/v1/ai/deck-advice", { deckId, question }),
  },

  collection: {
    value: () =>
      request<{ totalValue: number; currency: string; cardCount: number; breakdown: unknown[] }>("GET", "/v1/collection/value"),
  },

  watchlist: {
    list: () => request<{ entries: WatchlistEntry[] }>("GET", "/v1/watchlist"),
    add: (data: { variantId: string; market: string; thresholdAmount: number; direction: "above" | "below" }) =>
      request<{ ok: boolean }>("POST", "/v1/watchlist", data),
    delete: (id: string) => request<{ ok: boolean }>("DELETE", `/v1/watchlist/${id}`),
    toggle: (id: string, enabled: boolean) => request<{ ok: boolean }>("PATCH", `/v1/watchlist/${id}`, { enabled }),
  },

  shops: {
    nearby: (params: { lat?: number; lng?: number; radius?: number; city?: string }) => {
      const qs = new URLSearchParams(
        Object.fromEntries(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))
      ).toString();
      return request<{ shops: Shop[] }>("GET", `/v1/shops?${qs}`);
    },
  },

  profile: {
    get: () => request<{ id: string; displayName: string | null; avatarUrl: string | null; createdAt: string }>("GET", "/v1/profile"),
    update: (data: { displayName?: string }) => request<{ ok: boolean }>("PUT", "/v1/profile", data),
  },
};

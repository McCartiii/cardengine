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

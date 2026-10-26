// Server-sent events over POST, for the AI endpoints. React Native's own
// fetch can't read a response as it arrives; expo/fetch can.
import { fetch as streamingFetch } from "expo/fetch";
import { API_BASE_URL } from "./constants";
import { authReady, getAuthToken } from "./api";

export type SseEvent = Record<string, unknown> & { type?: string };

/**
 * POSTs `body` to `path` and calls `onEvent` for each `data:` line until the
 * server sends [DONE]. Throws with the server's error message on a bad status.
 */
export async function postSse(path: string, body: unknown, onEvent: (e: SseEvent) => void, signal?: AbortSignal): Promise<void> {
  await authReady();
  const token = getAuthToken();
  const res = await streamingFetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok || !res.body) {
    const err = (await res.json().catch(() => null)) as { error?: string } | null;
    const message =
      res.status === 401 ? "Sign in to use AI." : res.status === 429 ? err?.error ?? "Too many requests. Try again in a minute." : err?.error ?? `Request failed (${res.status})`;
    throw Object.assign(new Error(message), { status: res.status });
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        onEvent(JSON.parse(data) as SseEvent);
      } catch {
        // Skip a malformed line.
      }
    }
  }
}

// Sends phone notifications through Expo's push service and forgets tokens
// for phones that uninstalled the app or turned notifications off.
import { prisma } from "../db.js";

export interface PushMessage {
  to: string;
  title?: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
}

interface Ticket {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH = 100;

export const isExpoToken = (token: string) => /^Expo(nent)?PushToken\[.+\]$/.test(token);

/** Sends messages in batches. Returns the tokens Expo says are dead (already removed). */
export async function sendPush(messages: PushMessage[], fetchImpl: typeof fetch = fetch): Promise<{ sent: number; dead: string[] }> {
  const valid = messages.filter((m) => isExpoToken(m.to));
  const dead: string[] = [];
  let sent = 0;
  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      if (!res.ok) {
        console.warn(`[push] HTTP ${res.status}: ${await res.text()}`);
        continue;
      }
      const { data } = (await res.json()) as { data?: Ticket[] };
      (data ?? []).forEach((t, j) => {
        if (t.status === "ok") sent++;
        else if (t.details?.error === "DeviceNotRegistered") dead.push(batch[j].to);
        else console.warn(`[push] ${t.details?.error ?? "error"}: ${t.message ?? ""}`);
      });
    } catch (err) {
      console.warn("[push] Failed to send batch:", err);
    }
  }
  if (dead.length) await prisma.pushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
  return { sent, dead };
}

/** Sends one notification to every phone a user has signed in on. */
export async function pushToUser(userId: string, message: Omit<PushMessage, "to">, fetchImpl?: typeof fetch) {
  const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
  return sendPush(
    tokens.map(({ token }) => ({ sound: "default" as const, ...message, to: token })),
    fetchImpl
  );
}

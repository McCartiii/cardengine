import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ prisma: { pushToken: { deleteMany: vi.fn(async () => ({ count: 1 })), findMany: vi.fn() } } }));

const { sendPush, isExpoToken } = await import("./push.js");
const { prisma } = await import("../db.js");

describe("sendPush", () => {
  it("skips non-Expo tokens, counts sends and forgets dead phones", async () => {
    const f = vi.fn(async (_url: string, init: RequestInit) => {
      const batch = JSON.parse(String(init.body)) as unknown[];
      expect(batch).toHaveLength(2);
      return new Response(JSON.stringify({ data: [{ status: "ok" }, { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }] }));
    }) as unknown as typeof fetch;
    const r = await sendPush(
      [
        { to: "ExponentPushToken[a]", body: "hi" },
        { to: "ExpoPushToken[b]", body: "hi" },
        { to: "not-a-token", body: "hi" },
      ],
      f
    );
    expect(r).toEqual({ sent: 1, dead: ["ExpoPushToken[b]"] });
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { token: { in: ["ExpoPushToken[b]"] } } });
  });

  it("survives the push service being down", async () => {
    const f = vi.fn(async () => new Response("down", { status: 503 })) as unknown as typeof fetch;
    expect(await sendPush([{ to: "ExponentPushToken[a]", body: "x" }], f)).toEqual({ sent: 0, dead: [] });
  });

  it("recognizes Expo tokens", () => {
    expect(isExpoToken("ExponentPushToken[xyz]")).toBe(true);
    expect(isExpoToken("ExpoPushToken[xyz]")).toBe(true);
    expect(isExpoToken("fcm:abc")).toBe(false);
  });
});

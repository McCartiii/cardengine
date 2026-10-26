// Price-alert notifications on this phone: asking permission at a moment that
// makes sense (not on first launch), registering the token with the API, and
// opening the right screen when one is tapped.
import { Alert, Linking, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { registerPushToken, unregisterPushToken } from "./api";
import { useSettings } from "../store/settingsStore";

export type PushResult = { ok: true } | { ok: false; reason: "denied" | "unavailable" | "error"; message: string };

const supported = Platform.OS === "ios" || Platform.OS === "android";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ?? Constants.easConfig?.projectId;
}

/** Whether this phone has notifications allowed for the app. */
export async function pushPermission(): Promise<"granted" | "denied" | "undetermined" | "unavailable"> {
  if (!supported || !Device.isDevice) return "unavailable";
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

async function register(): Promise<PushResult> {
  if (!supported || !Device.isDevice) {
    return { ok: false, reason: "unavailable", message: "Notifications need a real phone (not a simulator or the web)." };
  }
  const id = projectId();
  if (!id) {
    return { ok: false, reason: "unavailable", message: "This build isn't set up for notifications yet (missing EAS project ID)." };
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("price-alerts", {
      name: "Price alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#7C5CFF",
    });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: id });
  await registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
  useSettings.getState().setPush(true, token);
  return { ok: true };
}

/** Asks for permission if needed, then signs this phone up for price alerts. */
export async function enablePush(): Promise<PushResult> {
  try {
    let status = await pushPermission();
    if (status === "unavailable") return register();
    if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== "granted") {
      useSettings.getState().setPush(false);
      return { ok: false, reason: "denied", message: "Notifications are off for CardEngine in your phone's settings." };
    }
    return await register();
  } catch (e) {
    return { ok: false, reason: "error", message: (e as Error).message || "Couldn't turn on notifications." };
  }
}

/** Stops price alerts on this phone. */
export async function disablePush() {
  const token = useSettings.getState().pushToken;
  useSettings.getState().setPush(false, null);
  if (token) await unregisterPushToken(token).catch(() => {});
}

/** Takes this phone's token off the account (sign-out) but keeps the preference. */
export async function forgetPushToken() {
  const token = useSettings.getState().pushToken;
  if (!token) return;
  useSettings.setState({ pushToken: null });
  await unregisterPushToken(token).catch(() => {});
}

/** On launch: re-register (tokens can change) if alerts are on and still allowed. */
export async function refreshPush() {
  if (useSettings.getState().pushAlerts !== true) return;
  const status = await pushPermission().catch(() => "unavailable" as const);
  if (status === "granted") await register().catch(() => {});
  else if (status === "denied") useSettings.getState().setPush(false);
}

/** After someone sets their first alert: offer notifications once. */
export function offerPushForAlerts() {
  if (useSettings.getState().pushAlerts !== null || !supported) return;
  Alert.alert("Get a notification when it hits?", "We'll let you know the moment a card reaches your price.", [
    { text: "Not now", style: "cancel", onPress: () => useSettings.getState().setPush(false) },
    {
      text: "Turn on",
      onPress: async () => {
        const r = await enablePush();
        if (!r.ok && r.reason === "denied") showDenied();
      },
    },
  ]);
}

/** Notifications were refused at the system level; only Settings can undo that. */
export function showDenied() {
  Alert.alert("Notifications are off", "Turn on notifications for CardEngine in your phone's Settings.", [
    { text: "Not now", style: "cancel" },
    { text: "Open Settings", onPress: () => Linking.openSettings() },
  ]);
}

/** Where a tapped notification should go. */
export function routeFor(data: Record<string, unknown> | undefined): { pathname: string; params?: Record<string, string> } | null {
  if (!data) return null;
  if (data.screen === "card" && typeof data.variantId === "string") return { pathname: "/card/[id]", params: { id: data.variantId } };
  if (data.screen === "alerts") return { pathname: "/alerts" };
  return null;
}

/**
 * Registers the device for Expo push notifications and syncs the token with
 * the CardEngine API. Also sets up a foreground notification listener.
 *
 * Requires: npx expo install expo-notifications expo-device
 *
 * Usage: call usePushNotifications() inside the authenticated tabs layout.
 */
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

// Lazy imports so the app doesn't crash if the package isn't installed yet
let Notifications: typeof import("expo-notifications") | null = null;
let Device: typeof import("expo-device") | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require("expo-notifications");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Device = require("expo-device");
} catch {
  // expo-notifications not installed — push won't work but app won't crash
}

import { useAuthStore } from "../store/authStore";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

async function registerToken(accessToken: string) {
  if (!Notifications || !Device) return;

  // Must be a physical device
  if (!Device.isDevice) return;

  // Ask for permission
  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  // Android notification channel
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#7C3AED",
    });
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const platform = Platform.OS === "ios" ? "ios" : "android";

  await fetch(`${API_BASE}/v1/push-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ token: tokenData.data, platform }),
  });
}

export function usePushNotifications() {
  const { session } = useAuthStore();
  const registered = useRef(false);
  const listenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!session?.access_token || registered.current) return;
    registered.current = true;

    registerToken(session.access_token).catch(console.warn);

    // Show notification when app is foregrounded
    if (Notifications) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });

      listenerRef.current = Notifications.addNotificationReceivedListener((notification) => {
        console.log("[push] Received:", notification.request.content.title);
      });
    }

    return () => {
      listenerRef.current?.remove();
      registered.current = false;
    };
  }, [session?.access_token]);
}

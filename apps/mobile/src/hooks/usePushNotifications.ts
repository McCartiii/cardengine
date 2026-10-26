// Keeps this phone's push registration fresh once signed in, and opens the
// card (or alerts list) when a notification is tapped, including one that
// launched the app.
import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import { useAuthStore } from "../store/authStore";
import { refreshPush, routeFor } from "../lib/push";

// A launch notification is still "last" after the app is running; open it once.
const opened = new Set<string>();

export function usePushNotifications() {
  const signedIn = useAuthStore((s) => !!s.session);

  useEffect(() => {
    if (signedIn) refreshPush();
  }, [signedIn]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const open = (response: Notifications.NotificationResponse | null) => {
      if (!response || opened.has(response.notification.request.identifier)) return;
      opened.add(response.notification.request.identifier);
      const to = routeFor(response?.notification.request.content.data as Record<string, unknown> | undefined);
      if (to) router.push(to as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}

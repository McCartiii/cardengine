import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useAuthStore } from "../src/store/authStore";
import { initOfflineDB, startSyncLoop } from "../src/lib/offlineQueue";
import { addCollectionEvents } from "../src/lib/api";
import { downloadCardBundle, downloadHashBundle } from "../src/lib/sync";
import { ensureHashIndexReady } from "../src/scanner/hashIndexManager";

const allowUnauthTabs = process.env.EXPO_PUBLIC_ALLOW_UNAUTH_TABS === "true";

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { session, initialized } = useAuthStore();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !inAuthGroup) {
      if (allowUnauthTabs) {
        // Temporary dev override for auth flows during testing.
        return;
      }
      // Not signed in — redirect to sign-in by default.
      router.replace("/(auth)/sign-in");
    } else if (session && inAuthGroup) {
      // Signed in — redirect away from auth screens
      router.replace("/(tabs)");
    }
  }, [session, initialized, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const { initialize, session } = useAuthStore();

  // Init SQLite once
  useEffect(() => { initOfflineDB(); }, []);

  // Background: card + hash bundles for offline scan
  useEffect(() => {
    downloadCardBundle().catch((e) => console.warn("[boot] Card bundle:", e));
    downloadHashBundle()
      .then(() => ensureHashIndexReady())
      .catch((e) => console.warn("[boot] Hash bundle:", e));
  }, []);

  // Start sync loop when authenticated
  useEffect(() => {
    if (!session) return;
    const stop = startSyncLoop((events) =>
      addCollectionEvents(
        events.map((e) => ({
          id: e.id,
          at: e.at,
          type: "add" as const,
          variantId: e.variantId,
          payload: { quantity: (e.payload as { quantity: number }).quantity },
        }))
      )
    );
    return stop;
  }, [!!session]);

  useEffect(() => {
    const unsub = initialize();
    return unsub;
  }, [initialize]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthGate>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(deck)" />
          <Stack.Screen name="(card)" />
        </Stack>
      </AuthGate>
    </SafeAreaProvider>
  );
}

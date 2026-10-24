import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useAuthStore } from "../src/store/authStore";
import { initOfflineDB, startSyncLoop } from "../src/lib/offlineQueue";
import { loadCardMatcher } from "../src/lib/scanIndex";
import { addCollectionEvents } from "../src/lib/api";
import { useFonts } from "expo-font";
import { color } from "../src/design/tokens";
import { FONT_ASSETS } from "../src/design/fonts";

const pushedHeader = {
  headerShown: true,
  headerStyle: { backgroundColor: color.bg },
  headerTintColor: color.text,
  headerShadowVisible: false,
  headerBackButtonDisplayMode: "minimal" as const,
  headerTitleStyle: { fontWeight: "700" as const },
};

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { session, initialized, guest } = useAuthStore();

  useEffect(() => {
    if (!initialized) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!session && !guest && !inAuthGroup) {
      // Not signed in — redirect to sign-in
      router.replace("/(auth)/sign-in");
    } else if (session && inAuthGroup) {
      // Signed in — redirect away from auth screens
      router.replace("/(tabs)");
    }
  }, [session, guest, initialized, segments]);

  return <>{children}</>;
}

export default function RootLayout() {
  const { initialize, session } = useAuthStore();
  // Fall through on error so a missing font never blocks the app.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  // Init SQLite once, and get the scan index ready before the first scan.
  useEffect(() => {
    initOfflineDB();
    void loadCardMatcher();
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

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthGate>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="deck/[id]" options={pushedHeader} />
            <Stack.Screen name="card/[id]" />
            <Stack.Screen name="profile" />
            <Stack.Screen name="life" options={{ presentation: "fullScreenModal" }} />
            <Stack.Screen name="shops" options={{ ...pushedHeader, title: "Local shops" }} />
            <Stack.Screen name="alerts" options={{ ...pushedHeader, title: "Price alerts" }} />
          </Stack>
        </AuthGate>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

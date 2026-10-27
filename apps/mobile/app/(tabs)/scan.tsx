import React from "react";
import { Platform, StyleSheet } from "react-native";
import { isRunningInExpoGo } from "expo";
import { useRouter } from "expo-router";
import { EmptyState, IconButton, Screen } from "@/ui";

// VisionCamera and its frame-processor plugins aren't in Expo Go (or on web) and
// throw as soon as they're imported, so only load the scanner in a dev/store build.
const CameraScanner: React.ComponentType | null =
  isRunningInExpoGo() || Platform.OS === "web"
    ? null
    : require("@/components/scan/CameraScanner").default;

export default function ScanScreen() {
  const router = useRouter();
  if (CameraScanner) return <CameraScanner />;

  // The tab bar hides on this tab, so keep a way out.
  const close = () => router.navigate("/(tabs)");
  return (
    <Screen>
      <IconButton icon="close" label="Close scanner" onPress={close} style={styles.closeStandalone} />
      <EmptyState
        icon="scan-outline"
        title="Scanning needs the full app"
        body="The scanner uses a camera module that Expo Go doesn't include. Everything else works here; install a development build to scan cards."
        action="Back to Home"
        onAction={close}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  closeStandalone: { marginLeft: 16, marginTop: 8 },
});

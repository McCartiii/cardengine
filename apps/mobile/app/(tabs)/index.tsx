import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { isRunningInExpoGo } from "expo";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "@/lib/constants";

// VisionCamera and its OCR plugin aren't in Expo Go (or on web) and throw as soon
// as they're imported, so only load the camera scanner in a dev/store build.
const CameraScanner: React.ComponentType | null =
  isRunningInExpoGo() || Platform.OS === "web"
    ? null
    : require("@/components/scan/CameraScanner").default;

export default function ScanScreen() {
  if (CameraScanner) return <CameraScanner />;

  return (
    <View style={styles.centered}>
      <Ionicons name="scan" size={40} color={COLORS.textMuted} />
      <Text style={styles.title}>Scanning needs the full app</Text>
      <Text style={styles.body}>
        The card scanner uses a camera module that Expo Go doesn't include.
        Everything else works here; install a development build to scan cards.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  title: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    color: COLORS.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
});

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, Platform } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { useCardScanner } from "@/hooks/useCardScanner";
import { ScanOverlay } from "@/components/ScanOverlay";
import { ScannedCardTray } from "@/components/ScannedCardTray";
import { useScanStore } from "@/store/scanStore";
import { COLORS } from "@/lib/constants";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("back");
  const { frameProcessor } = useCardScanner();
  const { detectedName, pending } = useScanStore();
  const [active, setActive] = useState(true);

  // Request camera permission on mount
  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  // Pause camera while app is backgrounded (handled by useCameraDevice + isActive)
  const hasPending = pending.some((p) => !p.added);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>Camera access is required to scan cards.</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>No camera found.</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Full-screen camera feed */}
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={active}
        frameProcessor={frameProcessor}
        // High-resolution for better OCR accuracy
        photo={false}
        video={false}
        // Stabilization + auto-focus on the card
        videoStabilizationMode="auto"
        androidPreviewViewType="texture-view"
      />

      {/* Overlay: vignette, targeting rectangle, detected name */}
      <ScanOverlay detectedName={detectedName} />

      {/* Pending scans tray at the bottom */}
      {hasPending && <ScannedCardTray />}

      {/* Bottom safe area when tray is hidden */}
      {!hasPending && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomHint}>
          <Text style={styles.bottomHintText}>
            Point at a card — it'll scan automatically
          </Text>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permText: {
    color: COLORS.text,
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },
  permButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  bottomHint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 8,
  },
  bottomHintText: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
  },
});

import React, { useEffect, useState } from "react";
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useCardScanner } from "@/hooks/useCardScanner";
import { ScanOverlay } from "@/components/ScanOverlay";
import { ScannedCardTray } from "@/components/ScannedCardTray";
import { LastScannedThumb } from "@/components/LastScannedThumb";
import { useScanStore } from "@/store/scanStore";
import { COLORS } from "@/lib/constants";

export default function ScanScreen() {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<"back" | "front">("back");
  const [paused, setPaused] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [addedToast, setAddedToast] = useState<string | null>(null);

  const device = useCameraDevice(cameraPosition);
  const { frameProcessor } = useCardScanner();
  const {
    detectedName,
    detectedPrice,
    pending,
    hashIndexReady,
    autoAddToCollection,
    lastMatchMethod,
    lastAddedAt,
    lastAddedName,
    setAutoAddToCollection,
  } = useScanStore();

  const unaddedPending = pending.filter((p) => !p.added);
  const lastScanned = unaddedPending[0] ?? pending[0] ?? null;
  const totalPending = unaddedPending.reduce((s, p) => s + p.quantity, 0);

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  useEffect(() => {
    if (trayOpen && unaddedPending.length === 0) setTrayOpen(false);
  }, [trayOpen, unaddedPending.length]);

  useEffect(() => {
    if (!lastAddedAt || !lastAddedName) return;
    setAddedToast(
      autoAddToCollection ? `${lastAddedName} → collection` : lastAddedName
    );
    const t = setTimeout(() => setAddedToast(null), 2200);
    return () => clearTimeout(t);
  }, [lastAddedAt, lastAddedName, autoAddToCollection]);

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
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={!paused}
        frameProcessor={frameProcessor}
        photo={false}
        video={false}
        videoStabilizationMode="auto"
        androidPreviewViewType="texture-view"
        torch={flashOn ? "on" : "off"}
      />

      <ScanOverlay detectedName={detectedName} detectedPrice={detectedPrice} />

      {!hashIndexReady && (
        <View style={styles.indexBanner} pointerEvents="none">
          <ActivityIndicator color="#fff" size="small" />
          <Text style={styles.indexBannerText}>Loading visual index… OCR active</Text>
        </View>
      )}

      {addedToast && (
        <View style={styles.addedToast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color={COLORS.success} />
          <Text style={styles.addedToastText}>{addedToast}</Text>
        </View>
      )}

      <View style={styles.topBarWrap} pointerEvents="box-none">
        <SafeAreaView edges={["top"]}>
          <View style={styles.topBar}>
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setFlashOn((f) => !f)}
              activeOpacity={0.75}
            >
              <Ionicons name={flashOn ? "flash" : "flash-outline"} size={20} color="#fff" />
            </TouchableOpacity>

            <View style={styles.topBarCenter}>
              {lastMatchMethod && (
                <Text style={styles.matchBadge}>
                  {lastMatchMethod === "hash" ? "Visual match" : "Text match"}
                </Text>
              )}
            </View>

            <View style={styles.topBarRight}>
              <TouchableOpacity
                style={[styles.autoAddBtn, autoAddToCollection && styles.autoAddBtnOn]}
                onPress={() => setAutoAddToCollection(!autoAddToCollection)}
                activeOpacity={0.75}
              >
                <Ionicons
                  name={autoAddToCollection ? "add-circle" : "add-circle-outline"}
                  size={18}
                  color={autoAddToCollection ? COLORS.success : "#fff"}
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setPaused((p) => !p)}
                activeOpacity={0.75}
              >
                <Ionicons name={paused ? "play" : "pause"} size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setCameraPosition((pos) => (pos === "back" ? "front" : "back"))}
                activeOpacity={0.75}
              >
                <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {!trayOpen && lastScanned && !autoAddToCollection && (
        <LastScannedThumb
          scan={lastScanned}
          totalCount={totalPending}
          onViewMore={() => setTrayOpen(true)}
        />
      )}

      {trayOpen && <ScannedCardTray onClose={() => setTrayOpen(false)} />}

      {!lastScanned && !paused && (
        <SafeAreaView edges={["bottom"]} style={styles.bottomHint} pointerEvents="none">
          <Text style={styles.bottomHintText}>
            {hashIndexReady
              ? "Point at a card — visual + text scan"
              : "Point at a card — text scan while index loads"}
          </Text>
        </SafeAreaView>
      )}

      {paused && (
        <View style={styles.pausedBadge} pointerEvents="none">
          <Ionicons name="pause-circle" size={18} color={COLORS.textMuted} />
          <Text style={styles.pausedText}>Paused</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  centered: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 16,
  },
  permText: { color: COLORS.text, fontSize: 16, textAlign: "center", lineHeight: 24 },
  permButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permButtonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  topBarWrap: { position: "absolute", top: 0, left: 0, right: 0 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  topBarCenter: { flex: 1, alignItems: "center" },
  topBarRight: { flexDirection: "row", gap: 6 },
  matchBadge: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  autoAddBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  autoAddBtnOn: {
    backgroundColor: "rgba(34,197,94,0.25)",
  },
  indexBanner: {
    position: "absolute",
    top: 100,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  indexBannerText: { color: "rgba(255,255,255,0.8)", fontSize: 12 },
  addedToast: {
    position: "absolute",
    bottom: 120,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(34,197,94,0.35)",
  },
  addedToastText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  bottomHint: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingBottom: 8,
  },
  bottomHintText: { color: "rgba(255,255,255,0.35)", fontSize: 12 },
  pausedBadge: {
    position: "absolute",
    bottom: 56,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  pausedText: { color: COLORS.textMuted, fontSize: 13, fontWeight: "600" },
});

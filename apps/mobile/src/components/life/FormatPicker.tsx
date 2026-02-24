import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../lib/constants";
import {
  type Format,
  FORMAT_CONFIG,
  PLAYER_COLORS,
  useLifeStore,
} from "../../store/lifeStore";

const FORMATS: Format[] = [
  "standard",
  "commander",
  "brawl",
  "twoheaded",
  "oathbreaker",
];

export function FormatPicker() {
  const [selectedFormat, setSelectedFormat] = useState<Format>("standard");
  const [playerCount, setPlayerCount] = useState<2 | 3 | 4>(2);
  const { startGame } = useLifeStore();

  const startLife = FORMAT_CONFIG[selectedFormat].life;

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Life Counter</Text>

          {/* Format cards */}
          <Text style={styles.sectionLabel}>FORMAT</Text>
          <View style={styles.formatList}>
            {FORMATS.map((f) => {
              const cfg = FORMAT_CONFIG[f];
              const active = selectedFormat === f;
              return (
                <TouchableOpacity
                  key={f}
                  style={[styles.formatCard, active && styles.formatCardActive]}
                  onPress={() => setSelectedFormat(f)}
                  activeOpacity={0.75}
                >
                  <View style={styles.formatCardLeft}>
                    <Text
                      style={[
                        styles.formatName,
                        active && styles.formatNameActive,
                      ]}
                    >
                      {cfg.label}
                    </Text>
                    <Text style={styles.formatDesc}>{cfg.description}</Text>
                  </View>
                  <Text
                    style={[
                      styles.formatLife,
                      active && styles.formatLifeActive,
                    ]}
                  >
                    {cfg.life}
                  </Text>
                  {active && (
                    <Ionicons
                      name="checkmark-circle"
                      size={18}
                      color={COLORS.accent}
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Player count */}
          <Text style={[styles.sectionLabel, { marginTop: 8 }]}>PLAYERS</Text>
          <View style={styles.playerRow}>
            {([2, 3, 4] as const).map((n) => {
              const active = playerCount === n;
              return (
                <TouchableOpacity
                  key={n}
                  style={[styles.playerBtn, active && styles.playerBtnActive]}
                  onPress={() => setPlayerCount(n)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.playerBtnNum,
                      active && styles.playerBtnNumActive,
                    ]}
                  >
                    {n}
                  </Text>
                  <Text
                    style={[
                      styles.playerBtnLabel,
                      active && styles.playerBtnLabelActive,
                    ]}
                  >
                    {n === 1 ? "player" : "players"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Color preview dots */}
          <View style={styles.dotRow}>
            {Array.from({ length: playerCount }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: PLAYER_COLORS[i] }]}
              />
            ))}
          </View>

          {/* Start */}
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => startGame(selectedFormat, playerCount)}
            activeOpacity={0.85}
          >
            <Ionicons name="heart" size={18} color="#fff" />
            <Text style={styles.startBtnText}>
              Start · {playerCount} × {startLife} life
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: COLORS.text,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginBottom: 28,
  },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.3,
    marginBottom: 10,
  },
  formatList: {
    gap: 8,
    marginBottom: 28,
  },
  formatCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    padding: 14,
  },
  formatCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(168,85,247,0.07)",
  },
  formatCardLeft: {
    flex: 1,
    gap: 2,
  },
  formatName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "700",
  },
  formatNameActive: {
    color: COLORS.accent,
  },
  formatDesc: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  formatLife: {
    color: COLORS.textMuted,
    fontSize: 24,
    fontWeight: "800",
    minWidth: 36,
    textAlign: "right",
  },
  formatLifeActive: {
    color: COLORS.accent,
  },
  playerRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  playerBtn: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingVertical: 14,
    alignItems: "center",
    gap: 2,
  },
  playerBtnActive: {
    borderColor: COLORS.accent,
    backgroundColor: "rgba(168,85,247,0.08)",
  },
  playerBtnNum: {
    color: COLORS.textMuted,
    fontSize: 22,
    fontWeight: "800",
  },
  playerBtnNumActive: {
    color: COLORS.accent,
  },
  playerBtnLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  playerBtnLabelActive: {
    color: "rgba(168,85,247,0.7)",
  },
  dotRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 32,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  startBtn: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  startBtnText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
});

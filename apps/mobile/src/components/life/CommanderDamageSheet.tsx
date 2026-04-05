import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { COLORS } from "../../lib/constants";
import {
  useLifeStore,
  type Player,
  PLAYER_COLORS,
} from "../../store/lifeStore";

interface Props {
  targetPlayer: Player;
  allPlayers: Player[];
  onClose: () => void;
}

export function CommanderDamageSheet({
  targetPlayer,
  allPlayers,
  onClose,
}: Props) {
  const { changeCommanderDamage } = useLifeStore();
  const slideAnim = useRef(new Animated.Value(320)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        speed: 22,
        bounciness: 3,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [slideAnim, backdropOpacity]);

  const close = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 320,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(onClose);
  };

  const opponents = allPlayers.filter((p) => p.id !== targetPlayer.id);
  const hasLethal = Object.values(targetPlayer.commanderDamage).some(
    (d) => d >= 21
  );

  return (
    <>
      {/* Backdrop */}
      <Animated.View
        style={[styles.backdrop, { opacity: backdropOpacity }]}
        pointerEvents="none"
      />
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={close}
      />

      {/* Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Drag handle */}
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Commander Damage</Text>
            <Text style={styles.headerSub}>
              received by {targetPlayer.name}
            </Text>
          </View>
          <TouchableOpacity onPress={close} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          {opponents.map((opponent) => {
            const oppIdx = allPlayers.findIndex((p) => p.id === opponent.id);
            const oppColor = PLAYER_COLORS[oppIdx] ?? PLAYER_COLORS[0];
            const damage = targetPlayer.commanderDamage[opponent.id] ?? 0;
            const isLethal = damage >= 21;

            return (
              <View key={opponent.id} style={styles.row}>
                {/* Color swatch */}
                <View
                  style={[styles.swatch, { backgroundColor: oppColor }]}
                />

                {/* Name */}
                <Text style={styles.opponentName} numberOfLines={1}>
                  {opponent.name}
                </Text>

                {/* Damage display */}
                <View style={styles.damageWrap}>
                  <Text
                    style={[styles.damageNum, isLethal && styles.damageLethal]}
                  >
                    {damage}
                  </Text>
                  <Text style={styles.damageMax}>/21</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBg}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.min(100, (damage / 21) * 100)}%`,
                        backgroundColor: isLethal ? "#f87171" : oppColor,
                      },
                    ]}
                  />
                </View>

                {/* +/- controls */}
                <View style={styles.controls}>
                  <TouchableOpacity
                    style={styles.ctrlBtn}
                    onPress={() => {
                      changeCommanderDamage(targetPlayer.id, opponent.id, -1);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={styles.ctrlBtnText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.ctrlBtn, styles.ctrlBtnInc]}
                    onPress={() => {
                      changeCommanderDamage(targetPlayer.id, opponent.id, 1);
                      Haptics.selectionAsync();
                    }}
                  >
                    <Text style={styles.ctrlBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {/* Lethal warning */}
          {hasLethal && (
            <View style={styles.lethalBanner}>
              <Ionicons name="skull" size={15} color="#f87171" />
              <Text style={styles.lethalText}>
                Lethal commander damage — {targetPlayer.name} is defeated
              </Text>
            </View>
          )}

          {/* Note */}
          <Text style={styles.note}>
            21 damage from a single commander = defeat.{"\n"}
            Adjusting commander damage also adjusts life total.
          </Text>
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    zIndex: 50,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111111",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderColor: COLORS.border,
    paddingBottom: 48,
    maxHeight: "60%",
    zIndex: 100,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 17,
    fontWeight: "700",
  },
  headerSub: {
    color: COLORS.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 10,
    flexWrap: "wrap",
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  opponentName: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  damageWrap: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
  },
  damageNum: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "800",
    minWidth: 28,
    textAlign: "right",
  },
  damageLethal: {
    color: "#f87171",
  },
  damageMax: {
    color: COLORS.textMuted,
    fontSize: 13,
  },
  progressBg: {
    height: 3,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    flex: 1,
    minWidth: 40,
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
  },
  controls: {
    flexDirection: "row",
    gap: 6,
  },
  ctrlBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlBtnInc: {
    backgroundColor: "rgba(168,85,247,0.12)",
    borderColor: COLORS.accent,
  },
  ctrlBtnText: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "500",
  },
  lethalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    padding: 12,
    backgroundColor: "rgba(239,68,68,0.1)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.25)",
  },
  lethalText: {
    color: "#f87171",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  note: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
});

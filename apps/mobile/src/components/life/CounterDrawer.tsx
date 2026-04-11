import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useLifeStore, type Player } from "../../store/lifeStore";
import { LC, COUNTERS } from "../../lib/lifeConstants";

interface Props {
  player: Player;
  visible: boolean;
  onClose: () => void;
}

export function CounterDrawer({ player, visible, onClose }: Props) {
  const {
    adjustPoison,
    adjustEnergy,
    adjustExperience,
    adjustCommanderDamage,
    players,
  } = useLifeStore();

  const slideAnim = useRef(new Animated.Value(400)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          damping: 18,
          mass: 1,
          stiffness: 180,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 400,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, slideAnim, backdropOpacity]);

  if (!visible) return null;

  const getCounterValue = (key: string): number => {
    switch (key) {
      case "poison":
        return player.poison;
      case "energy":
        return player.energy;
      case "experience":
        return player.experience;
      case "commander":
        return Object.values(player.commanderDamage).reduce((a, b) => a + b, 0);
      default:
        return 0;
    }
  };

  const handleAdjust = (key: string, delta: number) => {
    Haptics.selectionAsync();

    switch (key) {
      case "poison":
        adjustPoison(player.id, delta);
        break;
      case "energy":
        adjustEnergy(player.id, delta);
        break;
      case "experience":
        adjustExperience(player.id, delta);
        break;
      case "commander": {
        const firstNonSelf = players.find((p) => p.id !== player.id);
        if (firstNonSelf) {
          adjustCommanderDamage(player.id, firstNonSelf.id, delta);
        }
        break;
      }
    }
  };

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
        onPress={onClose}
      />

      {/* Drawer */}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateY: slideAnim }] }]}
      >
        {/* Handle */}
        <View style={styles.handle} />

        {/* Grid of counters */}
        <View style={styles.grid}>
          {COUNTERS.map((counter) => {
            const value = getCounterValue(counter.key);

            return (
              <View key={counter.key} style={styles.tile}>
                {/* Icon + Label */}
                <View style={styles.iconAndLabel}>
                  <View
                    style={[
                      styles.iconBg,
                      { backgroundColor: `${counter.color}2D` },
                    ]}
                  >
                    <Text
                      style={[styles.iconLabel, { color: counter.color }]}
                    >
                      {counter.label}
                    </Text>
                  </View>

                  <View style={styles.labelAndValue}>
                    <Text style={styles.label}>{counter.label}</Text>
                    <Text
                      style={[styles.value, { color: counter.color }]}
                    >
                      {value}
                    </Text>
                  </View>
                </View>

                {/* Controls */}
                <View style={styles.controls}>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => handleAdjust(counter.key, -1)}
                  >
                    <Text style={styles.buttonText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.button}
                    onPress={() => handleAdjust(counter.key, 1)}
                  >
                    <Text style={styles.buttonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: LC.surfaceOverlay,
    zIndex: 50,
  },

  drawer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: LC.surface,
    borderTopWidth: 1,
    borderTopColor: LC.borderStrong,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingBottom: 32,
    zIndex: 100,
  },

  handle: {
    width: 32,
    height: 3,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 12,
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },

  tile: {
    width: "48%",
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  iconAndLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },

  iconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  iconLabel: {
    fontSize: 9,
    fontWeight: "800",
  },

  labelAndValue: {
    justifyContent: "center",
  },

  label: {
    fontSize: 8,
    fontWeight: "800",
    color: "rgba(255,255,255,0.4)",
    textTransform: "uppercase",
    marginBottom: 2,
  },

  value: {
    fontSize: 22,
    fontWeight: "800",
  },

  controls: {
    flexDirection: "row",
    gap: 6,
  },

  button: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
  },

  buttonText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontWeight: "300",
  },
});

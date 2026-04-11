import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useLifeStore, formatTime } from "../../store/lifeStore";
import { LC } from "../../lib/lifeConstants";
import { CoinFlip } from "./CoinFlip";

export function CenterStrip() {
  const {
    globalElapsedMs,
    isClockRunning,
    timerMinutes,
    resetGame,
    backToSetup,
  } = useLifeStore();

  const [coinFlipResult, setCoinFlipResult] = useState<"HEADS" | "TAILS" | null>(
    null
  );

  const handleEndGame = () => {
    Alert.alert("End Game?", "Are you sure you want to end the game?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "End",
        onPress: () => {
          backToSetup();
        },
        style: "destructive",
      },
    ]);
  };

  const handleFlip = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const result = Math.random() < 0.5 ? "HEADS" : "TAILS";
    setCoinFlipResult(result);
  };

  const handleReset = () => {
    Alert.alert("Reset Game?", "Reset all players to starting life?", [
      { text: "Cancel", onPress: () => {} },
      {
        text: "Reset",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          resetGame();
        },
        style: "destructive",
      },
    ]);
  };

  // Display either coin flip result or elapsed time
  const displayContent =
    coinFlipResult !== null ? (
      <CoinFlip
        result={coinFlipResult}
        onDismiss={() => setCoinFlipResult(null)}
      />
    ) : (
      <Text
        style={[
          styles.timeText,
          isClockRunning && { color: LC.success },
        ]}
      >
        {timerMinutes ? formatTime(globalElapsedMs) : "--:--"}
      </Text>
    );

  return (
    <View style={styles.root}>
      {/* Left: Settings button */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={handleEndGame}
        activeOpacity={0.7}
      >
        <Text style={styles.settingsText}>Settings</Text>
      </TouchableOpacity>

      {/* Center: CoinFlip or elapsed time */}
      <View style={styles.centerContainer}>{displayContent}</View>

      {/* Right: Flip and Reset buttons */}
      <View style={styles.rightContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={handleFlip}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>Flip</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.button}
          onPress={handleReset}
          activeOpacity={0.7}
        >
          <Text style={styles.buttonText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: 44,
    flexDirection: "row",
    backgroundColor: LC.surfaceSunken,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: LC.border,
    borderBottomColor: LC.border,
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    gap: 8,
  },
  settingsButton: {
    backgroundColor: LC.surfaceRaised,
    borderWidth: 1,
    borderColor: LC.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  settingsText: {
    fontSize: 11,
    fontWeight: "700",
    color: LC.textMuted,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  timeText: {
    fontSize: 13,
    fontWeight: "700",
    color: LC.textMuted,
    fontFamily: "Courier New",
  },
  rightContainer: {
    flexDirection: "row",
    gap: 8,
  },
  button: {
    backgroundColor: LC.surfaceRaised,
    borderWidth: 1,
    borderColor: LC.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: "700",
    color: LC.textMuted,
  },
});

import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useLifeStore } from "../../store/lifeStore";
import { LC } from "../../lib/lifeConstants";

export function GameOverScreen() {
  const { players, resetGame, backToSetup } = useLifeStore();

  // Find first non-eliminated player (winner)
  const winner = players.find((p) => !p.isEliminated);
  const isDraw = !winner;

  const handlePlayAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetGame();
  };

  const handleNewSetup = () => {
    Haptics.selectionAsync();
    backToSetup();
  };

  return (
    <View style={styles.root}>
      <View style={styles.cardContainer}>
        {/* Winner or Draw */}
        {isDraw ? (
          <Text style={styles.drawText}>Draw!</Text>
        ) : winner ? (
          <>
            <Text
              style={[
                styles.winnerName,
                { color: winner.color.active },
              ]}
            >
              {winner.name}
            </Text>
            <Text style={styles.winsText}>Wins!</Text>
          </>
        ) : null}

        {/* Buttons */}
        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={[styles.button, styles.playAgainButton]}
            onPress={handlePlayAgain}
            activeOpacity={0.8}
          >
            <Text style={styles.playAgainText}>Play Again</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.newSetupButton]}
            onPress={handleNewSetup}
            activeOpacity={0.8}
          >
            <Text style={styles.newSetupText}>New Setup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LC.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  cardContainer: {
    backgroundColor: LC.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: LC.border,
    paddingHorizontal: 48,
    paddingVertical: 48,
    alignItems: "center",
    maxWidth: 340,
  },
  winnerName: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1,
    marginBottom: 4,
  },
  winsText: {
    fontSize: 24,
    fontWeight: "800",
    color: LC.textPrimary,
    marginBottom: 32,
  },
  drawText: {
    fontSize: 32,
    fontWeight: "900",
    color: LC.textPrimary,
    letterSpacing: -1,
    marginBottom: 32,
  },
  buttonsContainer: {
    width: "100%",
    marginTop: 32,
    gap: 10,
  },
  button: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  playAgainButton: {
    backgroundColor: LC.accent,
    paddingVertical: 16,
  },
  playAgainText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  newSetupButton: {
    backgroundColor: LC.surfaceRaised,
    borderWidth: 1,
    borderColor: LC.border,
    borderRadius: 14,
    paddingVertical: 14,
  },
  newSetupText: {
    fontSize: 13,
    fontWeight: "700",
    color: LC.textSecondary,
  },
});

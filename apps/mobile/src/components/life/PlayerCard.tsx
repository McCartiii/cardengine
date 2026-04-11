import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LC } from "../../lib/lifeConstants";
import type { Player } from "../../store/lifeStore";
import { formatTime } from "../../store/lifeStore";

interface PlayerCardProps {
  player: Player;
  playerIndex: number;
  isActivePlayer: boolean;
  hasTimer: boolean;
  compact?: boolean;
}

export function PlayerCard({
  player,
  playerIndex,
  isActivePlayer,
  hasTimer,
  compact = false,
}: PlayerCardProps) {
  const isEliminated = player.isEliminated;

  // Life text size based on compact mode
  const lifeSize = compact ? 48 : 64;
  const nameSize = compact ? 11 : 13;
  const timerSize = compact ? 10 : 12;

  // Border color: teal for active, muted for inactive, darkened for eliminated
  const borderColor = isEliminated
    ? "rgba(255,255,255,0.1)"
    : isActivePlayer
      ? player.color.active
      : "rgba(255,255,255,0.15)";

  // Background with player's base color at low opacity
  const bgColor = isEliminated
    ? "rgba(255,255,255,0.02)"
    : `${player.color.base}12`;

  return (
    <View
      style={[
        styles.card,
        {
          borderColor,
          backgroundColor: bgColor,
          opacity: isEliminated ? 0.5 : 1,
        },
      ]}
    >
      {/* Life number */}
      <Text
        style={[
          styles.lifeText,
          {
            fontSize: lifeSize,
            color: isEliminated ? "rgba(255,255,255,0.2)" : "#FFFFFF",
          },
        ]}
      >
        {player.life}
      </Text>

      {/* Player name */}
      <Text
        style={[
          styles.nameText,
          {
            fontSize: nameSize,
            color: isEliminated ? "rgba(255,255,255,0.25)" : LC.textSecondary,
          },
        ]}
      >
        {player.name}
      </Text>

      {/* Timer if enabled */}
      {hasTimer && !isEliminated && (
        <Text
          style={[
            styles.timerText,
            {
              fontSize: timerSize,
              color: isActivePlayer ? LC.success : LC.textMuted,
            },
          ]}
        >
          {formatTime(player.timeRemainingMs)}
        </Text>
      )}

      {/* Eliminated badge */}
      {isEliminated && (
        <Text
          style={[
            styles.eliminatedText,
            {
              fontSize: compact ? 9 : 11,
            },
          ]}
        >
          OUT
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  lifeText: {
    fontWeight: "900",
    letterSpacing: -1,
  },
  nameText: {
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  timerText: {
    fontWeight: "700",
    fontFamily: "Courier New",
    marginTop: 2,
  },
  eliminatedText: {
    fontWeight: "700",
    color: LC.danger,
    letterSpacing: 1,
    marginTop: 4,
  },
});

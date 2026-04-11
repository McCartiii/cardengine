import React, { useEffect, useRef } from "react";
import { View, StyleSheet } from "react-native";
import { useLifeStore } from "../../store/lifeStore";
import { LC } from "../../lib/lifeConstants";
import { PlayerCard } from "../../components/life/PlayerCard";
import { CenterStrip } from "../../components/life/CenterStrip";

export function GameScreen() {
  const {
    players,
    activePlayerIndex,
    timerMinutes,
    phase,
    isClockRunning,
    tick,
  } = useLifeStore();

  const hasTimer = timerMinutes !== null;
  const count = players.length;

  // Calculate top/bottom split
  const topCount = count <= 2 ? 1 : count <= 4 ? 2 : 3;
  const topPlayers = players.slice(0, topCount);
  const bottomPlayers = players.slice(topCount);
  const compact = count >= 3;

  // Timer tick loop
  const lastTickRef = useRef<number>(Date.now());

  useEffect(() => {
    if (phase !== "playing" || !isClockRunning || !hasTimer) {
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      tick(delta);
    }, 100);

    return () => clearInterval(interval);
  }, [phase, isClockRunning, hasTimer, tick]);

  return (
    <View style={styles.root}>
      {/* Top row (rotated 180°) */}
      <View style={[styles.row, styles.topRow]}>
        {topPlayers.map((player, i) => {
          const originalIndex = i;
          return (
            <PlayerCard
              key={player.id}
              player={player}
              playerIndex={originalIndex}
              isActivePlayer={originalIndex === activePlayerIndex}
              hasTimer={hasTimer}
              compact={compact}
            />
          );
        })}
      </View>

      {/* Center strip */}
      <CenterStrip />

      {/* Bottom row (normal orientation) */}
      <View style={styles.row}>
        {bottomPlayers.map((player, i) => {
          const originalIndex = topCount + i;
          return (
            <PlayerCard
              key={player.id}
              player={player}
              playerIndex={originalIndex}
              isActivePlayer={originalIndex === activePlayerIndex}
              hasTimer={hasTimer}
              compact={compact}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: LC.bg,
    padding: 6,
  },
  row: {
    flexDirection: "row",
    flex: 1,
    gap: 6,
  },
  topRow: {
    transform: [{ rotate: "180deg" }],
  },
});

import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLifeStore } from "@/store/lifeStore";
import { FormatPicker } from "@/components/life/FormatPicker";
import { PlayerPanel } from "@/components/life/PlayerPanel";
import { CommanderDamageSheet } from "@/components/life/CommanderDamageSheet";

export default function LifeScreen() {
  const { gameStarted, format, players, resetGame, backToSetup } =
    useLifeStore();
  const [cmdTargetId, setCmdTargetId] = useState<string | null>(null);

  if (!gameStarted) return <FormatPicker />;

  const isCommander = format === "commander" || format === "brawl";
  const cmdTarget = cmdTargetId
    ? players.find((p) => p.id === cmdTargetId) ?? null
    : null;

  const handleReset = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      "Reset Game?",
      "All life totals return to their starting values.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            resetGame();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          },
        },
      ]
    );
  };

  const handleSetup = () => {
    Alert.alert("End Game?", "Return to format selection.", [
      { text: "Stay", style: "cancel" },
      { text: "End Game", style: "destructive", onPress: backToSetup },
    ]);
  };

  // ── Centre divider ─────────────────────────────────────────────────────
  const Divider = () => (
    <View style={styles.divider}>
      <TouchableOpacity style={styles.divBtn} onPress={handleReset}>
        <Ionicons name="refresh" size={15} color="rgba(255,255,255,0.35)" />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.divBtn, styles.divBtnSm]} onPress={handleSetup}>
        <Ionicons name="settings-outline" size={13} color="rgba(255,255,255,0.3)" />
      </TouchableOpacity>
    </View>
  );

  const VertDivider = () => <View style={styles.vertDivider} />;

  // ── Layouts ────────────────────────────────────────────────────────────

  const renderLayout = () => {
    const count = players.length;

    if (count === 2) {
      return (
        <>
          {/* Top player — rotated so they can read from across the table */}
          <View style={[styles.half, styles.rotated]}>
            <PlayerPanel
              player={players[0]}
              playerIndex={0}
              isCommander={isCommander}
              allPlayers={players}
              onCommanderPress={() => setCmdTargetId(players[0].id)}
            />
          </View>

          <Divider />

          <View style={styles.half}>
            <PlayerPanel
              player={players[1]}
              playerIndex={1}
              isCommander={isCommander}
              allPlayers={players}
              onCommanderPress={() => setCmdTargetId(players[1].id)}
            />
          </View>
        </>
      );
    }

    if (count === 3) {
      return (
        <>
          {/* Top — full-width, rotated */}
          <View style={[styles.third, styles.rotated]}>
            <PlayerPanel
              player={players[0]}
              playerIndex={0}
              isCommander={isCommander}
              allPlayers={players}
              onCommanderPress={() => setCmdTargetId(players[0].id)}
            />
          </View>

          <Divider />

          {/* Bottom two side-by-side */}
          <View style={[styles.third, styles.row]}>
            <PlayerPanel
              player={players[1]}
              playerIndex={1}
              isCommander={isCommander}
              allPlayers={players}
              compact
              onCommanderPress={() => setCmdTargetId(players[1].id)}
            />
            <VertDivider />
            <PlayerPanel
              player={players[2]}
              playerIndex={2}
              isCommander={isCommander}
              allPlayers={players}
              compact
              onCommanderPress={() => setCmdTargetId(players[2].id)}
            />
          </View>
        </>
      );
    }

    // 4 players — 2 × 2
    return (
      <>
        <View style={[styles.half, styles.row]}>
          <View style={[styles.fill, styles.rotated]}>
            <PlayerPanel
              player={players[0]}
              playerIndex={0}
              isCommander={isCommander}
              allPlayers={players}
              compact
              onCommanderPress={() => setCmdTargetId(players[0].id)}
            />
          </View>
          <VertDivider />
          <View style={[styles.fill, styles.rotated]}>
            <PlayerPanel
              player={players[1]}
              playerIndex={1}
              isCommander={isCommander}
              allPlayers={players}
              compact
              onCommanderPress={() => setCmdTargetId(players[1].id)}
            />
          </View>
        </View>

        <Divider />

        <View style={[styles.half, styles.row]}>
          <PlayerPanel
            player={players[2]}
            playerIndex={2}
            isCommander={isCommander}
            allPlayers={players}
            compact
            onCommanderPress={() => setCmdTargetId(players[2].id)}
          />
          <VertDivider />
          <PlayerPanel
            player={players[3]}
            playerIndex={3}
            isCommander={isCommander}
            allPlayers={players}
            compact
            onCommanderPress={() => setCmdTargetId(players[3].id)}
          />
        </View>
      </>
    );
  };

  return (
    <View style={styles.root}>
      {renderLayout()}

      {/* Commander damage sheet */}
      {cmdTarget && (
        <CommanderDamageSheet
          targetPlayer={cmdTarget}
          allPlayers={players}
          onClose={() => setCmdTargetId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },
  half: {
    flex: 1,
  },
  third: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
  },
  rotated: {
    transform: [{ rotate: "180deg" }],
  },
  divider: {
    height: 38,
    backgroundColor: "#080808",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#1c1c1c",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 20,
  },
  divBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#181818",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
  divBtnSm: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  vertDivider: {
    width: 1,
    backgroundColor: "#1c1c1c",
  },
});

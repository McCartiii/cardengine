// The back of a player's panel: poison, energy, experience, commander tax,
// and commander damage taken from each opponent (and each partner).
import React, { useState } from "react";
import { Image } from "expo-image";
import { PlayerPicturePicker } from "./PlayerPicture";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { font } from "@/design/fonts";
import { CMD_LIMIT, POISON_LIMIT, damageSources, type CounterKey, type LifeGame, type LifePlayer } from "@/lib/lifeGame";
import { COUNTER_INFO, PLAYER_COLORS } from "@/lib/lifeConstants";
import { useLifeStore } from "@/store/lifeStore";
import { feel } from "./feel";

const COUNTERS: CounterKey[] = ["poison", "energy", "experience", "tax"];

export function CountersBack({ player, game, compact, onClose }: { player: LifePlayer; game: LifeGame; compact: boolean; onClose: () => void }) {
  const counter = useLifeStore((s) => s.counter);
  const commanderDamage = useLifeStore((s) => s.commanderDamage);
  const setPartner = useLifeStore((s) => s.setPartner);
  const concede = useLifeStore((s) => s.concede);
  const setArt = useLifeStore((s) => s.setArt);
  const [picking, setPicking] = useState(false);
  const sources = damageSources(game, player.id);

  return (
    <View style={StyleSheet.absoluteFill}>
      <View style={[styles.header, compact && { paddingTop: 10 }]}>
        <Text style={styles.title} numberOfLines={1}>
          {player.name}
        </Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.body, compact && { padding: 10, gap: 10 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.section}>COMMANDER DAMAGE TAKEN</Text>
        <View style={styles.grid}>
          {sources.map((s) => {
            const value = player.cmd[s.key] ?? 0;
            const c = PLAYER_COLORS[s.player.color];
            return (
              <Tile
                key={s.key}
                compact={compact}
                label={s.second ? `${s.player.name} · partner` : s.player.name}
                value={value}
                max={CMD_LIMIT}
                swatch={[c.from, c.to]}
                onChange={(d) => {
                  feel.tick();
                  commanderDamage(player.id, s.key, d);
                }}
              />
            );
          })}
        </View>

        <Text style={styles.section}>COUNTERS</Text>
        <View style={styles.grid}>
          {COUNTERS.map((key) => {
            const info = COUNTER_INFO[key];
            return (
              <Tile
                key={key}
                compact={compact}
                label={info.label}
                icon={info.icon}
                tint={info.tint}
                value={player[key]}
                display={key === "tax" ? `+${player[key] * 2}` : undefined}
                max={key === "poison" ? POISON_LIMIT : undefined}
                onChange={(d) => {
                  feel.tick();
                  counter(player.id, key, d);
                }}
              />
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            feel.tick();
            setPicking(true);
          }}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          {player.art ? (
            <Image source={{ uri: player.art.uri }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]}>
              <Ionicons name="image" size={18} color="rgba(255,255,255,0.6)" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Picture</Text>
            <Text style={styles.rowHint} numberOfLines={1}>
              {player.art?.label ?? (player.art ? "Your photo" : "A photo or any card's art")}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
        </Pressable>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Partner commanders</Text>
            <Text style={styles.rowHint}>Others track damage from each one</Text>
          </View>
          <Switch
            value={player.partner}
            onValueChange={(v) => {
              feel.tick();
              setPartner(player.id, v);
            }}
            trackColor={{ true: PLAYER_COLORS[player.color].to, false: "#2A2C35" }}
            thumbColor="#FFFFFF"
          />
        </View>
        <Pressable
          onPress={() => {
            feel.warning();
            concede(player.id, !player.conceded);
          }}
          style={({ pressed }) => [styles.concede, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Ionicons name={player.conceded ? "arrow-undo" : "flag"} size={15} color={player.conceded ? "#FFFFFF" : "#FF8A9A"} />
          <Text style={[styles.concedeText, player.conceded && { color: "#FFFFFF" }]}>{player.conceded ? "Take back concession" : "Concede"}</Text>
        </Pressable>
      </ScrollView>
      <PlayerPicturePicker
        visible={picking}
        name={player.name}
        art={player.art}
        onChange={(art) => setArt(player.id, art)}
        onClose={() => setPicking(false)}
      />
      {/* On the player's own edge, clear of the menu button in the middle of the table. */}
      <View style={[styles.footer, compact && { padding: 8 }]}>
        <Pressable onPress={onClose} hitSlop={6} style={({ pressed }) => [styles.done, pressed && { transform: [{ scale: 0.97 }] }]} accessibilityRole="button" accessibilityLabel="Done">
          <Ionicons name="checkmark" size={16} color="#111" />
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Tile({
  label,
  value,
  display,
  max,
  icon,
  tint,
  swatch,
  compact,
  onChange,
}: {
  label: string;
  value: number;
  display?: string;
  max?: number;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  tint?: string;
  swatch?: [string, string];
  compact: boolean;
  onChange: (delta: number) => void;
}) {
  const lethal = max != null && value >= max;
  return (
    <View style={[styles.tile, compact && styles.tileCompact, lethal && styles.tileLethal]}>
      <View style={styles.tileHead}>
        {swatch ? (
          <LinearGradient colors={swatch} style={styles.swatch} />
        ) : (
          <Ionicons name={icon!} size={13} color={tint} />
        )}
        <Text style={styles.tileLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => onChange(-1)} hitSlop={6} style={styles.step} accessibilityRole="button" accessibilityLabel={`${label} minus 1`}>
          <Ionicons name="remove" size={18} color="#FFFFFF" />
        </Pressable>
        <Text style={[styles.value, compact && { fontSize: 22 }, lethal && { color: "#FF8A9A" }]}>{display ?? value}</Text>
        <Pressable onPress={() => onChange(1)} hitSlop={6} style={styles.step} accessibilityRole="button" accessibilityLabel={`${label} plus 1`}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
      {max != null && (
        <View style={styles.meter}>
          <View style={[styles.meterFill, { width: `${Math.min(1, value / max) * 100}%`, backgroundColor: lethal ? "#FF5A6E" : swatch?.[0] ?? tint }]} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 6 },
  title: { flex: 1, fontFamily: font.heavy, fontSize: 17, color: "#FFFFFF", letterSpacing: -0.3 },
  footer: { padding: 12, paddingTop: 6 },
  done: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 38, borderRadius: 19, backgroundColor: "#FFFFFF" },
  doneText: { fontFamily: font.heavy, fontSize: 13, color: "#111" },
  body: { padding: 14, paddingTop: 6, paddingBottom: 8, gap: 12 },
  section: { fontFamily: font.bold, fontSize: 11, letterSpacing: 0.8, color: "rgba(255,255,255,0.45)" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { flexGrow: 1, flexBasis: 128, padding: 10, gap: 6, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)" },
  tileCompact: { flexBasis: 110, padding: 8 },
  tileLethal: { backgroundColor: "rgba(255,60,90,0.16)" },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 6 },
  tileLabel: { flex: 1, fontFamily: font.semibold, fontSize: 12, color: "rgba(255,255,255,0.75)" },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  step: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.1)" },
  value: { fontFamily: font.heavy, fontSize: 26, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  meter: { height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.1)", overflow: "hidden" },
  meterFill: { height: "100%", borderRadius: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.06)" },
  thumb: { width: 40, height: 40, borderRadius: 10 },
  thumbEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)" },
  rowTitle: { fontFamily: font.bold, fontSize: 14, color: "#FFFFFF" },
  rowHint: { fontFamily: font.medium, fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 1 },
  concede: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 40, borderRadius: 20, backgroundColor: "rgba(255,90,110,0.12)" },
  concedeText: { fontFamily: font.bold, fontSize: 14, color: "#FF8A9A" },
});

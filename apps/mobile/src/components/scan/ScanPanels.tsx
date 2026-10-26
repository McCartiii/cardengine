// Everything under the viewfinder: the card just matched, the running stack
// of scanned cards, and the sheets for reviewing the stack or fixing a match.
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from "react-native-reanimated";
import { haptic } from "@/lib/haptics";
import { color, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { formatUsd, setLabel } from "@/design/format";
import { addCollectionEvents, type ScanCandidate } from "@/lib/api";
import { candidatePrice, useScanStore, type Finish, type PendingScan } from "@/store/scanStore";
import { Button, CardArt, Sheet, Text, Touchable, tap } from "@/ui";

const GLASS = "rgba(14,15,21,0.9)";
const EDGE = "rgba(255,255,255,0.12)";
const MUTED = "rgba(255,255,255,0.6)";

function lineValue(p: PendingScan) {
  return (candidatePrice(p.candidate, p.finish) ?? 0) * p.quantity;
}

/** Totals for the cards waiting to be added. */
export function useStack() {
  const pending = useScanStore((s) => s.pending);
  const waiting = pending.filter((p) => !p.added);
  return {
    waiting,
    count: waiting.reduce((n, p) => n + p.quantity, 0),
    value: waiting.reduce((n, p) => n + lineValue(p), 0),
  };
}

/** Adds every waiting card to the binder, one collection event per card. */
export function useAddToBinder() {
  const { markAdded, clearAdded } = useScanStore();
  const [state, setState] = useState<"idle" | "adding" | "done" | "error">("idle");

  const add = useCallback(
    async (items: PendingScan[]) => {
      if (state === "adding" || items.length === 0) return false;
      setState("adding");
      const at = new Date().toISOString();
      const events = items.map((p, i) => ({
        id: `scan-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 8)}`,
        at,
        type: "add" as const,
        variantId: p.candidate.variantId,
        payload: { quantity: p.quantity, finish: p.finish },
      }));
      try {
        await addCollectionEvents(events);
        markAdded(items.map((p) => p.key));
        haptic.success();
        setState("done");
        setTimeout(() => {
          clearAdded();
          setState("idle");
        }, 1400);
        return true;
      } catch {
        setState("error");
        haptic.error();
        return false;
      }
    },
    [state, markAdded, clearAdded]
  );

  return { add, state };
}

// ── The card just matched ────────────────────────────────────────────────────

export function ResultCard({ scan, onWrongCard }: { scan: PendingScan; onWrongCard: () => void }) {
  const { incrementQty, decrementQty, setFinish, dismissResult } = useScanStore();
  const c = scan.candidate;
  const price = candidatePrice(c, scan.finish);
  const hasFoil = candidatePrice(c, "foil") != null || !!c.pricing;

  return (
    <Animated.View entering={FadeInDown.springify().damping(18)} exiting={FadeOutDown.duration(160)} layout={LinearTransition} style={styles.result}>
      <View style={styles.resultArt}>
        <CardArt uri={c.imageUri} name={c.name} foil={scan.finish === "foil"} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
          <Text style={styles.resultName} numberOfLines={2}>
            {c.name}
          </Text>
          <Pressable onPress={dismissResult} hitSlop={10} accessibilityRole="button" accessibilityLabel="Hide">
            <Ionicons name="close" size={18} color={MUTED} />
          </Pressable>
        </View>
        <Text variant="caption" color={MUTED} numberOfLines={1}>
          {[setLabel(c.setId, c.collectorNumber), c.rarity ? c.rarity[0].toUpperCase() + c.rarity.slice(1) : null].filter(Boolean).join(" · ")}
        </Text>
        <View style={styles.resultRow}>
          <Text style={[styles.resultPrice, c.pricing && { opacity: 0.4 }]}>{price != null ? formatUsd(price) : c.pricing ? "$ —" : "No price"}</Text>
          <FinishToggle value={scan.finish} foilAvailable={hasFoil} onChange={(f) => setFinish(scan.key, f)} />
        </View>
        <View style={styles.resultRow}>
          <Pressable onPress={onWrongCard} hitSlop={8} accessibilityRole="button" style={styles.wrong}>
            <Ionicons name="swap-horizontal" size={14} color={MUTED} />
            <Text variant="callout" color={MUTED}>
              Wrong card?
            </Text>
          </Pressable>
          <Stepper value={scan.quantity} onMinus={() => decrementQty(scan.key)} onPlus={() => incrementQty(scan.key)} />
        </View>
      </View>
    </Animated.View>
  );
}

function FinishToggle({ value, foilAvailable, onChange }: { value: Finish; foilAvailable: boolean; onChange: (f: Finish) => void }) {
  return (
    <View style={styles.finish} accessibilityRole="radiogroup">
      {(["nonfoil", "foil"] as const).map((f) => {
        const on = value === f;
        const disabled = f === "foil" && !foilAvailable && !on;
        return (
          <Pressable
            key={f}
            disabled={disabled}
            onPress={() => {
              tap();
              onChange(f);
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            style={[styles.finishOption, on && styles.finishOn, disabled && { opacity: 0.35 }]}
          >
            {f === "foil" && <Ionicons name="sparkles" size={11} color={on ? "#0E0F13" : "#FFFFFF"} />}
            <Text style={[styles.finishText, on && { color: "#0E0F13" }]}>{f === "foil" ? "Foil" : "Normal"}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Stepper({ value, onMinus, onPlus, light }: { value: number; onMinus: () => void; onPlus: () => void; light?: boolean }) {
  const fg = light ? color.ink : "#FFFFFF";
  return (
    <View style={[styles.stepper, light && { backgroundColor: color.surface2 }]}>
      <Pressable
        onPress={() => {
          tap();
          onMinus();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={value === 1 ? "Remove" : "One fewer"}
        style={styles.stepBtn}
      >
        <Ionicons name={value === 1 ? "trash-outline" : "remove"} size={16} color={fg} />
      </Pressable>
      <Text style={[styles.stepValue, { color: fg }]}>{value}</Text>
      <Pressable
        onPress={() => {
          tap();
          onPlus();
        }}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="One more"
        style={styles.stepBtn}
      >
        <Ionicons name="add" size={16} color={fg} />
      </Pressable>
    </View>
  );
}

// ── The running stack ────────────────────────────────────────────────────────

export function SessionBar({ onReview, onAdd, adding }: { onReview: () => void; onAdd: () => void; adding: "idle" | "adding" | "done" | "error" }) {
  const { waiting, count, value } = useStack();
  if (count === 0 && adding !== "done") {
    return (
      <View style={[styles.session, styles.sessionEmpty]}>
        <Ionicons name="layers-outline" size={18} color={MUTED} />
        <Text variant="callout" color={MUTED} style={{ fontFamily: font.medium }}>
          Scanned cards stack up here
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.session}>
      <Touchable onPress={onReview} accessibilityRole="button" accessibilityLabel={`Review ${count} scanned cards`} pressedScale={0.97} style={styles.sessionLeft}>
        <View style={styles.stackThumbs}>
          {waiting.slice(0, 3).reverse().map((p, i, arr) => (
            <View key={p.key} style={[styles.stackThumb, { left: i * 9, transform: [{ rotate: `${(i - (arr.length - 1)) * 6}deg` }] }]}>
              <CardArt uri={p.candidate.imageUri} name={p.candidate.name} />
            </View>
          ))}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.sessionCount}>{adding === "done" ? "Added to binder" : `${count} ${count === 1 ? "card" : "cards"}`}</Text>
          <Text variant="caption" color={MUTED} numberOfLines={1}>
            {adding === "done" ? "Nice haul" : adding === "error" ? "Couldn't add. Tap Add to retry" : `${formatUsd(value)} · Review`}
          </Text>
        </View>
      </Touchable>
      <Touchable onPress={onAdd} disabled={adding === "adding" || count === 0} accessibilityRole="button" pressedScale={0.95} style={styles.addButton}>
        {adding === "done" ? <Ionicons name="checkmark" size={18} color="#0E0F13" /> : <Ionicons name="add" size={18} color="#0E0F13" />}
        <Text style={styles.addText}>{adding === "adding" ? "Adding…" : adding === "done" ? "Done" : "Add"}</Text>
      </Touchable>
    </View>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────────────

export function ReviewSheet({ visible, onClose, onAdd, adding }: { visible: boolean; onClose: () => void; onAdd: () => void; adding: boolean }) {
  const { incrementQty, decrementQty } = useScanStore();
  const { waiting, count, value } = useStack();
  return (
    <Sheet visible={visible} onClose={onClose} title="Scanned cards" subtitle={`${count} ${count === 1 ? "card" : "cards"} · ${formatUsd(value)}`}>
      <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: space.sm }}>
        {waiting.map((p) => {
          const price = candidatePrice(p.candidate, p.finish);
          return (
            <View key={p.key} style={styles.reviewRow}>
              <View style={styles.reviewArt}>
                <CardArt uri={p.candidate.imageUri} name={p.candidate.name} foil={p.finish === "foil"} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {p.candidate.name}
                </Text>
                <Text variant="caption" color={color.textSecondary} numberOfLines={1}>
                  {[setLabel(p.candidate.setId, p.candidate.collectorNumber), p.finish === "foil" ? "Foil" : null, price != null ? formatUsd(price) : null]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <Stepper light value={p.quantity} onMinus={() => decrementQty(p.key)} onPlus={() => incrementQty(p.key)} />
            </View>
          );
        })}
      </ScrollView>
      <Button label={adding ? "Adding…" : `Add ${count} to binder`} size="lg" onPress={onAdd} disabled={count === 0} loading={adding} />
    </Sheet>
  );
}

export function AlternativesSheet({ scan, onClose }: { scan: PendingScan | null; onClose: () => void }) {
  const replaceCandidate = useScanStore((s) => s.replaceCandidate);
  const pick = (c: ScanCandidate) => {
    if (scan) replaceCandidate(scan.key, c);
    tap();
    onClose();
  };
  return (
    <Sheet visible={!!scan} onClose={onClose} title="Pick the right card" subtitle={scan ? `Scanned as ${scan.candidate.name}` : undefined}>
      {scan && scan.alternatives.length === 0 ? (
        <Text variant="body" color={color.textSecondary}>
          No other printings or close matches. Try scanning again with the whole card in the frame.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: space.sm }}>
          {scan?.alternatives.map((c) => {
            const price = candidatePrice(c, scan.finish);
            const samePrinting = c.cardId === scan.candidate.cardId;
            return (
              <Touchable key={c.variantId} onPress={() => pick(c)} accessibilityRole="button" pressedScale={0.98} style={styles.reviewRow}>
                <View style={styles.reviewArt}>
                  <CardArt uri={c.imageUri} name={c.name} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text variant="caption" color={color.textSecondary} numberOfLines={1}>
                    {[samePrinting ? "Other printing" : "Close match", setLabel(c.setId, c.collectorNumber)].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Text variant="price">{price != null ? formatUsd(price) : "—"}</Text>
              </Touchable>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  result: {
    flexDirection: "row",
    gap: 14,
    padding: 12,
    borderRadius: 22,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGE,
  },
  resultArt: {
    width: 78,
    alignSelf: "flex-start",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  resultName: { flex: 1, fontFamily: font.bold, fontSize: 16, lineHeight: 20, color: "#FFFFFF" },
  resultRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: 6 },
  resultPrice: { fontFamily: font.heavy, fontSize: 22, letterSpacing: -0.6, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  finish: { flexDirection: "row", padding: 2, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.08)" },
  finishOption: { flexDirection: "row", alignItems: "center", gap: 3, height: 26, paddingHorizontal: 10, borderRadius: 12 },
  finishOn: { backgroundColor: "#FFFFFF" },
  finishText: { fontFamily: font.semibold, fontSize: 12, color: "#FFFFFF" },
  wrong: { flexDirection: "row", alignItems: "center", gap: 5 },
  stepper: { flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.08)" },
  stepBtn: { width: 32, height: 30, alignItems: "center", justifyContent: "center" },
  stepValue: { minWidth: 18, textAlign: "center", fontFamily: font.bold, fontSize: 14, fontVariant: ["tabular-nums"] },
  session: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    height: 64,
    paddingLeft: 10,
    paddingRight: 8,
    borderRadius: 32,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EDGE,
  },
  sessionEmpty: { justifyContent: "center", gap: space.sm },
  sessionLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, minWidth: 0 },
  stackThumbs: { width: 52, height: 48 },
  stackThumb: { position: "absolute", top: 2, width: 32, shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  sessionCount: { fontFamily: font.bold, fontSize: 15, color: "#FFFFFF" },
  addButton: { flexDirection: "row", alignItems: "center", gap: 4, height: 48, paddingHorizontal: 18, borderRadius: 24, backgroundColor: "#FFFFFF" },
  addText: { fontFamily: font.bold, fontSize: 15, color: "#0E0F13" },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 4 },
  reviewArt: { width: 40 },
});

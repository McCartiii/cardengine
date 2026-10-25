// The Analysis tab: the deck's curve, types, colors, roles and land odds,
// with plain suggestions and the way into the opening-hand tester.
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { color, elevation, hairline, mana, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { analyzeDeck, type AnalysisCard, type Color, type RoleCheck } from "@/lib/deckAnalysis";
import { Button, Text } from "@/ui";

const pct = (n: number) => `${Math.round(n * 100)}%`;

export function DeckAnalysisView({ cards, format, onTestHand }: { cards: AnalysisCard[]; format: string; onTestHand: () => void }) {
  const a = useMemo(() => analyzeDeck(cards, format), [cards, format]);

  if (a.total === 0) {
    return (
      <View style={styles.empty}>
        <Ionicons name="analytics-outline" size={36} color={color.textTertiary} />
        <Text variant="body" color={color.textSecondary} align="center">
          Add or import cards to see the deck's curve, colors and odds.
        </Text>
      </View>
    );
  }

  const maxBar = Math.max(1, ...a.curve.map((b) => b.creatures + b.spells));

  return (
    <View style={styles.page}>
      <View style={[styles.card, styles.handCard]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="headline">Opening hand</Text>
          <Text variant="caption" color={color.textSecondary}>
            {pct(a.openingHand.twoToFourLands)} of 7-card hands have 2–4 lands
          </Text>
        </View>
        <Button label="Test a hand" icon="hand-left-outline" onPress={onTestHand} disabled={a.openingHand.library < 7} />
      </View>

      <View style={styles.stats}>
        <Stat label="Avg mana value" value={a.averageMv.toFixed(2)} />
        <Stat label="Lands" value={String(a.lands)} />
        <Stat label="Spells" value={String(a.nonLands)} />
      </View>

      <Section title="Mana curve">
        <View style={styles.curve}>
          {a.curve.map((b) => {
            const n = b.creatures + b.spells;
            return (
              <View key={b.mv} style={styles.curveCol} accessibilityLabel={`Mana value ${b.mv}: ${n} cards`}>
                <Text variant="number" color={n ? color.ink : color.textTertiary}>
                  {n || ""}
                </Text>
                <View style={styles.barTrack}>
                  <View style={{ height: `${(b.spells / maxBar) * 100}%`, backgroundColor: "#B9A8FF", borderTopLeftRadius: 4, borderTopRightRadius: 4 }} />
                  <View style={{ height: `${(b.creatures / maxBar) * 100}%`, backgroundColor: color.accent, borderTopLeftRadius: b.spells ? 0 : 4, borderTopRightRadius: b.spells ? 0 : 4 }} />
                </View>
                <Text variant="caption" color={color.textSecondary}>
                  {b.mv}
                </Text>
              </View>
            );
          })}
        </View>
        <View style={styles.legend}>
          <Legend swatch={color.accent} label="Creatures" />
          <Legend swatch="#B9A8FF" label="Other spells" />
        </View>
      </Section>

      <Section title="Roles" hint={`Typical ranges for ${format}`}>
        {a.roles.map((r) => (
          <RoleRow key={r.role} r={r} />
        ))}
      </Section>

      {a.colors.length > 0 && (
        <Section title="Colors" hint="Mana symbols in your costs vs. sources that make each color">
          {a.colors.map((c) => {
            const pipTotal = a.colors.reduce((n, x) => n + x.pips, 0) || 1;
            const srcTotal = a.colors.reduce((n, x) => n + x.sources, 0) || 1;
            return <ColorRow key={c.color} c={c.color} need={c.pips / pipTotal} have={c.sources / srcTotal} pips={c.pips} sources={c.sources} />;
          })}
        </Section>
      )}

      <Section title="Card types">
        <View style={styles.types}>
          {a.types.map((t) => (
            <View key={t.type} style={styles.typeChip}>
              <Text variant="callout">{t.type}</Text>
              <Text variant="number" color={color.textSecondary}>
                {t.count}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      {a.suggestions.length > 0 && (
        <Section title="Suggestions">
          {a.suggestions.map((s) => (
            <View key={s} style={styles.suggestion}>
              <Ionicons name="bulb-outline" size={16} color={color.accent} style={{ marginTop: 2 }} />
              <Text variant="body" style={{ flex: 1 }}>
                {s}
              </Text>
            </View>
          ))}
        </Section>
      )}

      <Text variant="caption" color={color.textTertiary} align="center" style={{ marginTop: space.sm }}>
        Roles are read from each card's rules text, so a few cards may be miscounted.
      </Text>
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <View style={{ marginBottom: space.md, gap: 2 }}>
        <Text variant="headline">{title}</Text>
        {hint && (
          <Text variant="caption" color={color.textSecondary}>
            {hint}
          </Text>
        )}
      </View>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={[styles.card, styles.stat]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text variant="caption" color={color.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: swatch }} />
      <Text variant="caption" color={color.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

const STATUS = {
  low: { label: "Low", fg: "#B26A00", bg: "#FFF3DC" },
  good: { label: "Good", fg: color.positive, bg: color.positiveSoft },
  high: { label: "High", fg: color.textSecondary, bg: color.surface2 },
} as const;

function RoleRow({ r }: { r: RoleCheck }) {
  const s = STATUS[r.status];
  // The bar runs to a little past the top of the range.
  const scale = Math.max(r.max * 1.25, r.count, 1);
  return (
    <View style={styles.roleRow}>
      <View style={{ width: 92 }}>
        <Text variant="bodyStrong">{r.label}</Text>
        <Text variant="caption" color={color.textTertiary}>
          {r.min}–{r.max}
        </Text>
      </View>
      <View style={styles.roleTrack}>
        <View style={[styles.roleRange, { left: `${(r.min / scale) * 100}%`, width: `${((r.max - r.min) / scale) * 100}%` }]} />
        <View style={[styles.roleFill, { width: `${Math.min(1, r.count / scale) * 100}%`, backgroundColor: r.status === "low" ? "#F2A93B" : color.accent }]} />
      </View>
      <Text variant="number" style={styles.roleCount}>
        {r.count}
      </Text>
      <View style={[styles.statusPill, { backgroundColor: s.bg }]}>
        <Text variant="number" color={s.fg} style={{ fontSize: 11 }}>
          {s.label}
        </Text>
      </View>
    </View>
  );
}

const COLOR_LABEL: Record<Color, string> = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };

function ColorRow({ c, need, have, pips, sources }: { c: Color; need: number; have: number; pips: number; sources: number }) {
  return (
    <View style={styles.colorRow}>
      <View style={[styles.pip, { backgroundColor: mana[c] }]}>
        <Text variant="number" color={c === "W" ? color.ink : "#FFFFFF"}>
          {c}
        </Text>
      </View>
      <View style={{ flex: 1, gap: 5 }}>
        <Text variant="callout">{COLOR_LABEL[c]}</Text>
        <Bar value={need} tint={mana[c]} label={`${pct(need)} of symbols (${pips})`} />
        <Bar value={have} tint={mana[c]} faded label={`${pct(have)} of sources (${sources})`} />
      </View>
    </View>
  );
}

function Bar({ value, tint, faded, label }: { value: number; tint: string; faded?: boolean; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={styles.colorTrack}>
        <View style={{ width: `${Math.max(2, value * 100)}%`, height: "100%", borderRadius: 4, backgroundColor: tint, opacity: faded ? 0.45 : 1, borderWidth: tint === mana.W ? StyleSheet.hairlineWidth : 0, borderColor: color.borderStrong }} />
      </View>
      <Text variant="caption" color={color.textSecondary} style={{ width: 128 }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: space.lg, gap: space.md },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, ...hairline, ...elevation.card },
  handCard: { flexDirection: "row", alignItems: "center", gap: space.md },
  stats: { flexDirection: "row", gap: space.sm },
  stat: { flex: 1, padding: space.md, gap: 2 },
  statValue: { fontFamily: font.heavy, fontSize: 22, letterSpacing: -0.5, color: color.ink, fontVariant: ["tabular-nums"] },
  curve: { flexDirection: "row", alignItems: "flex-end", gap: 8, height: 150 },
  curveCol: { flex: 1, alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" },
  barTrack: { width: "100%", flex: 1, justifyContent: "flex-end" },
  legend: { flexDirection: "row", gap: space.lg, marginTop: space.md },
  roleRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 7 },
  roleTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: "hidden" },
  roleRange: { position: "absolute", top: 0, bottom: 0, backgroundColor: "rgba(14,138,79,0.18)" },
  roleFill: { height: "100%", borderRadius: 4 },
  roleCount: { width: 26, textAlign: "right", fontSize: 14 },
  statusPill: { width: 46, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  colorRow: { flexDirection: "row", gap: space.md, paddingVertical: 6 },
  pip: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 2 },
  colorTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: color.surface2, overflow: "hidden" },
  types: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  typeChip: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: color.surface2 },
  suggestion: { flexDirection: "row", gap: space.sm, paddingVertical: 4 },
  empty: { alignItems: "center", gap: space.md, padding: space.xxl, paddingTop: 60 },
});

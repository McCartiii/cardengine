import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Image,
  RefreshControl,
  ActivityIndicator,
  type ViewStyle,
} from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import { colors, spacing, radii, typography, shadows, tabColors } from "../../theme";
import { Header } from "../../components/ui/Header";
import { Badge } from "../../components/ui/Badge";
import { Card } from "../../components/ui/Card";

const t = colors.light;
const tc = tabColors.decks;
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeckSuggestion {
  commander: {
    name: string;
    variantId: string;
    imageUri: string | null;
    colorIdentity: string[];
  };
  ownedCardsInIdentity: number;
  edhrecDecks: number;
  themes: string[];
  estimatedBudgetToComplete: number;
}

interface CardRecommendation {
  name: string;
  variantId: string | null;
  synergy: number;
  inclusionRate: number;
  owned: boolean;
  priceUsd: number | null;
  imageUri: string | null;
  typeLine: string | null;
  manaCost: string | null;
  category: string;
  reason: string;
}

type ScreenMode = "discover" | "recs";

const MANA_BADGE_VARIANT: Record<string, "mana-W" | "mana-U" | "mana-B" | "mana-R" | "mana-G"> = {
  W: "mana-W",
  U: "mana-U",
  B: "mana-B",
  R: "mana-R",
  G: "mana-G",
};

const MANA_DOT_COLOR: Record<string, string> = {
  W: t.manaW,
  U: t.manaU,
  B: t.manaB,
  R: t.manaR,
  G: t.manaG,
};

const MANA_DOT_BORDER: Record<string, string> = {
  W: t.manaWText,
  U: t.manaUText,
  B: t.manaBText,
  R: t.manaRText,
  G: t.manaGText,
};

// ── Component ──────────────────────────────────────────────────────────────────

export function DeckAdvisorTab() {
  const { session } = useAuth();
  const [mode, setMode] = useState<ScreenMode>("discover");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Discover mode state
  const [suggestions, setSuggestions] = useState<DeckSuggestion[]>([]);

  // Recs mode state
  const [selectedCommander, setSelectedCommander] = useState<string | null>(null);
  const [recs, setRecs] = useState<CardRecommendation[]>([]);

  const getAuthHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session]);

  // ── Fetch suggestions ──

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/v1/deck/suggest`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({}),
      });
      if (res.status === 401) {
        setError("Sign in to discover deck ideas from your collection.");
        return;
      }
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load suggestions");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (session) fetchSuggestions();
  }, [session, fetchSuggestions]);

  // ── Fetch recs for commander ──

  const fetchRecs = useCallback(
    async (commanderName: string) => {
      setSelectedCommander(commanderName);
      setMode("recs");
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/v1/deck/recs`, {
          method: "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            commanderName,
            currentCards: [],
          }),
        });
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setRecs(data.recommendations ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load recommendations");
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders]
  );

  // ── Render: Discover mode ──

  const renderSuggestion = ({ item }: { item: DeckSuggestion }) => (
    <Card
      onPress={() => fetchRecs(item.commander.name)}
      style={styles.suggestionCard}
    >
      {item.commander.imageUri && (
        <Image
          source={{ uri: item.commander.imageUri }}
          style={styles.commanderImage}
        />
      )}
      <View style={styles.suggestionInfo}>
        <Text style={styles.commanderName} numberOfLines={1}>
          {item.commander.name}
        </Text>
        <View style={styles.colorRow}>
          {item.commander.colorIdentity.map((c) => (
            <View
              key={c}
              style={[
                styles.colorDot,
                {
                  backgroundColor: MANA_DOT_COLOR[c] ?? t.surfaceSunken,
                  borderColor: MANA_DOT_BORDER[c] ?? t.border,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.ownedCardsInIdentity}</Text>
            <Text style={styles.statLabel}>Owned</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {item.edhrecDecks > 0 ? `${(item.edhrecDecks / 1000).toFixed(1)}k` : "N/A"}
            </Text>
            <Text style={styles.statLabel}>Decks</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: tc.color }]}>
              {item.estimatedBudgetToComplete > 0
                ? `$${item.estimatedBudgetToComplete.toFixed(0)}`
                : "N/A"}
            </Text>
            <Text style={styles.statLabel}>Budget</Text>
          </View>
        </View>
        {item.themes.length > 0 && (
          <View style={styles.themeRow}>
            {item.themes.slice(0, 3).map((theme) => (
              <Badge key={theme} variant="default">{theme}</Badge>
            ))}
          </View>
        )}
      </View>
    </Card>
  );

  // ── Render: Recs mode ──

  const renderRec = ({ item }: { item: CardRecommendation }) => (
    <Card style={styles.recCard}>
      <View style={styles.recInfo}>
        <View style={styles.recNameRow}>
          <Text style={styles.recName} numberOfLines={1}>
            {item.name}
          </Text>
          {item.owned && (
            <Badge variant="success">OWNED</Badge>
          )}
        </View>
        <Text style={styles.recReason} numberOfLines={1}>
          {item.reason}
        </Text>
      </View>
      <View style={styles.recRight}>
        <Badge variant="accent">
          {`+${Math.round(item.synergy * 100)}%`}
        </Badge>
        {item.priceUsd != null && (
          <Text style={styles.recPrice}>
            ${item.priceUsd.toFixed(2)}
          </Text>
        )}
      </View>
    </Card>
  );

  // ── Main render ──

  if (!session) {
    return (
      <View style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Deck Advisor</Text>
          <Text style={styles.emptyText}>
            Sign in to discover commander deck ideas from your collection.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      {mode === "discover" ? (
        <Header
          title="Deck Advisor"
          subtitle="Commander ideas from your collection, powered by EDHREC."
        />
      ) : (
        <Header
          title={selectedCommander ?? "Recommendations"}
          onBack={() => {
            setMode("discover");
            setRecs([]);
            setSelectedCommander(null);
          }}
        />
      )}

      {/* Loading */}
      {loading && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tc.color} />
          <Text style={styles.loadingText}>
            {mode === "discover"
              ? "Scanning collection..."
              : "Fetching recommendations..."}
          </Text>
        </View>
      )}

      {/* Error */}
      {error && !loading && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Discover mode */}
      {!loading && mode === "discover" && (
        <FlatList
          data={suggestions}
          keyExtractor={(item) => item.commander.variantId}
          renderItem={renderSuggestion}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={fetchSuggestions}
              tintColor={tc.color}
            />
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>No suggestions yet</Text>
                <Text style={styles.emptyText}>
                  Add legendary creatures to your collection to see deck ideas here.
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* Recs mode */}
      {!loading && mode === "recs" && (
        <FlatList
          data={recs}
          keyExtractor={(item) => item.name}
          renderItem={renderRec}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            recs.length > 0 ? (
              <Text style={styles.recsHeader}>
                {recs.length} card suggestions for {selectedCommander}
              </Text>
            ) : null
          }
          ListEmptyComponent={
            !error ? (
              <View style={styles.centered}>
                <Text style={styles.emptyText}>
                  No recommendations found for this commander.
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing["3xl"],
    paddingTop: spacing["4xl"],
  },
  loadingText: {
    color: t.textSecondary,
    marginTop: spacing.md,
    ...typography.caption,
  },
  errorBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: t.dangerLight,
    borderWidth: 1,
    borderColor: t.danger,
    borderRadius: radii.md,
  },
  errorText: {
    color: t.dangerText,
    ...typography.caption,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing["3xl"],
  },
  emptyTitle: {
    ...typography.heading,
    color: t.textPrimary,
    marginBottom: spacing.sm,
  },
  emptyText: {
    ...typography.caption,
    color: t.textSecondary,
    textAlign: "center",
  },

  // Suggestion cards
  suggestionCard: {
    flexDirection: "row",
    marginBottom: spacing.md,
    padding: 0,
    overflow: "hidden",
  } as ViewStyle,
  commanderImage: {
    width: 90,
    height: 130,
    borderTopLeftRadius: radii.lg,
    borderBottomLeftRadius: radii.lg,
  },
  suggestionInfo: {
    flex: 1,
    padding: spacing.md,
    justifyContent: "center",
  },
  commanderName: {
    ...typography.body,
    fontWeight: "700",
    color: t.textPrimary,
    marginBottom: spacing.xs,
  },
  colorRow: {
    flexDirection: "row",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  colorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginBottom: spacing.sm,
  },
  stat: { alignItems: "center" },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: t.success,
  },
  statLabel: {
    ...typography.small,
    color: t.textMuted,
    marginTop: 1,
  },
  themeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },

  // Rec cards
  recCard: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.sm,
  } as ViewStyle,
  recInfo: { flex: 1, marginRight: spacing.sm },
  recNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recName: {
    ...typography.body,
    fontWeight: "600",
    color: t.textPrimary,
    flex: 1,
  },
  recReason: {
    ...typography.small,
    color: t.textSecondary,
    marginTop: 2,
  },
  recRight: { alignItems: "flex-end", gap: spacing.xs },
  recPrice: {
    ...typography.small,
    color: t.textMuted,
    marginTop: spacing.xs,
  },
  recsHeader: {
    ...typography.caption,
    color: t.textSecondary,
    marginBottom: spacing.md,
    paddingTop: spacing.xs,
  },
});

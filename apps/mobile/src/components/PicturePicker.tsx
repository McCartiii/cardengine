// Choose a picture: a photo from the phone, or any card's art. Used for
// life counter players and the profile picture.
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, hairline, radius, space } from "@/design/tokens";
import { searchCards } from "@/lib/api";
import { artCrop } from "@/lib/pictures";
import { SearchField, Text, Touchable, tap } from "@/ui";

const SUGGESTIONS = ["Dragon", "Angel", "Elf", "Planeswalker", "Island", "Sliver", "Demon", "Goblin"];

export interface PickerOption {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  onPress: () => void | Promise<void>;
  destructive?: boolean;
}

interface Result {
  key: string;
  name: string;
  art: string;
}

export function PicturePicker({
  visible,
  title,
  current,
  options,
  onPickCard,
  onClose,
}: {
  visible: boolean;
  title: string;
  current?: string | null;
  /** Buttons above the card search, e.g. choose a photo, remove. */
  options: PickerOption[];
  onPickCard: (art: string, name: string) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { cards } = await searchCards(q, 40);
        if (n !== seq.current) return;
        const seen = new Set<string>();
        setResults(
          cards.flatMap((c) => {
            if (!c.imageUri) return [];
            const art = artCrop(c.imageUri);
            if (seen.has(art)) return [];
            seen.add(art);
            return [{ key: c.variantId, name: c.name, art }];
          })
        );
      } catch {
        if (n === seq.current) setResults([]);
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, visible]);

  const runOption = async (o: PickerOption) => {
    tap();
    setBusy(o.key);
    try {
      await o.onPress();
    } catch (e) {
      Alert.alert("Couldn't use that picture", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const tile = Math.floor((width - space.lg * 2 - space.sm) / 2);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: space.lg }]}>
        <View style={styles.header}>
          {current ? <Image source={{ uri: current }} style={styles.current} contentFit="cover" /> : null}
          <Text variant="section" style={{ flex: 1 }}>
            {title}
          </Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={20} color={color.ink} />
          </Pressable>
        </View>

        <View style={styles.options}>
          {options.map((o) => (
            <Touchable key={o.key} onPress={() => runOption(o)} style={[styles.option, o.destructive && styles.optionDanger]} accessibilityRole="button">
              {busy === o.key ? <ActivityIndicator color={color.ink} /> : <Ionicons name={o.icon} size={20} color={o.destructive ? color.negative : color.ink} />}
              <Text variant="callout" color={o.destructive ? color.negative : color.ink} numberOfLines={1}>
                {o.label}
              </Text>
            </Touchable>
          ))}
        </View>

        <Text variant="headline" style={{ paddingHorizontal: space.lg, marginTop: space.lg }}>
          Card art
        </Text>
        <View style={{ paddingHorizontal: space.lg, marginTop: space.sm }}>
          <SearchField value={query} onChangeText={setQuery} placeholder="Search any card" loading={loading} />
        </View>

        {query.trim().length < 2 ? (
          <View style={styles.suggestions}>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} onPress={() => setQuery(s)} style={styles.suggestion} accessibilityRole="button">
                <Text variant="callout">{s}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r.key}
            numColumns={2}
            columnWrapperStyle={{ gap: space.sm }}
            contentContainerStyle={{ padding: space.lg, gap: space.sm, paddingBottom: insets.bottom + space.xl }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              loading ? undefined : (
                <Text variant="body" color={color.textSecondary} align="center" style={{ marginTop: space.xl }}>
                  No cards found for “{query.trim()}”.
                </Text>
              )
            }
            renderItem={({ item }) => (
              <Touchable
                onPress={() => {
                  tap();
                  onPickCard(item.art, item.name);
                }}
                style={{ width: tile }}
                accessibilityRole="button"
                accessibilityLabel={`Use the art of ${item.name}`}
              >
                <Image source={{ uri: item.art }} style={[styles.art, { width: tile, height: tile * 0.73 }]} contentFit="cover" transition={150} />
                <Text variant="caption" color={color.textSecondary} numberOfLines={1} style={{ marginTop: 4 }}>
                  {item.name}
                </Text>
              </Touchable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg },
  current: { width: 44, height: 44, borderRadius: 12 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: color.surface3 },
  options: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingHorizontal: space.lg, marginTop: space.lg },
  option: { flexGrow: 1, flexBasis: "45%", flexDirection: "row", alignItems: "center", gap: space.sm, height: 52, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: color.surface, ...hairline },
  optionDanger: { backgroundColor: color.negativeSoft },
  suggestions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, padding: space.lg },
  suggestion: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 16, backgroundColor: color.surface2 },
  art: { borderRadius: radius.md, backgroundColor: color.surface3 },
});

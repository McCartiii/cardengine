import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
// The SDK 58 top-level API is class-based; these call sites use the classic functions.
import * as FileSystem from "expo-file-system/legacy";
import { Ionicons } from "@expo/vector-icons";
import { color, elevation, hairline, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { MAIN_BINDER, importCollection, listBinders, type Binder, type ImportSummary } from "@/lib/api";
import { useSettings } from "@/store/settingsStore";
import { BINDER_LOOK } from "@/components/binder/BinderSheet";
import { Button, CardArt, Chip, FieldLabel, IconBubble, PageHeader, Screen, Segmented, Text, Touchable } from "@/ui";

const MAX_BYTES = 10 * 1024 * 1024;
const APPS = ["Moxfield", "ManaBox", "TCGplayer", "Deckbox", "Archidekt", "Dragon Shield", "a card list"];

type Source = { kind: "file"; name: string; text: string } | { kind: "paste"; text: string };

async function readPicked(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (asset.size != null && asset.size > MAX_BYTES) throw new Error("That file is over 10 MB. Split it and import it in parts.");
  if (Platform.OS === "web") return asset.file ? asset.file.text() : (await fetch(asset.uri)).text();
  return FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
}

export default function ImportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ binderId?: string }>();
  const setActiveBinder = useSettings((s) => s.setActiveBinder);
  const [binders, setBinders] = useState<Binder[]>([{ id: MAIN_BINDER, name: "Collection", kind: "collection" }]);
  const [binderId, setBinderId] = useState(params.binderId ?? MAIN_BINDER);
  const [source, setSource] = useState<Source | null>(null);
  const [pasting, setPasting] = useState(false);
  const [paste, setPaste] = useState("");
  const [mode, setMode] = useState<"add" | "replace">("add");
  const [preview, setPreview] = useState<ImportSummary | null>(null);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showMissing, setShowMissing] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    listBinders({ stats: false })
      .then(({ binders: list }) => setBinders(list))
      .catch(() => {});
  }, []);

  const binder = binders.find((b) => b.id === binderId) ?? binders[0];

  // Check what's in the file as soon as there is one.
  const check = useCallback(
    async (src: Source) => {
      const n = ++seq.current;
      setChecking(true);
      setError(null);
      setPreview(null);
      try {
        const r = await importCollection({ text: src.text, binderId, mode: "add", dryRun: true });
        if (n === seq.current) setPreview(r);
      } catch (e) {
        if (n === seq.current) setError((e as Error).message);
      } finally {
        if (n === seq.current) setChecking(false);
      }
    },
    [binderId]
  );

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: "*/*", copyToCacheDirectory: true, multiple: false });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const text = await readPicked(asset);
      const src: Source = { kind: "file", name: asset.name, text };
      setPasting(false);
      setSource(src);
      check(src);
    } catch (e) {
      Alert.alert("Couldn't open that file", (e as Error).message);
    }
  };

  const checkPaste = () => {
    const src: Source = { kind: "paste", text: paste };
    setSource(src);
    check(src);
  };

  const runImport = async () => {
    if (!source) return;
    setImporting(true);
    try {
      const r = await importCollection({ text: source.text, binderId, mode, dryRun: false });
      setDone(r);
    } catch (e) {
      Alert.alert("Import failed", (e as Error).message);
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = () => {
    if (mode !== "replace") return void runImport();
    Alert.alert(`Replace everything in ${binder.name}?`, "The cards in it now are removed and the file's cards take their place.", [
      { text: "Cancel", style: "cancel" },
      { text: "Replace", style: "destructive", onPress: runImport },
    ]);
  };

  const reset = () => {
    setSource(null);
    setPreview(null);
    setDone(null);
    setPaste("");
    setPasting(false);
    setError(null);
    setMode("add");
  };

  if (done) {
    return (
      <Screen>
        <PageHeader title="Import cards" back />
        <View style={styles.done}>
          <IconBubble icon="checkmark" tint="green" size={84} />
          <Text variant="section" align="center">
            {done.matchedCopies.toLocaleString()} cards imported
          </Text>
          <Text variant="body" color={color.textSecondary} align="center">
            Into {binder.name}
            {done.unmatchedCount ? ` · ${done.unmatchedCount} rows we couldn't match were skipped` : ""}
          </Text>
          <Button
            label={`Open ${binder.name}`}
            size="lg"
            onPress={() => {
              setActiveBinder(binder.id, binder.name);
              router.navigate("/(tabs)/collection");
            }}
            style={{ alignSelf: "stretch", marginTop: space.lg }}
          />
          <Button label="Import another file" variant="ghost" onPress={reset} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <PageHeader title="Import cards" subtitle="Bring your collection from another app" back />

        <View style={styles.section}>
          <FieldLabel>Into</FieldLabel>
          <View style={styles.chips}>
            {binders.map((b) => (
              <Chip
                key={b.id}
                label={b.name}
                icon={(BINDER_LOOK[b.kind] ?? BINDER_LOOK.custom).icon}
                active={b.id === binderId}
                onPress={() => {
                  setBinderId(b.id);
                  if (source) check(source);
                }}
              />
            ))}
          </View>
        </View>

        {!source && (
          <View style={[styles.section, { gap: space.md }]}>
            <Touchable onPress={pickFile} style={[styles.card, styles.pick]} pressedScale={0.98} accessibilityRole="button">
              <IconBubble icon="document-text" tint="violet" size={52} />
              <View style={{ flex: 1 }}>
                <Text variant="headline">Choose a CSV file</Text>
                <Text variant="caption" color={color.textSecondary}>
                  Export your collection from the other app, then pick the file here.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
            </Touchable>

            {pasting ? (
              <View style={[styles.card, { gap: space.md }]}>
                <TextInput
                  value={paste}
                  onChangeText={setPaste}
                  multiline
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder={"4 Lightning Bolt\n1 Sol Ring (C21) 263\n1 Rhystic Study *F*"}
                  placeholderTextColor={color.textTertiary}
                  selectionColor={color.accent}
                  style={styles.paste}
                />
                <Button label="Check list" onPress={checkPaste} disabled={!paste.trim()} />
              </View>
            ) : (
              <Touchable onPress={() => setPasting(true)} style={[styles.card, styles.pick]} pressedScale={0.98} accessibilityRole="button">
                <IconBubble icon="clipboard" tint="blue" size={52} />
                <View style={{ flex: 1 }}>
                  <Text variant="headline">Paste a list</Text>
                  <Text variant="caption" color={color.textSecondary}>
                    One card per line, like “4 Lightning Bolt”.
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />
              </Touchable>
            )}

            <Text variant="caption" color={color.textTertiary} style={{ paddingHorizontal: space.xs }}>
              Works with exports from {APPS.slice(0, -1).join(", ")} and {APPS[APPS.length - 1]}.
            </Text>
          </View>
        )}

        {source && (
          <View style={[styles.section, { gap: space.md }]}>
            <View style={[styles.card, styles.fileRow]}>
              <Ionicons name={source.kind === "file" ? "document-text" : "clipboard"} size={20} color={color.accent} />
              <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                {source.kind === "file" ? source.name : "Pasted list"}
              </Text>
              <Button label="Change" variant="ghost" onPress={reset} />
            </View>

            {checking && (
              <View style={[styles.card, { alignItems: "center", gap: space.sm, paddingVertical: space.xxl }]}>
                <Text variant="bodyStrong">Reading your cards…</Text>
                <Text variant="caption" color={color.textSecondary}>
                  Matching each one to its printing
                </Text>
              </View>
            )}

            {error && (
              <View style={[styles.card, styles.errorCard]}>
                <Ionicons name="alert-circle" size={20} color={color.negative} />
                <Text variant="callout" color={color.negative} style={{ flex: 1 }}>
                  {error}
                </Text>
              </View>
            )}

            {preview && (
              <>
                <View style={[styles.card, { gap: space.lg }]}>
                  <Text variant="caption" color={color.textSecondary}>
                    {preview.format === "Card list" ? "Card list" : `${preview.format} file`} · {preview.rows.toLocaleString()} rows
                  </Text>
                  <View style={styles.stats}>
                    <Stat value={preview.matchedCopies} label="cards ready" tint={color.positive} />
                    <Stat value={preview.matchedCards} label="different cards" tint={color.ink} />
                    <Stat value={preview.unmatchedCount} label="not found" tint={preview.unmatchedCount ? color.negative : color.textTertiary} />
                  </View>
                  {preview.sample.length > 0 && (
                    <View style={styles.sample}>
                      {preview.sample.map((c) => (
                        <View key={`${c.name}|${c.finish}`} style={styles.sampleCard}>
                          <CardArt uri={c.imageUri} name={c.name} foil={c.finish !== "nonfoil"} />
                          {c.quantity > 1 && (
                            <View style={styles.sampleQty}>
                              <Text variant="number" color="#FFFFFF" style={{ fontSize: 10 }}>
                                ×{c.quantity}
                              </Text>
                            </View>
                          )}
                        </View>
                      ))}
                    </View>
                  )}
                </View>

                {preview.unmatchedCount > 0 && (
                  <View style={styles.card}>
                    <Touchable onPress={() => setShowMissing((v) => !v)} style={styles.missingHead} accessibilityRole="button">
                      <Text variant="bodyStrong" style={{ flex: 1 }}>
                        {preview.unmatchedCount} {preview.unmatchedCount === 1 ? "row" : "rows"} we couldn't match
                      </Text>
                      <Ionicons name={showMissing ? "chevron-up" : "chevron-down"} size={18} color={color.textSecondary} />
                    </Touchable>
                    {showMissing && (
                      <View style={{ marginTop: space.sm, gap: 6 }}>
                        {preview.unmatched.map((u) => (
                          <Text key={u.line} variant="caption" color={color.textSecondary}>
                            Line {u.line}: {u.quantity > 1 ? `${u.quantity} × ` : ""}
                            {u.name}
                            {u.setCode ? ` (${u.setCode.toUpperCase()})` : ""}
                          </Text>
                        ))}
                        {preview.unmatchedCount > preview.unmatched.length && (
                          <Text variant="caption" color={color.textTertiary}>
                            …and {preview.unmatchedCount - preview.unmatched.length} more
                          </Text>
                        )}
                        <Text variant="caption" color={color.textTertiary} style={{ marginTop: 4 }}>
                          Usually very new cards or tokens. They're skipped; everything else imports.
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {preview.matchedCopies > 0 && (
                  <>
                    <Segmented
                      options={[
                        { value: "add", label: `Add to ${binder.name}` },
                        { value: "replace", label: "Replace its cards" },
                      ]}
                      value={mode}
                      onChange={setMode}
                    />
                    {mode === "replace" && (
                      <Text variant="caption" color={color.negative} style={{ paddingHorizontal: space.xs }}>
                        Everything in {binder.name} now is removed first. Use this to re-sync from the other app.
                      </Text>
                    )}
                    <Button
                      label={`Import ${preview.matchedCopies.toLocaleString()} ${preview.matchedCopies === 1 ? "card" : "cards"}`}
                      size="lg"
                      loading={importing}
                      onPress={confirmImport}
                    />
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ value, label, tint }: { value: number; label: string; tint: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statValue, { color: tint }]}>{value.toLocaleString()}</Text>
      <Text variant="caption" color={color.textSecondary}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: space.xxxl * 2 },
  section: { paddingHorizontal: space.lg, marginBottom: space.lg, gap: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  card: { backgroundColor: color.surface, borderRadius: radius.lg, padding: space.lg, ...hairline, ...elevation.card },
  pick: { flexDirection: "row", alignItems: "center", gap: space.md },
  paste: { minHeight: 160, borderRadius: radius.md, padding: space.md, backgroundColor: color.surface2, color: color.ink, fontFamily: font.medium, fontSize: 15, textAlignVertical: "top" },
  fileRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.sm },
  errorCard: { flexDirection: "row", alignItems: "center", gap: space.sm, backgroundColor: color.negativeSoft },
  stats: { flexDirection: "row", gap: space.md },
  statValue: { fontFamily: font.heavy, fontSize: 28, lineHeight: 34, letterSpacing: -0.8, fontVariant: ["tabular-nums"] },
  sample: { flexDirection: "row", gap: 6 },
  sampleCard: { flex: 1, maxWidth: 64 },
  sampleQty: { position: "absolute", top: 3, left: 3, paddingHorizontal: 4, borderRadius: 6, backgroundColor: "rgba(10,11,18,0.75)" },
  missingHead: { flexDirection: "row", alignItems: "center" },
  done: { flex: 1, alignItems: "center", gap: space.sm, paddingHorizontal: space.xxl, paddingTop: space.xxxl * 2 },
});

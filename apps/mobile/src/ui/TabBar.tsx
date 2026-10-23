import React from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { color, radius, space } from "../design/tokens";
import { Text, tap } from "./primitives";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: "Home", icon: "home-outline", iconActive: "home" },
  search: { label: "Search", icon: "search-outline", iconActive: "search" },
  scan: { label: "Scan", icon: "scan-outline", iconActive: "scan" },
  collection: { label: "Collection", icon: "albums-outline", iconActive: "albums" },
  decks: { label: "Decks", icon: "layers-outline", iconActive: "layers" },
};

/** Floating, frosted tab bar with a raised Scan button in the middle. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const focusedName = state.routes[state.index]?.name;
  // The camera screen is full-bleed; keep the bar out of its way.
  if (focusedName === "scan") return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom - 6, space.md) }]}>
      <View style={styles.bar}>
        {Platform.OS === "ios" ? (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.barTint]} />
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              tap();
              navigation.navigate(route.name, route.params);
            }
          };

          if (route.name === "scan") {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel="Scan cards"
                style={({ pressed }) => [styles.scanButton, pressed && { transform: [{ scale: 0.94 }] }]}
              >
                <Ionicons name="scan" size={26} color={color.onAccent} />
              </Pressable>
            );
          }

          const tint = focused ? color.text : color.textTertiary;
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              style={styles.tab}
            >
              <Ionicons name={focused ? meta.iconActive : meta.icon} size={22} color={tint} />
              <Text variant="caption" color={tint} style={styles.label} numberOfLines={1}>
                {meta.label}
              </Text>
              <View style={[styles.indicator, focused && { backgroundColor: color.accent }]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.lg },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 68,
    borderRadius: radius.pill,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderStrong,
    paddingHorizontal: space.xs,
  },
  barTint: { backgroundColor: Platform.OS === "ios" ? "rgba(20,20,24,0.72)" : "rgba(20,20,24,0.97)" },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, height: "100%" },
  label: { fontSize: 10, lineHeight: 12, fontWeight: "600" },
  indicator: { width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: "transparent" },
  scanButton: {
    width: 52,
    height: 52,
    marginHorizontal: space.xs,
    borderRadius: 26,
    backgroundColor: color.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});

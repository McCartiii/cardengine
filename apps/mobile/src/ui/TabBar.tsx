import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "expo-router/tabs";
import { bubble, color, elevation, glass, radius, space } from "../design/tokens";
import { font } from "../design/fonts";
import { GlassFill, Text, tap } from "./primitives";
import { HoloRing } from "./holo";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const TABS: Record<string, { label: string; icon: IconName; iconActive: IconName }> = {
  index: { label: "Home", icon: "home-outline", iconActive: "home" },
  search: { label: "Search", icon: "search-outline", iconActive: "search" },
  scan: { label: "Scan", icon: "scan-outline", iconActive: "scan" },
  collection: { label: "Binder", icon: "book-outline", iconActive: "book" },
  decks: { label: "Decks", icon: "layers-outline", iconActive: "layers" },
};

/** Floating frosted-glass tab bar; the active tab sits in a raised pill. */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  // The camera screen is full-bleed; keep the bar out of its way.
  if (state.routes[state.index]?.name === "scan") return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom - 8, space.md) }]}>
      <View style={styles.bar}>
        <View style={[StyleSheet.absoluteFill, styles.clip]}>
          <GlassFill strong />
        </View>
        {state.routes.map((route, index) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = emitter.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) {
              tap();
              navigateToTab(route.key);
            }
          };

          if (route.name === "scan") {
            return (
              <Pressable
                key={route.key}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityLabel="Scan cards"
                style={({ pressed }) => [styles.scanWrap, pressed && { transform: [{ scale: 0.93 }] }]}
              >
                <HoloRing radius={30} thickness={3} duration={5000}>
                  <View style={styles.scanButton}>
                    <Ionicons name="scan" size={24} color="#FFFFFF" />
                  </View>
                </HoloRing>
              </Pressable>
            );
          }

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={meta.label}
              style={styles.tab}
            >
              <View style={[styles.tabInner, focused && styles.tabActive]}>
                <Ionicons name={focused ? meta.iconActive : meta.icon} size={22} color={focused ? color.text : color.textSecondary} />
                <Text style={[styles.label, { color: focused ? color.text : color.textSecondary }]} numberOfLines={1}>
                  {meta.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.md },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    height: 72,
    paddingHorizontal: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: glass.edge,
    ...elevation.floating,
  },
  clip: { borderRadius: radius.pill, overflow: "hidden" },
  tab: { flex: 1, height: "100%", alignItems: "center", justifyContent: "center" },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    height: 58,
    width: "100%",
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: "rgba(255,255,255,0.95)", ...elevation.card },
  label: { fontFamily: font.semibold, fontSize: 11, lineHeight: 14 },
  scanWrap: {
    marginHorizontal: 4,
    borderRadius: 30,
    shadowColor: color.accent,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  scanButton: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: color.ink },
});

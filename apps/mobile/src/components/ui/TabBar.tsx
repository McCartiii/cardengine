import React, { useRef, useEffect } from "react";
import {
  View,
  TouchableOpacity,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, tabColors } from "../../theme";

const t = colors.light;
const SCREEN_WIDTH = Dimensions.get("window").width;

export interface TabItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

function getTabColor(key: string): string {
  const entry = tabColors[key as keyof typeof tabColors];
  return entry ? entry.color : t.accent;
}

interface TabBarProps {
  tabs: TabItem[];
  activeTab: string;
  onTabPress: (key: string) => void;
}

export function TabBar({ tabs, activeTab, onTabPress }: TabBarProps) {
  const tabWidth = SCREEN_WIDTH / tabs.length;
  const activeIndex = tabs.findIndex((t) => t.key === activeTab);
  const translateX = useRef(new Animated.Value(activeIndex * tabWidth)).current;

  useEffect(() => {
    Animated.spring(translateX, {
      toValue: activeIndex * tabWidth,
      useNativeDriver: true,
      tension: 300,
      friction: 30,
    }).start();
  }, [activeIndex, tabWidth]);

  return (
    <View style={styles.container}>
      {/* Sliding indicator */}
      <Animated.View
        style={[
          styles.indicator,
          {
            width: tabWidth,
            transform: [{ translateX }],
          },
        ]}
      >
        <View style={[styles.indicatorPill, { backgroundColor: getTabColor(activeTab) }]} />
      </Animated.View>

      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        const color = getTabColor(tab.key);
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => onTabPress(tab.key)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isActive ? tab.iconActive : tab.icon}
              size={22}
              color={color}
            />
            <Text style={[styles.label, { color }]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: t.surface,
    borderTopWidth: 1,
    borderTopColor: t.border,
    paddingBottom: 24,
    paddingTop: 6,
    position: "relative",
  },
  indicator: {
    position: "absolute",
    top: 0,
    height: 3,
    alignItems: "center",
  },
  indicatorPill: {
    width: 32,
    height: 3,
    borderRadius: 2,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 2,
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: "600",
  },
});

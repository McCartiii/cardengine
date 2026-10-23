import React, { useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { CARD_ASPECT, color, radius, space } from "../design/tokens";
import { IconButton, Text, Touchable, Button } from "./primitives";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView edges={["top"]} style={[styles.screen, style]}>
      {children}
    </SafeAreaView>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: React.ReactNode;
}

/** Large left-aligned title, optional back button and trailing actions. */
export function PageHeader({ title, subtitle, back, right }: PageHeaderProps) {
  const router = useRouter();
  return (
    <View style={styles.pageHeader}>
      {back && (
        <IconButton icon="chevron-back" label="Back" onPress={() => router.back()} style={{ marginBottom: space.md }} />
      )}
      <View style={styles.pageHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text variant="title">{title}</Text>
          {subtitle && (
            <Text variant="callout" color={color.textSecondary} style={{ marginTop: 2 }}>
              {subtitle}
            </Text>
          )}
        </View>
        {right && <View style={styles.headerActions}>{right}</View>}
      </View>
    </View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text variant="headline">{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text variant="callout" color={color.accent}>
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  action?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, body, action, onAction }: EmptyStateProps) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={color.accent} />
      </View>
      <Text variant="headline" align="center">
        {title}
      </Text>
      {body && (
        <Text variant="body" color={color.textSecondary} align="center" style={{ maxWidth: 280 }}>
          {body}
        </Text>
      )}
      {action && <Button label={action} onPress={onAction} style={{ marginTop: space.sm }} />}
    </View>
  );
}

export function ListGroup({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, style]}>
      {items.map((child, i) => (
        <React.Fragment key={i}>
          {i > 0 && <View style={styles.groupDivider} />}
          {child}
        </React.Fragment>
      ))}
    </View>
  );
}

interface ListRowProps {
  icon?: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
}

export function ListRow({ icon, iconColor = color.accent, title, subtitle, value, onPress, destructive }: ListRowProps) {
  const content = (
    <View style={styles.row}>
      {icon && (
        <View style={[styles.rowIcon, { backgroundColor: destructive ? color.negativeSoft : color.surface3 }]}>
          <Ionicons name={icon} size={18} color={destructive ? color.negative : iconColor} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={destructive ? color.negative : color.text}>
          {title}
        </Text>
        {subtitle && (
          <Text variant="caption" color={color.textTertiary} style={{ marginTop: 1 }}>
            {subtitle}
          </Text>
        )}
      </View>
      {value && (
        <Text variant="callout" color={color.textSecondary} numberOfLines={1} style={{ maxWidth: 160 }}>
          {value}
        </Text>
      )}
      {onPress && !destructive && <Ionicons name="chevron-forward" size={18} color={color.textTertiary} />}
    </View>
  );
  return onPress ? (
    <Touchable onPress={onPress} pressedScale={0.99} accessibilityRole="button">
      {content}
    </Touchable>
  ) : (
    content
  );
}

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Bottom sheet with a grab handle; tapping the scrim closes it. */
export function Sheet({ visible, onClose, title, subtitle, children }: SheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.sheetWrap}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space.xl) }]}>
            <View style={styles.handle} />
            <Text variant="headline">{title}</Text>
            {subtitle && (
              <Text variant="callout" color={color.textSecondary} style={{ marginTop: 2 }}>
                {subtitle}
              </Text>
            )}
            <View style={{ marginTop: space.lg, gap: space.md }}>{children}</View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ActivityRow() {
  return (
    <View style={{ paddingVertical: space.xl, alignItems: "center" }}>
      <ActivityIndicator color={color.textSecondary} />
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text variant="label" color={color.textTertiary}>
      {children}
    </Text>
  );
}

function usePulse() {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 700 }), -1, true);
  }, [opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

/** Placeholder grid shown while card tiles load. */
export function SkeletonGrid({ columns = 3, rows = 3 }: { columns?: number; rows?: number }) {
  const pulse = usePulse();
  return (
    <Animated.View style={[styles.skeletonGrid, pulse]}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.skeletonRow}>
          {Array.from({ length: columns }).map((__, c) => (
            <View key={c} style={{ flex: 1, gap: space.sm }}>
              <View style={styles.skeletonArt} />
              <View style={[styles.skeletonLine, { width: "80%" }]} />
              <View style={[styles.skeletonLine, { width: "45%" }]} />
            </View>
          ))}
        </View>
      ))}
    </Animated.View>
  );
}

export function SkeletonBlock({ height, style }: { height: number; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse();
  return <Animated.View style={[{ height, borderRadius: radius.lg, backgroundColor: color.surface2 }, pulse, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  pageHeader: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.md },
  pageHeaderRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  headerActions: { flexDirection: "row", alignItems: "center", gap: space.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  empty: { alignItems: "center", gap: space.sm, paddingHorizontal: space.xxl, paddingVertical: space.xxxl * 2 },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.sm,
  },
  group: { backgroundColor: color.surface, borderRadius: radius.lg, overflow: "hidden" },
  groupDivider: { height: StyleSheet.hairlineWidth, backgroundColor: color.borderStrong, marginLeft: space.lg },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, minHeight: 60, paddingVertical: space.md },
  rowIcon: { width: 32, height: 32, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sheetWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  sheet: {
    backgroundColor: color.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: space.xl,
    paddingTop: space.md,
    maxHeight: "85%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.surface3,
    marginBottom: space.lg,
  },
  skeletonGrid: { paddingHorizontal: space.lg, gap: space.xl },
  skeletonRow: { flexDirection: "row", gap: space.md },
  skeletonArt: { width: "100%", aspectRatio: CARD_ASPECT, borderRadius: radius.card, backgroundColor: color.surface2 },
  skeletonLine: { height: 10, borderRadius: 5, backgroundColor: color.surface2 },
});

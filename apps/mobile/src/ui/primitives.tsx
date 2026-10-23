import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps as RNTextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { color, radius, space, type, type TypeVariant } from "../design/tokens";
import { formatDeltaPct } from "../design/format";
import { font } from "../design/fonts";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Light haptic tick; a no-op where haptics aren't available. */
export function tap() {
  Haptics.selectionAsync().catch(() => {});
}

// ── Text ─────────────────────────────────────────────────────────────────────

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  color?: string;
  align?: TextStyle["textAlign"];
}

export function Text({ variant = "body", color: c = color.text, align, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[type[variant], { color: c, textAlign: align }, style]} />;
}

// ── Pressable with press feedback ────────────────────────────────────────────

interface TouchableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  pressedScale?: number;
}

export function Touchable({ style, pressedScale = 0.97, ...rest }: TouchableProps) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        style,
        pressed && { transform: [{ scale: pressedScale }], opacity: 0.88 },
      ]}
    />
  );
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BUTTON_COLORS: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: color.accent, fg: color.onAccent },
  secondary: { bg: color.surface2, fg: color.text, border: "rgba(255,255,255,0.08)" },
  ghost: { bg: "transparent", fg: color.text },
  danger: { bg: color.negativeSoft, fg: color.negative },
};

export function Button({ label, onPress, variant = "primary", size = "md", icon, loading, disabled, style }: ButtonProps) {
  const inactive = disabled || loading;
  const c = disabled && variant === "primary" ? { bg: color.surface2, fg: color.textTertiary } : BUTTON_COLORS[variant];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[
        styles.button,
        size === "lg" && styles.buttonLg,
        { backgroundColor: c.bg, borderColor: c.border ?? "transparent" },
        disabled && variant !== "primary" && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === "lg" ? 19 : 17} color={c.fg} />}
          <Text variant="bodyStrong" color={c.fg} style={{ fontFamily: font.sansSemiBold }}>
            {label}
          </Text>
        </>
      )}
    </Touchable>
  );
}

// ── IconButton ───────────────────────────────────────────────────────────────

interface IconButtonProps {
  icon: IconName;
  onPress?: () => void;
  label: string;
  variant?: "surface" | "overlay" | "accent";
  size?: number;
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, onPress, label, variant = "surface", size = 38, badge, style }: IconButtonProps) {
  const bg = variant === "accent" ? color.accent : variant === "overlay" ? "rgba(28,28,34,0.82)" : color.surface2;
  const fg = variant === "accent" ? color.onAccent : color.text;
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      onPress={() => {
        tap();
        onPress?.();
      }}
      pressedScale={0.92}
      style={[styles.iconButton, variant !== "accent" && styles.iconEdge, { width: size, height: size, backgroundColor: bg }, style]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.47)} color={fg} />
      {badge && <View style={styles.badgeDot} />}
    </Touchable>
  );
}

// ── Chip ─────────────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
}

export function Chip({ label, active, onPress, icon }: ChipProps) {
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={() => {
        tap();
        onPress?.();
      }}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon && <Ionicons name={icon} size={14} color={active ? color.textInverse : color.textSecondary} />}
      <Text variant="callout" color={active ? color.textInverse : color.textSecondary}>
        {label}
      </Text>
    </Touchable>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) tap();
              onChange(o.value);
            }}
            style={[styles.segment, selected && styles.segmentActive]}
          >
            <Text variant="callout" color={selected ? color.text : color.textTertiary}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ── Search field ─────────────────────────────────────────────────────────────

interface SearchFieldProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  loading?: boolean;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SearchField({ value, onChangeText, placeholder, loading, autoFocus, style }: SearchFieldProps) {
  return (
    <View style={[styles.search, style]}>
      <Ionicons name="search" size={18} color={color.textTertiary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={color.textTertiary}
        style={styles.searchInput}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        autoFocus={autoFocus}
        selectionColor={color.accent}
      />
      {loading ? (
        <ActivityIndicator size="small" color={color.textTertiary} />
      ) : value.length > 0 ? (
        <Pressable accessibilityLabel="Clear search" hitSlop={10} onPress={() => onChangeText("")}>
          <Ionicons name="close-circle" size={18} color={color.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Price & delta ────────────────────────────────────────────────────────────

export function Delta({ pct, variant = "number" }: { pct: number | null | undefined; variant?: TypeVariant }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const c = pct > 0 ? color.positive : pct < 0 ? color.negative : color.textTertiary;
  return (
    <Text variant={variant} color={c}>
      {formatDeltaPct(pct)}
    </Text>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonLg: { minHeight: 56, paddingHorizontal: space.xxl },
  iconButton: { borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  iconEdge: { borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(255,255,255,0.1)" },
  badgeDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: color.accent,
    borderWidth: 2,
    borderColor: color.surface2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  chipActive: { backgroundColor: color.text, borderColor: color.text },
  segmented: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  segment: { flex: 1, height: 34, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  segmentActive: { backgroundColor: color.surface3 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  searchInput: { flex: 1, color: color.text, fontSize: 15, fontFamily: font.sans, height: "100%" },
});

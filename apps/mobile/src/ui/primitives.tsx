import React from "react";
import {
  ActivityIndicator,
  Platform,
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
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { bubble, color, elevation, glass, radius, space, type, type BubbleColor, type TypeVariant } from "../design/tokens";
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
      style={({ pressed }) => [style, pressed && { transform: [{ scale: pressedScale }], opacity: 0.9 }]}
    />
  );
}

// ── Glass ────────────────────────────────────────────────────────────────────

// Android's blur is experimental and costly, so it gets a stronger plain fill.
const canBlur = Platform.OS === "ios" || Platform.OS === "web";

/** Frosted-glass backdrop. Put it first inside a rounded, overflow-hidden view. */
export function GlassFill({ strong }: { strong?: boolean }) {
  return (
    <>
      {canBlur && <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: canBlur ? (strong ? glass.fillStrong : glass.fill) : "rgba(255,255,255,0.94)" },
        ]}
      />
    </>
  );
}

/** Rounded frosted-glass container with a bright edge. */
export function Glass({ children, style, strong }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; strong?: boolean }) {
  return (
    <View style={[styles.glass, style]}>
      <View style={[StyleSheet.absoluteFill, styles.glassClip]}>
        <GlassFill strong={strong} />
      </View>
      {children}
    </View>
  );
}

// ── Icon bubble ──────────────────────────────────────────────────────────────

/** Bright gradient circle with a glossy highlight, for lively icons. */
export function IconBubble({ icon, tint = "blue", size = 44 }: { icon: IconName; tint?: BubbleColor; size?: number }) {
  return (
    <View style={[styles.bubbleShadow, { width: size, height: size, borderRadius: size / 2 }]}>
      <LinearGradient
        colors={bubble[tint]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={[styles.bubble, { borderRadius: size / 2 }]}
      >
        <LinearGradient
          colors={["rgba(255,255,255,0.55)", "rgba(255,255,255,0)"]}
          style={[styles.bubbleGloss, { borderTopLeftRadius: size / 2, borderTopRightRadius: size / 2, height: size / 2 }]}
        />
        <Ionicons name={icon} size={Math.round(size * 0.48)} color="#FFFFFF" />
      </LinearGradient>
    </View>
  );
}

// ── Button ───────────────────────────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "dark" | "ghost" | "danger";

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
  secondary: { bg: color.surface, fg: color.text, border: color.border },
  dark: { bg: color.text, fg: "#FFFFFF" },
  ghost: { bg: "transparent", fg: color.accent },
  danger: { bg: color.negativeSoft, fg: color.negative },
};

export function Button({ label, onPress, variant = "primary", size = "md", icon, loading, disabled, style }: ButtonProps) {
  const inactive = disabled || loading;
  const c =
    disabled && (variant === "primary" || variant === "dark") ? { bg: color.surface3, fg: color.textTertiary } : BUTTON_COLORS[variant];
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
        variant === "primary" && !disabled && styles.primaryShadow,
        disabled && variant !== "primary" && variant !== "dark" && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === "lg" ? 20 : 18} color={c.fg} />}
          <Text variant="bodyStrong" color={c.fg} style={{ fontFamily: font.bold, fontSize: size === "lg" ? 17 : 15 }}>
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
  variant?: "glass" | "surface" | "accent" | "dark";
  size?: number;
  badge?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({ icon, onPress, label, variant = "glass", size = 44, badge, style }: IconButtonProps) {
  const fg = variant === "accent" || variant === "dark" ? "#FFFFFF" : color.text;
  const bg = variant === "accent" ? color.accent : variant === "dark" ? color.text : variant === "surface" ? color.surface : undefined;
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
      style={[
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        variant === "glass" ? styles.glassEdge : { backgroundColor: bg },
        variant === "accent" ? styles.primaryShadow : elevation.card,
        style,
      ]}
    >
      {variant === "glass" && (
        <View style={[StyleSheet.absoluteFill, { borderRadius: size / 2, overflow: "hidden" }]}>
          <GlassFill />
        </View>
      )}
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={fg} />
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
      {icon && <Ionicons name={icon} size={15} color={active ? "#FFFFFF" : color.text} />}
      <Text variant="callout" color={active ? "#FFFFFF" : color.text} style={{ fontSize: 14 }}>
        {label}
      </Text>
    </Touchable>
  );
}

// ── Segmented control ────────────────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string; icon?: IconName }>;
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
            {o.icon && <Ionicons name={o.icon} size={16} color={selected ? color.text : color.textSecondary} />}
            <Text variant="callout" color={selected ? color.text : color.textSecondary} style={{ fontSize: 14 }}>
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
      <Ionicons name="search" size={20} color={color.text} />
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
          <Ionicons name="close-circle" size={20} color={color.textTertiary} />
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Delta ────────────────────────────────────────────────────────────────────

export function Delta({ pct, variant = "number" }: { pct: number | null | undefined; variant?: TypeVariant }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const c = pct > 0 ? color.positive : pct < 0 ? color.negative : color.textTertiary;
  return (
    <Text variant={variant} color={c}>
      {formatDeltaPct(pct)}
    </Text>
  );
}

/** Small rounded label, e.g. "Great deal" or "+12%". */
export function Badge({ label, tone = "positive" }: { label: string; tone?: "positive" | "negative" | "accent" | "dark" }) {
  const bg = tone === "positive" ? color.positive : tone === "negative" ? color.negative : tone === "accent" ? color.accent : color.text;
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text variant="number" color="#FFFFFF">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  glass: { borderRadius: radius.pill, borderWidth: 1, borderColor: glass.edge, ...elevation.card },
  glassClip: { borderRadius: radius.pill, overflow: "hidden" },
  glassEdge: { borderWidth: 1, borderColor: glass.edge, overflow: "visible" },
  bubbleShadow: {
    shadowColor: "#1D2939",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bubble: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  bubbleGloss: { position: "absolute", top: 0, left: 0, right: 0 },
  button: {
    minHeight: 52,
    paddingHorizontal: space.xxl,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  buttonLg: { minHeight: 58, paddingHorizontal: space.xxxl },
  primaryShadow: {
    shadowColor: color.accent,
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  iconButton: { alignItems: "center", justifyContent: "center" },
  badgeDot: {
    position: "absolute",
    top: 8,
    right: 9,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: color.negative,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: color.surface2,
  },
  chipActive: { backgroundColor: color.text },
  segmented: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.pill,
    backgroundColor: color.surface3,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: color.surface, ...elevation.card },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    height: 52,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
  },
  searchInput: { flex: 1, color: color.text, fontSize: 16, fontFamily: font.medium, height: "100%" },
  badge: { height: 22, paddingHorizontal: 8, borderRadius: 7, justifyContent: "center" },
});

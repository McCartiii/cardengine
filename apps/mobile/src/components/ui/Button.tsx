import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { colors, radii, spacing } from "../../theme";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

const t = colors.light;

export function Button({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  disabled = false,
  onPress,
  style,
}: ButtonProps) {
  const containerStyle: ViewStyle[] = [
    styles.base,
    sizeStyles[size],
    variantContainerStyles[variant],
    (disabled || loading) && styles.disabled,
    style as ViewStyle,
  ].filter(Boolean) as ViewStyle[];

  const textStyle: TextStyle[] = [
    styles.baseText,
    sizeTextStyles[size],
    variantTextStyles[variant],
  ];

  return (
    <TouchableOpacity
      style={containerStyle}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" || variant === "danger" ? "#fff" : t.accent}
          size="small"
        />
      ) : (
        <Text style={textStyle}>{children}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  baseText: {
    fontWeight: "600",
  },
  disabled: {
    opacity: 0.5,
  },
});

const sizeStyles: Record<ButtonSize, ViewStyle> = {
  sm: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.sm },
  md: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radii.md },
  lg: { paddingHorizontal: spacing["2xl"], paddingVertical: spacing.lg, borderRadius: radii.md },
};

const sizeTextStyles: Record<ButtonSize, TextStyle> = {
  sm: { fontSize: 13 },
  md: { fontSize: 15 },
  lg: { fontSize: 16 },
};

const variantContainerStyles: Record<ButtonVariant, ViewStyle> = {
  primary: {
    backgroundColor: t.accent,
    shadowColor: t.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  secondary: {
    backgroundColor: t.surface,
    borderWidth: 1,
    borderColor: t.border,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  danger: {
    backgroundColor: t.danger,
    shadowColor: t.danger,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
};

const variantTextStyles: Record<ButtonVariant, TextStyle> = {
  primary: { color: "#FFFFFF" },
  secondary: { color: t.textPrimary },
  ghost: { color: t.accent },
  danger: { color: "#FFFFFF" },
};

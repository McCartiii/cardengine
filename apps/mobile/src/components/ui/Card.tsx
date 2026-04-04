import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { colors, radii, spacing, shadows } from "../../theme";

const t = colors.light;

interface CardProps {
  children: React.ReactNode;
  interactive?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, interactive, onPress, style }: CardProps) {
  if (interactive || onPress) {
    return (
      <TouchableOpacity
        style={[styles.card, style]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: t.border,
    ...shadows.card,
  } as ViewStyle,
});

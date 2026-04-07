import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, typography } from "../../theme";

const t = colors.light;

interface HeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}

export function Header({ title, subtitle, onBack, right }: HeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.row}>
        {onBack && (
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-back" size={24} color={t.accent} />
          </TouchableOpacity>
        )}
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        {right && <View style={styles.right}>{right}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: t.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  backBtn: {
    marginRight: spacing.sm,
    padding: 4,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...typography.title,
    color: t.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: t.textSecondary,
    marginTop: 2,
  },
  right: {
    marginLeft: spacing.sm,
  },
});

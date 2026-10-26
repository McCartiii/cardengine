// Haptics for the life counter, silent where the platform has none (web).
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const on = Platform.OS === "ios" || Platform.OS === "android";

export const feel = {
  tick: () => on && Haptics.selectionAsync().catch(() => {}),
  light: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  heavy: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}),
  success: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
};

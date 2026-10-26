// Every buzz in the app goes through here, so the Settings switch turns them
// all off. Silent where the platform has none (web).
import { Platform } from "react-native";
import * as Haptics from "expo-haptics";

const supported = Platform.OS === "ios" || Platform.OS === "android";
let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
}

const run = (fn: () => Promise<void>) => {
  if (supported && enabled) fn().catch(() => {});
};

export const haptic = {
  tick: () => run(() => Haptics.selectionAsync()),
  light: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};

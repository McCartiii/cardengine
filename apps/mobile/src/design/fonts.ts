// Subpath imports keep unused weights out of the bundle. Inter tracks closely
// to the iOS system face, so the app feels native on every platform.
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
import { Inter_800ExtraBold } from "@expo-google-fonts/inter/800ExtraBold";

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
  heavy: "Inter_800ExtraBold",
} as const;

export const FONT_ASSETS = {
  [font.regular]: Inter_400Regular,
  [font.medium]: Inter_500Medium,
  [font.semibold]: Inter_600SemiBold,
  [font.bold]: Inter_700Bold,
  [font.heavy]: Inter_800ExtraBold,
};

// Subpath imports keep unused weights out of the bundle.
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import { GeistMono_500Medium } from "@expo-google-fonts/geist-mono/500Medium";
import { InstrumentSerif_400Regular } from "@expo-google-fonts/instrument-serif/400Regular";
import { InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif/400Regular_Italic";

export const font = {
  sans: "Geist_400Regular",
  sansMedium: "Geist_500Medium",
  sansSemiBold: "Geist_600SemiBold",
  mono: "GeistMono_500Medium",
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
} as const;

export const FONT_ASSETS = {
  [font.sans]: Geist_400Regular,
  [font.sansMedium]: Geist_500Medium,
  [font.sansSemiBold]: Geist_600SemiBold,
  [font.mono]: GeistMono_500Medium,
  [font.serif]: InstrumentSerif_400Regular,
  [font.serifItalic]: InstrumentSerif_400Regular_Italic,
};

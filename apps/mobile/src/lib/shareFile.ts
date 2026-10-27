// Hands a text file to the user: the share sheet on phones (save to Files,
// AirDrop, email…), a download on the web.
import { Platform } from "react-native";
// The SDK 58 top-level API is class-based; these call sites use the classic functions.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

export async function shareTextFile(filename: string, text: string, mimeType = "text/csv") {
  if (Platform.OS === "web") {
    const url = URL.createObjectURL(new Blob([text], { type: mimeType }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const uri = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(uri, text, { encoding: FileSystem.EncodingType.UTF8 });
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this device");
  await Sharing.shareAsync(uri, { mimeType, UTI: "public.comma-separated-values-text", dialogTitle: filename });
}

/** "cardengine-trade-binder-2026-10-26.csv" */
export function exportFilename(label: string) {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "collection";
  return `cardengine-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
}

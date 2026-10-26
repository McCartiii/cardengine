// Pictures players choose for themselves: a card's art, or a photo from the
// phone, sized down and kept somewhere that survives the app restarting.
import { Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";

/** Scryfall's art crop for a card image: the illustration without the frame. */
export function artCrop(imageUri: string): string {
  const m = imageUri.match(/^(https:\/\/cards\.scryfall\.io\/)(normal|large|small|png|border_crop)(\/.*?)(\.png|\.jpg)(\?.*)?$/);
  if (!m) return imageUri;
  // Art crops are always JPEGs, whatever the source image was.
  return `${m[1]}art_crop${m[3]}.jpg${m[5] ?? ""}`;
}

export class PhotoAccessError extends Error {}

async function chooseFromLibrary(square: boolean): Promise<ImagePicker.ImagePickerAsset | null> {
  if (Platform.OS !== "web") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new PhotoAccessError("Allow photo access in Settings to choose a picture.");
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: square ? [1, 1] : [4, 3],
    quality: 0.9,
  });
  if (result.canceled || !result.assets?.length) return null;
  return result.assets[0];
}

/** A photo for a life counter panel, stored with the app. Null if cancelled. */
export async function pickPanelPhoto(): Promise<string | null> {
  const asset = await chooseFromLibrary(false);
  if (!asset) return null;
  const uri = asset.uri;
  // On the web there's no app folder, so the picture travels as data.
  const web = Platform.OS === "web";
  const sized = await manipulateAsync(uri, [{ resize: { width: 900 } }], { compress: 0.8, format: SaveFormat.JPEG, base64: web });
  if (web) return `data:image/jpeg;base64,${sized.base64}`;
  const dir = `${FileSystem.documentDirectory}life-art/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: sized.uri, to: dest });
  return dest;
}

/** A small square photo as a data URL, for a profile picture. Null if cancelled. */
export async function pickProfilePhoto(): Promise<string | null> {
  const asset = await chooseFromLibrary(true);
  if (!asset) return null;
  // The picker crops to a square on phones; elsewhere, take the middle square.
  const side = Math.min(asset.width, asset.height);
  const crop = side > 0 && asset.width !== asset.height ? [{ crop: { originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side } }] : [];
  const sized = await manipulateAsync(asset.uri, [...crop, { resize: { width: 256, height: 256 } }], { compress: 0.75, format: SaveFormat.JPEG, base64: true });
  return `data:image/jpeg;base64,${sized.base64}`;
}

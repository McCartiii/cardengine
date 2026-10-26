// Choosing a player's picture for the life counter: a photo, the signed-in
// player's profile picture, or any card's art.
import React from "react";
import { PicturePicker, type PickerOption } from "@/components/PicturePicker";
import { pickPanelPhoto } from "@/lib/pictures";
import type { PlayerArt } from "@/lib/lifeGame";

export function PlayerPicturePicker({
  visible,
  name,
  art,
  profilePicture,
  onChange,
  onClose,
}: {
  visible: boolean;
  name: string;
  art: PlayerArt | null | undefined;
  /** The signed-in player's profile picture, offered as a shortcut. */
  profilePicture?: string | null;
  onChange: (art: PlayerArt | null) => void;
  onClose: () => void;
}) {
  const choose = (next: PlayerArt | null) => {
    onChange(next);
    onClose();
  };
  const options: PickerOption[] = [
    {
      key: "photo",
      label: "Choose a photo",
      icon: "image",
      onPress: async () => {
        const uri = await pickPanelPhoto();
        if (uri) choose({ kind: "photo", uri });
      },
    },
    ...(profilePicture
      ? [{ key: "profile", label: "My profile picture", icon: "person-circle" as const, onPress: () => choose({ kind: "photo", uri: profilePicture }) }]
      : []),
    ...(art ? [{ key: "remove", label: "Remove picture", icon: "trash" as const, destructive: true, onPress: () => choose(null) }] : []),
  ];
  return (
    <PicturePicker
      visible={visible}
      title={`${name}'s picture`}
      current={art?.uri}
      options={options}
      onPickCard={(uri, label) => choose({ kind: "card", uri, label })}
      onClose={onClose}
    />
  );
}

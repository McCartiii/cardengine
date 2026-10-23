import React from "react";
import { StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLifeStore } from "@/store/lifeStore";
import { SetupScreen } from "@/screens/life/SetupScreen";
import { GameScreen } from "@/screens/life/GameScreen";
import { GameOverScreen } from "@/screens/life/GameOverScreen";
import { IconButton } from "@/ui";

export default function LifeScreen() {
  const phase = useLifeStore((s) => s.phase);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <>
      <StatusBar hidden />
      {phase === "setup" && <SetupScreen />}
      {phase === "playing" && <GameScreen />}
      {phase === "finished" && <GameOverScreen />}
      {phase === "setup" && (
        <View style={[styles.close, { top: insets.top + 8 }]}>
          <IconButton icon="close" label="Close life counter" onPress={() => router.back()} />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  close: { position: "absolute", left: 16 },
});

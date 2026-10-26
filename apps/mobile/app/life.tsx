import React from "react";
import { StatusBar } from "expo-status-bar";
import { useLifeStore } from "@/store/lifeStore";
import { SetupScreen } from "@/screens/life/SetupScreen";
import { GameScreen } from "@/screens/life/GameScreen";

/** The life counter: setup until a game starts; a saved game opens straight back up. */
export default function LifeScreen() {
  const playing = useLifeStore((s) => s.game !== null);
  return (
    <>
      <StatusBar hidden={playing} style="light" />
      {playing ? <GameScreen /> : <SetupScreen />}
    </>
  );
}

import React from "react";
import { StatusBar } from "expo-status-bar";
import { useLifeStore } from "@/store/lifeStore";
import { SetupScreen } from "@/screens/life/SetupScreen";
import { GameScreen } from "@/screens/life/GameScreen";
import { GameOverScreen } from "@/screens/life/GameOverScreen";

export default function LifeScreen() {
  const phase = useLifeStore((s) => s.phase);

  return (
    <>
      <StatusBar hidden />
      {phase === "setup" && <SetupScreen />}
      {phase === "playing" && <GameScreen />}
      {phase === "finished" && <GameOverScreen />}
    </>
  );
}

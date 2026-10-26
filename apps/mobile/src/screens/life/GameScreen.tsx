// The table: one panel per player, each turned to face its seat, with the
// menu button in the middle. Keeps the screen awake, runs the turn clock, and
// pauses it when the app goes to the background.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeepAwake } from "expo-keep-awake";
import { seatLayout, seatRotation, timeLeft, winnerOf, isOut, type LifeGame } from "@/lib/lifeGame";
import { LIFE_BG } from "@/lib/lifeConstants";
import { useLifeStore } from "@/store/lifeStore";
import { PlayerPanel, formatClock } from "@/components/life/PlayerPanel";
import { FirstPrompt, GameMenu, HubButton, RollResult, WinnerOverlay, formatElapsed, type ToolRoll, type ToolRollInput } from "@/components/life/GameOverlays";
import { feel } from "@/components/life/feel";

const GAP = 6;

export function GameScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const game = useLifeStore((s) => s.game) as LifeGame;
  const historyCount = useLifeStore((s) => s.history.length);
  const winnerDismissed = useLifeStore((s) => s.winnerDismissed);
  const { tickClock, pause, resume, passTurn, startTurns, undo, rematch, endGame, dismissWinner } = useLifeStore.getState();

  const [now, setNow] = useState(Date.now());
  const [menuOpen, setMenuOpen] = useState(false);
  const [roll, setRoll] = useState<ToolRoll | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);
  const [picking, setPicking] = useState(false);
  const [skipFirst, setSkipFirst] = useState(false);
  const [showWinner, setShowWinner] = useState(false);

  const running = game.runningSince != null;
  const layout = useMemo(() => seatLayout(game.players.length), [game.players.length]);

  // ── Clock: re-render and check for time-outs while it runs ──
  useEffect(() => {
    setNow(Date.now());
    if (!running) return;
    const t = setInterval(() => {
      setNow(Date.now());
      tickClock();
    }, 250);
    return () => clearInterval(t);
  }, [running, tickClock]);

  // Time keeps counting while the app is open, never while it's away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") useLifeStore.getState().pause();
    });
    return () => {
      sub.remove();
      useLifeStore.getState().pause();
    };
  }, []);

  // The elapsed time in the menu only needs an occasional refresh.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // ── Winner, after the knockout animation has a moment ──
  const winner = winnerOf(game);
  useEffect(() => {
    if (!winner || winnerDismissed === game.id) {
      setShowWinner(false);
      return;
    }
    const t = setTimeout(() => setShowWinner(true), 900);
    return () => clearTimeout(t);
  }, [winner, winnerDismissed, game.id]);

  // ── Roll for first player: the highlight runs around the table and slows down ──
  const pickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (pickTimer.current) clearTimeout(pickTimer.current);
  }, []);
  const rollFirst = useCallback(() => {
    const alive = game.players.map((p, i) => (isOut(p) ? -1 : i)).filter((i) => i >= 0);
    if (alive.length === 0) return;
    setMenuOpen(false);
    setPicking(true);
    const target = alive[Math.floor(Math.random() * alive.length)];
    const start = alive[Math.floor(Math.random() * alive.length)];
    const startPos = alive.indexOf(start);
    const targetPos = alive.indexOf(target);
    // At least two laps, ending on the target.
    const steps = alive.length * 2 + ((targetPos - startPos + alive.length) % alive.length) + 1;
    let k = 0;
    const step = () => {
      const seat = alive[(startPos + k) % alive.length];
      setHighlight(seat);
      feel.tick();
      k++;
      if (k < steps) {
        pickTimer.current = setTimeout(step, 55 + Math.pow(k / steps, 2.4) * 380);
      } else {
        let blinks = 0;
        const blink = () => {
          blinks++;
          setHighlight(blinks % 2 === 0 ? target : null);
          if (blinks < 5) pickTimer.current = setTimeout(blink, 120);
          else {
            setHighlight(null);
            setPicking(false);
            feel.success();
            startTurns(target);
          }
        };
        pickTimer.current = setTimeout(blink, 250);
      }
    };
    step();
  }, [game.players, startTurns]);

  const roller = (r: ToolRollInput) => {
    setMenuOpen(false);
    setRoll({ ...r, id: Date.now() });
  };

  const elapsed = now - game.startedAt;
  const turnsOn = game.active >= 0;
  const hubLabel = turnsOn ? `T${game.turn}` : formatElapsed(elapsed).replace(" min", "m");

  const seat = (index: number, flex = 1) => {
    const p = game.players[index];
    return (
      <Seat key={p.id} flex={flex} rotation={seatRotation(layout, index)}>
        {(w, h) => (
          <PlayerPanel
            player={p}
            game={game}
            width={w}
            height={h}
            active={turnsOn && game.active === index && !winner}
            turnsOn={turnsOn}
            clockLeft={timeLeft(game, index, now)}
            clockRunning={running}
            highlighted={highlight === index}
            winner={winner?.id === p.id}
          />
        )}
      </Seat>
    );
  };

  const hasSides = layout.left.length > 0;
  // The menu button sits where the seats meet: between the side columns, or
  // between top and bottom when two players face each other.
  const hub = (
    <View pointerEvents="box-none" style={styles.hubLayer}>
      {!turnsOn && !skipFirst && !picking && !winner ? (
        <FirstPrompt onRoll={rollFirst} onSkip={() => setSkipFirst(true)} />
      ) : (
        <HubButton onPress={() => setMenuOpen(true)} label={hubLabel} attention={false} small={game.players.length >= 5} />
      )}
    </View>
  );
  // Side columns get more room when a bottom seat shares the screen.
  const middleFlex = layout.bottom != null && hasSides ? (layout.left.length > 1 ? 2.6 : 1.7) : 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top + GAP, paddingBottom: Math.max(insets.bottom, GAP) }]}>
      {layout.top != null && <View style={styles.row}>{seat(layout.top)}</View>}
      {hasSides && (
        <View style={[styles.row, { flex: middleFlex }]}>
          <View style={styles.column}>{layout.left.map((i) => seat(i))}</View>
          <View style={styles.column}>{layout.right.map((i) => seat(i))}</View>
          {hub}
        </View>
      )}
      {layout.bottom != null && <View style={styles.row}>{seat(layout.bottom)}</View>}
      {!hasSides && <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { top: insets.top + GAP, bottom: Math.max(insets.bottom, GAP) }]}>{hub}</View>}

      <GameMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={turnsOn ? `Turn ${game.turn}` : "Game"}
        subtitle={`${formatElapsed(elapsed)} played · ${game.players.length} players · ${game.startingLife} life`}
        sections={[
          {
            title: "PLAY",
            actions: [
              turnsOn
                ? { key: "pass", icon: "arrow-forward-circle", label: "Pass turn", hint: game.players[game.active]?.name, tone: "primary" as const, onPress: () => { feel.medium(); passTurn(); setMenuOpen(false); } }
                : { key: "first", icon: "dice", label: "Who goes first", hint: "Roll for it", tone: "primary" as const, onPress: rollFirst },
              { key: "undo", icon: "arrow-undo", label: "Undo", hint: historyCount ? `${historyCount} steps` : "Nothing yet", disabled: historyCount === 0, onPress: () => { feel.light(); undo(); } },
              ...(game.clockMs != null && turnsOn
                ? [
                    running
                      ? { key: "pause", icon: "pause" as const, label: "Pause clock", hint: formatClock(timeLeft(game, game.active, now) ?? 0), onPress: () => { pause(); setMenuOpen(false); } }
                      : { key: "resume", icon: "play" as const, label: "Resume clock", hint: "Paused", onPress: () => { resume(); setMenuOpen(false); } },
                  ]
                : []),
            ],
          },
          {
            title: "RANDOM",
            actions: [
              { key: "coin", icon: "ellipse", label: "Flip coin", onPress: () => roller({ kind: "coin", heads: Math.random() < 0.5 }) },
              { key: "d6", icon: "dice", label: "Roll d6", onPress: () => roller({ kind: "die", sides: 6, value: 1 + Math.floor(Math.random() * 6) }) },
              { key: "d20", icon: "diamond", label: "Roll d20", onPress: () => roller({ kind: "die", sides: 20, value: 1 + Math.floor(Math.random() * 20) }) },
            ],
          },
          {
            title: "GAME",
            actions: [
              { key: "rematch", icon: "refresh", label: "Rematch", hint: "Same players", onPress: () => { feel.warning(); rematch(); setSkipFirst(false); setMenuOpen(false); } },
              { key: "new", icon: "options", label: "New game", hint: "Change setup", onPress: () => { setMenuOpen(false); endGame(); } },
              { key: "exit", icon: "exit", label: "Leave", hint: "Saved", tone: "danger" as const, onPress: () => { setMenuOpen(false); router.back(); } },
            ],
          },
        ]}
      />

      {roll && <RollResult roll={roll} onDone={() => setRoll(null)} />}

      {showWinner && winner && (
        <WinnerOverlay
          winner={winner}
          rotation={seatRotation(layout, game.players.indexOf(winner))}
          turn={game.turn}
          elapsedMs={elapsed}
          onRematch={() => {
            rematch();
            setSkipFirst(false);
          }}
          onUndo={undo}
          onNewGame={endGame}
          onClose={dismissWinner}
        />
      )}
    </View>
  );
}

/** A cell that measures itself and turns its panel to face the seat. */
function Seat({ flex, rotation, children }: { flex: number; rotation: number; children: (w: number, h: number) => React.ReactNode }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((s) => (s && Math.abs(s.w - width) < 1 && Math.abs(s.h - height) < 1 ? s : { w: width, h: height }));
  };
  const sideways = rotation === 90 || rotation === -90;
  return (
    <View style={{ flex }} onLayout={onLayout}>
      {size && (
        <View
          style={{
            position: "absolute",
            width: sideways ? size.h : size.w,
            height: sideways ? size.w : size.h,
            left: sideways ? (size.w - size.h) / 2 : 0,
            top: sideways ? (size.h - size.w) / 2 : 0,
            transform: [{ rotate: `${rotation}deg` }],
          }}
        >
          {children(sideways ? size.h : size.w, sideways ? size.w : size.h)}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: LIFE_BG, paddingHorizontal: GAP, gap: GAP },
  row: { flex: 1, flexDirection: "row", gap: GAP },
  column: { flex: 1, gap: GAP },
  hubLayer: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
});

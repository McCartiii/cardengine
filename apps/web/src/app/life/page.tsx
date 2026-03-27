"use client";

import { useReducer, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type Format = "standard" | "modern" | "commander" | "brawl" | "legacy" | "vintage";
type LifeAnim = "" | "decrease" | "increase" | "decrease-big" | "increase-big";

interface Player {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  commanderDamage: Record<string, number>;
  color: string;
  timeRemainingMs: number;
  isEliminated: boolean;
  lifeAnim: LifeAnim;
  poisonAnim: "" | "increase";
  animKey: number;
}

interface GameState {
  phase: "setup" | "playing" | "finished";
  format: Format;
  players: Player[];
  totalTimeMinutes: number;
  activePlayerIndex: number;
  isPaused: boolean;
  globalElapsedMs: number;
}

type Action =
  | { type: "SET_FORMAT"; format: Format }
  | { type: "SET_TIME"; minutes: number }
  | { type: "ADD_PLAYER" }
  | { type: "REMOVE_PLAYER"; id: string }
  | { type: "RENAME_PLAYER"; id: string; name: string }
  | { type: "START_GAME" }
  | { type: "TICK" }
  | { type: "PASS_TURN" }
  | { type: "ADJUST_LIFE"; id: string; delta: number }
  | { type: "ADJUST_POISON"; id: string; delta: number }
  | { type: "ADJUST_ENERGY"; id: string; delta: number }
  | { type: "ADJUST_CMD_DAMAGE"; targetId: string; sourceId: string; delta: number }
  | { type: "CLEAR_ANIM"; id: string; field: "lifeAnim" | "poisonAnim" }
  | { type: "TOGGLE_PAUSE" }
  | { type: "RESET_GAME" };

// ── Constants ─────────────────────────────────────────────────────────────────
const FORMAT_LIFE: Record<Format, number> = {
  standard: 20, modern: 20, legacy: 20, vintage: 20, commander: 40, brawl: 25,
};
const FORMATS: Format[] = ["standard", "modern", "commander", "brawl", "legacy", "vintage"];
const PLAYER_COLORS = ["#00d4ff", "#ff0080", "#7c3aed", "#f59e0b", "#4ade80", "#f97316"];
const TIME_OPTIONS = [15, 25, 30, 45, 60, 75, 90];

// ── Helpers ───────────────────────────────────────────────────────────────────
function makePlayer(index: number, format: Format): Player {
  return {
    id: `p${index}`,
    name: `Player ${index + 1}`,
    life: FORMAT_LIFE[format],
    poison: 0,
    energy: 0,
    commanderDamage: {},
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    timeRemainingMs: 0,
    isEliminated: false,
    lifeAnim: "",
    poisonAnim: "",
    animKey: 0,
  };
}

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function nextAlivePlayer(players: Player[], currentIndex: number): number {
  const len = players.length;
  for (let i = 1; i <= len; i++) {
    const idx = (currentIndex + i) % len;
    if (!players[idx].isEliminated) return idx;
  }
  return -1; // all eliminated
}

function checkEliminated(p: Player): boolean {
  if (p.life <= 0) return true;
  if (p.poison >= 10) return true;
  const totalCmd = Object.values(p.commanderDamage).reduce((s, v) => s + v, 0);
  if (totalCmd >= 21) return true;
  return false;
}

// ── Reducer ───────────────────────────────────────────────────────────────────
function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "SET_FORMAT": {
      const life = FORMAT_LIFE[action.format];
      return {
        ...state,
        format: action.format,
        players: state.players.map(p => ({ ...p, life, poison: 0, energy: 0, commanderDamage: {} })),
      };
    }
    case "SET_TIME":
      return { ...state, totalTimeMinutes: action.minutes };
    case "ADD_PLAYER": {
      if (state.players.length >= 6) return state;
      return { ...state, players: [...state.players, makePlayer(state.players.length, state.format)] };
    }
    case "REMOVE_PLAYER": {
      if (state.players.length <= 2) return state;
      return { ...state, players: state.players.filter(p => p.id !== action.id) };
    }
    case "RENAME_PLAYER":
      return { ...state, players: state.players.map(p => p.id === action.id ? { ...p, name: action.name } : p) };
    case "START_GAME": {
      const perPlayer = (state.totalTimeMinutes * 60 * 1000) / state.players.length;
      return {
        ...state,
        phase: "playing",
        activePlayerIndex: 0,
        isPaused: false,
        globalElapsedMs: 0,
        players: state.players.map(p => ({ ...p, timeRemainingMs: perPlayer, isEliminated: false, poison: 0, energy: 0, commanderDamage: {}, life: FORMAT_LIFE[state.format] })),
      };
    }
    case "TICK": {
      if (state.phase !== "playing" || state.isPaused) return state;
      const active = state.players[state.activePlayerIndex];
      if (!active || active.isEliminated) return state;
      const newTime = active.timeRemainingMs - 100;
      let players = state.players.map((p, i) =>
        i === state.activePlayerIndex ? { ...p, timeRemainingMs: newTime } : p
      );
      let activeIndex = state.activePlayerIndex;
      let phase: GameState["phase"] = state.phase;
      // Time out
      if (newTime <= 0) {
        players = players.map((p, i) =>
          i === state.activePlayerIndex ? { ...p, isEliminated: true, timeRemainingMs: 0 } : p
        );
        const next = nextAlivePlayer(players, state.activePlayerIndex);
        if (next === -1) phase = "finished";
        else activeIndex = next;
      }
      return { ...state, players, activePlayerIndex: activeIndex, globalElapsedMs: state.globalElapsedMs + 100, phase };
    }
    case "PASS_TURN": {
      const next = nextAlivePlayer(state.players, state.activePlayerIndex);
      if (next === -1) return { ...state, phase: "finished" };
      return { ...state, activePlayerIndex: next };
    }
    case "ADJUST_LIFE": {
      const isBig = Math.abs(action.delta) >= 5;
      const anim: LifeAnim = action.delta > 0
        ? (isBig ? "increase-big" : "increase")
        : (isBig ? "decrease-big" : "decrease");
      let players = state.players.map(p => {
        if (p.id !== action.id) return p;
        const newLife = p.life + action.delta;
        const updated = { ...p, life: newLife, lifeAnim: anim, animKey: p.animKey + 1 };
        if (checkEliminated(updated)) updated.isEliminated = true;
        return updated;
      });
      // Auto-pass if active player eliminated
      let activeIndex = state.activePlayerIndex;
      let phase: GameState["phase"] = state.phase;
      if (players[activeIndex]?.isEliminated) {
        const next = nextAlivePlayer(players, activeIndex);
        if (next === -1) phase = "finished";
        else activeIndex = next;
      }
      return { ...state, players, activePlayerIndex: activeIndex, phase };
    }
    case "ADJUST_POISON": {
      let players = state.players.map(p => {
        if (p.id !== action.id) return p;
        const newPoison = Math.max(0, p.poison + action.delta);
        const updated = { ...p, poison: newPoison, poisonAnim: (action.delta > 0 ? "increase" : "") as "" | "increase", animKey: p.animKey + 1 };
        if (checkEliminated(updated)) updated.isEliminated = true;
        return updated;
      });
      let activeIndex = state.activePlayerIndex;
      let phase: GameState["phase"] = state.phase;
      if (players[activeIndex]?.isEliminated) {
        const next = nextAlivePlayer(players, activeIndex);
        if (next === -1) phase = "finished";
        else activeIndex = next;
      }
      return { ...state, players, activePlayerIndex: activeIndex, phase };
    }
    case "ADJUST_ENERGY":
      return { ...state, players: state.players.map(p => p.id === action.id ? { ...p, energy: Math.max(0, p.energy + action.delta) } : p) };
    case "ADJUST_CMD_DAMAGE": {
      let players = state.players.map(p => {
        if (p.id !== action.targetId) return p;
        const newDmg = Math.max(0, (p.commanderDamage[action.sourceId] ?? 0) + action.delta);
        const updated = { ...p, commanderDamage: { ...p.commanderDamage, [action.sourceId]: newDmg }, life: p.life - action.delta, lifeAnim: (action.delta > 0 ? "decrease" : "increase") as LifeAnim, animKey: p.animKey + 1 };
        if (checkEliminated(updated)) updated.isEliminated = true;
        return updated;
      });
      let activeIndex = state.activePlayerIndex;
      let phase: GameState["phase"] = state.phase;
      if (players[activeIndex]?.isEliminated) {
        const next = nextAlivePlayer(players, activeIndex);
        if (next === -1) phase = "finished";
        else activeIndex = next;
      }
      return { ...state, players, activePlayerIndex: activeIndex, phase };
    }
    case "CLEAR_ANIM":
      return { ...state, players: state.players.map(p => p.id === action.id ? { ...p, [action.field]: "" } : p) };
    case "TOGGLE_PAUSE":
      return { ...state, isPaused: !state.isPaused };
    case "RESET_GAME":
      return {
        phase: "setup",
        format: state.format,
        totalTimeMinutes: state.totalTimeMinutes,
        activePlayerIndex: 0,
        isPaused: false,
        globalElapsedMs: 0,
        players: state.players.map((p, i) => makePlayer(i, state.format)),
      };
    default:
      return state;
  }
}

// ── useAnimatedNumber ─────────────────────────────────────────────────────────
function useAnimatedNumber(target: number, duration = 300): number {
  const [displayed, setDisplayed] = useState(target);
  const rafRef = useRef<number>(0);
  const prevRef = useRef(target);

  useEffect(() => {
    const start = prevRef.current;
    prevRef.current = target;
    if (start === target) return;
    const startTime = performance.now();
    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(Math.round(start + (target - start) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return displayed;
}

// ── Life Anim CSS mapping ─────────────────────────────────────────────────────
const LIFE_ANIM_PANEL: Record<LifeAnim, string> = {
  "": "",
  decrease: "life-shake",
  increase: "",
  "decrease-big": "life-shake-big",
  "increase-big": "",
};
const LIFE_ANIM_NUMBER: Record<LifeAnim, string> = {
  "": "",
  decrease: "life-pulse-red",
  increase: "life-pulse-green",
  "decrease-big": "life-pulse-red-big",
  "increase-big": "life-pulse-green-big",
};

// ── Setup Screen ──────────────────────────────────────────────────────────────
function GameSetup({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<Action> }) {
  const perPlayer = state.players.length > 0 ? Math.floor(state.totalTimeMinutes / state.players.length) : 0;

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-10">
        <h1 className="font-display font-extrabold text-5xl text-white leading-none mb-2">Life Counter</h1>
        <p className="text-sm text-muted">Set up your game, then start the clock</p>
      </div>

      {/* Format */}
      <div className="glass rounded-2xl p-6 mb-4" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Format</p>
        <div className="flex flex-wrap gap-2">
          {FORMATS.map(f => (
            <button key={f} onClick={() => dispatch({ type: "SET_FORMAT", format: f })}
              className="px-4 py-2 rounded-xl text-sm font-bold capitalize transition-all"
              style={state.format === f
                ? { background: "rgba(0,212,255,0.15)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.3)", boxShadow: "0 0 12px rgba(0,212,255,0.15)" }
                : { background: "rgba(30,45,69,0.3)", color: "#3d5068", border: "1px solid #1e2d45" }
              }>
              {f} <span className="ml-1 opacity-60">({FORMAT_LIFE[f]})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Players */}
      <div className="glass rounded-2xl p-6 mb-4" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Players</p>
          {state.players.length < 6 && (
            <button onClick={() => dispatch({ type: "ADD_PLAYER" })} className="text-xs font-bold px-3 py-1 rounded-lg"
              style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa" }}>
              + Add
            </button>
          )}
        </div>
        <div className="space-y-2">
          {state.players.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: p.color }} />
              <input
                value={p.name}
                onChange={e => dispatch({ type: "RENAME_PLAYER", id: p.id, name: e.target.value })}
                className="flex-1 bg-surface-2 border border-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-neon transition-colors"
              />
              {state.players.length > 2 && (
                <button onClick={() => dispatch({ type: "REMOVE_PLAYER", id: p.id })} className="text-muted hover:text-pink text-sm transition-colors">✕</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Time */}
      <div className="glass rounded-2xl p-6 mb-6" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
        <p className="text-xs font-bold uppercase tracking-widest text-muted mb-3">Game Time</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {TIME_OPTIONS.map(m => (
            <button key={m} onClick={() => dispatch({ type: "SET_TIME", minutes: m })}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={state.totalTimeMinutes === m
                ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)" }
                : { background: "rgba(30,45,69,0.3)", color: "#3d5068", border: "1px solid #1e2d45" }
              }>
              {m}min
            </button>
          ))}
        </div>
        <p className="text-sm text-center" style={{ color: "#3d5068" }}>
          = <span className="text-gold font-bold">{perPlayer} min</span> per player
        </p>
      </div>

      {/* Start */}
      <button
        onClick={() => dispatch({ type: "START_GAME" })}
        className="w-full py-4 rounded-2xl text-lg font-display font-bold text-white transition-all"
        style={{
          background: "linear-gradient(135deg, #f59e0b 0%, #ff0080 100%)",
          boxShadow: "0 0 30px rgba(245,158,11,0.25), 0 0 60px rgba(255,0,128,0.15)",
        }}>
        ⚔ Start Game
      </button>
    </div>
  );
}

// ── Player Panel ──────────────────────────────────────────────────────────────
function PlayerPanel({
  player,
  allPlayers,
  isActive,
  isCommander,
  dispatch,
}: {
  player: Player;
  allPlayers: Player[];
  isActive: boolean;
  isCommander: boolean;
  dispatch: React.Dispatch<Action>;
}) {
  const [showCmdDmg, setShowCmdDmg] = useState(false);
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(player.name);
  const displayedLife = useAnimatedNumber(player.life);
  const timerLow = player.timeRemainingMs < 60000 && player.timeRemainingMs > 0;
  const timerOut = player.timeRemainingMs <= 0;
  const totalCmdDmg = Object.values(player.commanderDamage).reduce((s, v) => s + v, 0);

  // Auto-clear animations
  useEffect(() => {
    if (player.lifeAnim) {
      const t = player.lifeAnim.includes("big") ? 700 : 600;
      const id = setTimeout(() => dispatch({ type: "CLEAR_ANIM", id: player.id, field: "lifeAnim" }), t);
      return () => clearTimeout(id);
    }
  }, [player.lifeAnim, player.animKey, player.id, dispatch]);

  useEffect(() => {
    if (player.poisonAnim) {
      const id = setTimeout(() => dispatch({ type: "CLEAR_ANIM", id: player.id, field: "poisonAnim" }), 800);
      return () => clearTimeout(id);
    }
  }, [player.poisonAnim, player.animKey, player.id, dispatch]);

  if (player.isEliminated) {
    return (
      <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-2"
        style={{ border: "1px solid rgba(255,0,128,0.2)", opacity: 0.5, minHeight: 200 }}>
        <p className="text-3xl">💀</p>
        <p className="text-sm font-bold" style={{ color: player.color }}>{player.name}</p>
        <p className="text-xs text-muted">Eliminated</p>
      </div>
    );
  }

  const panelAnimClass = LIFE_ANIM_PANEL[player.lifeAnim];
  const numberAnimClass = LIFE_ANIM_NUMBER[player.lifeAnim];

  return (
    <div
      key={player.animKey + "-panel"}
      className={`glass rounded-2xl overflow-hidden relative transition-transform duration-300 ${panelAnimClass} ${isActive ? "turn-active" : ""}`}
      style={{
        "--player-color": player.color,
        border: `1px solid ${isActive ? player.color : "rgba(30,45,69,0.6)"}`,
        transform: isActive ? "scale(1.02)" : "scale(1)",
      } as React.CSSProperties}
    >
      {/* Color bar */}
      <div className="h-1.5" style={{ background: isActive ? player.color : `${player.color}66` }} />

      <div className="p-4">
        {/* Header: name + timer */}
        <div className="flex items-center justify-between mb-2">
          {editName ? (
            <input autoFocus value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => { dispatch({ type: "RENAME_PLAYER", id: player.id, name: nameVal }); setEditName(false); }}
              onKeyDown={e => { if (e.key === "Enter") { dispatch({ type: "RENAME_PLAYER", id: player.id, name: nameVal }); setEditName(false); } }}
              className="bg-transparent border-b text-sm font-bold focus:outline-none flex-1"
              style={{ borderColor: player.color, color: player.color }} />
          ) : (
            <button onClick={() => setEditName(true)} className="text-sm font-bold" style={{ color: player.color }}>{player.name}</button>
          )}
          <div className={`font-mono text-sm font-bold ${timerOut ? "time-alert-flash" : ""}`}
            style={{ color: timerOut ? "#ff0080" : timerLow ? "#f59e0b" : "#3d5068" }}>
            ⏱ {formatTime(player.timeRemainingMs)}
          </div>
        </div>

        {/* Life total */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => dispatch({ type: "ADJUST_LIFE", id: player.id, delta: -1 })}
            onContextMenu={e => { e.preventDefault(); dispatch({ type: "ADJUST_LIFE", id: player.id, delta: -5 }); }}
            className="w-14 h-14 rounded-xl text-2xl font-black transition-all active:scale-90"
            style={{ background: `${player.color}15`, color: player.color }}>
            −
          </button>
          <div className="text-center">
            <p key={player.animKey}
              className={`text-6xl font-black leading-none transition-colors ${numberAnimClass}`}
              style={{ color: player.life <= 5 ? "#ff0080" : "white" }}>
              {displayedLife}
            </p>
            <p className="text-xs text-muted mt-0.5">life</p>
          </div>
          <button
            onClick={() => dispatch({ type: "ADJUST_LIFE", id: player.id, delta: 1 })}
            onContextMenu={e => { e.preventDefault(); dispatch({ type: "ADJUST_LIFE", id: player.id, delta: 5 }); }}
            className="w-14 h-14 rounded-xl text-2xl font-black transition-all active:scale-90"
            style={{ background: `${player.color}15`, color: player.color }}>
            +
          </button>
        </div>

        {/* Counters */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex items-center gap-1 bg-surface-2 rounded-lg px-2 py-1.5">
            <button onClick={() => dispatch({ type: "ADJUST_POISON", id: player.id, delta: -1 })} className="text-muted hover:text-white text-xs w-4">−</button>
            <div className={`flex-1 text-center ${player.poisonAnim ? "poison-drip" : ""}`}>
              <p className="text-xs text-muted">☠ Poison</p>
              <p className="text-sm font-bold" style={{ color: player.poison >= 10 ? "#ff0080" : player.poison >= 7 ? "#f59e0b" : "white" }}>
                {player.poison}/10
              </p>
            </div>
            <button onClick={() => dispatch({ type: "ADJUST_POISON", id: player.id, delta: 1 })} className="text-muted hover:text-white text-xs w-4">+</button>
          </div>
          <div className="flex-1 flex items-center gap-1 bg-surface-2 rounded-lg px-2 py-1.5">
            <button onClick={() => dispatch({ type: "ADJUST_ENERGY", id: player.id, delta: -1 })} className="text-muted hover:text-white text-xs w-4">−</button>
            <div className="flex-1 text-center">
              <p className="text-xs text-muted">⚡ Energy</p>
              <p className="text-sm font-bold text-yellow-400">{player.energy}</p>
            </div>
            <button onClick={() => dispatch({ type: "ADJUST_ENERGY", id: player.id, delta: 1 })} className="text-muted hover:text-white text-xs w-4">+</button>
          </div>
        </div>

        {/* Commander damage */}
        {isCommander && (
          <div className="mb-3">
            <button onClick={() => setShowCmdDmg(v => !v)}
              className="w-full text-xs flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors"
              style={{ background: "rgba(124,58,237,0.1)", color: "#a78bfa" }}>
              <span>⚔ Commander Damage ({totalCmdDmg}/21)</span>
              <span>{showCmdDmg ? "▲" : "▼"}</span>
            </button>
            {showCmdDmg && (
              <div className="mt-2 space-y-1">
                {allPlayers.filter(p => p.id !== player.id && !p.isEliminated).map(src => (
                  <div key={src.id} className="flex items-center gap-2 px-2">
                    <span className="text-xs flex-1" style={{ color: src.color }}>{src.name}</span>
                    <button onClick={() => dispatch({ type: "ADJUST_CMD_DAMAGE", targetId: player.id, sourceId: src.id, delta: -1 })} className="text-muted hover:text-white text-xs w-5">−</button>
                    <span className="text-sm font-bold w-5 text-center" style={{ color: (player.commanderDamage[src.id] ?? 0) >= 21 ? "#ff0080" : "white" }}>
                      {player.commanderDamage[src.id] ?? 0}
                    </span>
                    <button onClick={() => dispatch({ type: "ADJUST_CMD_DAMAGE", targetId: player.id, sourceId: src.id, delta: 1 })} className="text-muted hover:text-white text-xs w-5">+</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pass Turn */}
        {isActive && (
          <button
            onClick={() => dispatch({ type: "PASS_TURN" })}
            className="w-full py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${player.color}33, ${player.color}11)`,
              border: `1px solid ${player.color}66`,
              color: player.color,
            }}>
            ⏭ Pass Turn
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function LifePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const initialState: GameState = {
    phase: "setup",
    format: "commander",
    players: [0, 1, 2, 3].map(i => makePlayer(i, "commander")),
    totalTimeMinutes: 60,
    activePlayerIndex: 0,
    isPaused: false,
    globalElapsedMs: 0,
  };

  const [state, dispatch] = useReducer(reducer, initialState);
  const isCommander = state.format === "commander" || state.format === "brawl";

  // Timer tick
  useEffect(() => {
    if (state.phase !== "playing" || state.isPaused) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 100);
    return () => clearInterval(id);
  }, [state.phase, state.isPaused]);

  if (authLoading) return null;

  // ── Setup phase ──
  if (state.phase === "setup") {
    return (
      <div className="p-6">
        <GameSetup state={state} dispatch={dispatch} />
      </div>
    );
  }

  // ── Finished phase ──
  if (state.phase === "finished") {
    const winner = state.players.find(p => !p.isEliminated);
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <div className="glass rounded-2xl p-12" style={{ border: "1px solid rgba(245,158,11,0.3)", boxShadow: "0 0 60px rgba(245,158,11,0.15)" }}>
          <p className="text-6xl mb-4">🏆</p>
          <h2 className="font-display font-extrabold text-3xl text-white mb-2">Game Over!</h2>
          {winner && (
            <p className="text-xl font-bold mb-6" style={{ color: winner.color }}>{winner.name} wins!</p>
          )}
          <button onClick={() => dispatch({ type: "RESET_GAME" })}
            className="px-8 py-3 rounded-xl text-sm font-bold text-white transition-all"
            style={{ background: "linear-gradient(135deg, #00d4ff, #7c3aed)" }}>
            New Game
          </button>
        </div>
      </div>
    );
  }

  // ── Playing phase ──
  const gridClass =
    state.players.length <= 2 ? "grid-cols-1 sm:grid-cols-2" :
    state.players.length <= 4 ? "grid-cols-2" :
    "grid-cols-2 lg:grid-cols-3";

  return (
    <div className="p-4 max-w-7xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 glass rounded-xl px-4 py-3" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
        <button onClick={() => dispatch({ type: "TOGGLE_PAUSE" })}
          className="px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
          style={state.isPaused
            ? { background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }
            : { background: "rgba(255,0,128,0.08)", border: "1px solid rgba(255,0,128,0.2)", color: "#ff0080" }
          }>
          {state.isPaused ? "▶ Resume" : "⏸ Pause"}
        </button>

        <div className="text-center">
          <p className="text-xs text-muted">Total Elapsed</p>
          <p className="text-xl font-mono font-bold text-white">{formatTime(state.globalElapsedMs)}</p>
        </div>

        <button onClick={() => { if (confirm("Reset the entire game?")) dispatch({ type: "RESET_GAME" }); }}
          className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all"
          style={{ background: "rgba(61,80,104,0.3)", border: "1px solid #1e2d45", color: "#3d5068" }}>
          ↺ New Game
        </button>
      </div>

      {/* Paused overlay */}
      {state.isPaused && (
        <div className="text-center mb-4 py-2 rounded-xl" style={{ background: "rgba(0,212,255,0.06)", border: "1px solid rgba(0,212,255,0.15)" }}>
          <p className="text-sm font-bold text-neon animate-pulse">⏸ PAUSED</p>
        </div>
      )}

      {/* Player grid */}
      <div className={`grid gap-4 ${gridClass}`}>
        {state.players.map((player, i) => (
          <PlayerPanel
            key={player.id}
            player={player}
            allPlayers={state.players}
            isActive={i === state.activePlayerIndex && !player.isEliminated}
            isCommander={isCommander}
            dispatch={dispatch}
          />
        ))}
      </div>

      {/* Tips */}
      <p className="text-center text-xs text-muted mt-4">
        Right-click ± for ±5 · Active player&apos;s clock ticks down · Pass turn to advance
      </p>
    </div>
  );
}

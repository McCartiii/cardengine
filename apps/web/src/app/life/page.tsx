"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────
type Format = "standard" | "modern" | "commander" | "brawl" | "legacy" | "vintage";

interface CommanderDamage {
  [fromPlayerId: string]: number;
}

interface Player {
  id: string;
  name: string;
  life: number;
  poison: number;
  energy: number;
  commanderDamage: CommanderDamage;
  color: string;
}

const FORMAT_LIFE: Record<Format, number> = {
  standard: 20, modern: 20, legacy: 20, vintage: 20,
  commander: 40, brawl: 25,
};

const PLAYER_COLORS = [
  "#00d4ff", "#ff0080", "#7c3aed", "#f59e0b", "#4ade80", "#f97316",
];

const FORMATS: Format[] = ["standard", "modern", "commander", "brawl", "legacy", "vintage"];

function makePlayer(id: string, name: string, startingLife: number, color: string): Player {
  return { id, name, life: startingLife, poison: 0, energy: 0, commanderDamage: {}, color };
}

// ── Timer Component ────────────────────────────────────────────────────────────
function GameTimer() {
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [limit, setLimit] = useState(50); // minutes
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const reset = () => { setRunning(false); setElapsed(0); };
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const totalMinutes = elapsed / 60;
  const progress = Math.min(totalMinutes / limit, 1);
  const isWarning = totalMinutes >= limit * 0.8;
  const isOver = totalMinutes >= limit;

  const timeColor = isOver ? "#ff0080" : isWarning ? "#f59e0b" : "#00d4ff";

  return (
    <div className="glass rounded-2xl p-4 border" style={{ borderColor: `${timeColor}33` }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Game Timer</p>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted">Limit:</label>
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="bg-surface-2 border border-border rounded px-2 py-0.5 text-xs text-white focus:outline-none"
          >
            {[25, 30, 40, 50, 60, 75, 90].map(m => (
              <option key={m} value={m}>{m}min</option>
            ))}
          </select>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-surface-2 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${progress * 100}%`, background: isOver ? "#ff0080" : isWarning ? "#f59e0b" : "linear-gradient(90deg, #00d4ff, #7c3aed)" }}
        />
      </div>

      <div className="flex items-center justify-between">
        <p className="text-3xl font-mono font-bold" style={{ color: timeColor }}>
          {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          {isOver && <span className="text-sm ml-2 animate-pulse">OVERTIME</span>}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setRunning(r => !r)}
            className="px-4 py-1.5 rounded-lg text-sm font-bold transition-all"
            style={running
              ? { background: "rgba(255,0,128,0.1)", border: "1px solid rgba(255,0,128,0.3)", color: "#ff0080" }
              : { background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.3)", color: "#00d4ff" }
            }
          >
            {running ? "⏸ Pause" : "▶ Start"}
          </button>
          <button
            onClick={reset}
            className="px-3 py-1.5 rounded-lg text-sm transition-all"
            style={{ background: "rgba(61,80,104,0.3)", border: "1px solid #1e2d45", color: "#3d5068" }}
          >
            ↺
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Player Panel ───────────────────────────────────────────────────────────────
function PlayerPanel({
  player,
  allPlayers,
  isCommander,
  onLifeChange,
  onPoisonChange,
  onEnergyChange,
  onCmdDmg,
  onNameChange,
  onRemove,
}: {
  player: Player;
  allPlayers: Player[];
  isCommander: boolean;
  onLifeChange: (delta: number) => void;
  onPoisonChange: (delta: number) => void;
  onEnergyChange: (delta: number) => void;
  onCmdDmg: (fromId: string, delta: number) => void;
  onNameChange: (name: string) => void;
  onRemove: () => void;
}) {
  const [showCmdDmg, setShowCmdDmg] = useState(false);
  const [editName, setEditName] = useState(false);
  const [nameVal, setNameVal] = useState(player.name);
  const isDead = player.life <= 0 || player.poison >= 10;

  const totalCmdDmg = Object.values(player.commanderDamage).reduce((s, v) => s + v, 0);

  return (
    <div
      className="glass rounded-2xl overflow-hidden relative"
      style={{
        border: `1px solid ${player.color}33`,
        boxShadow: isDead ? "none" : `0 0 20px ${player.color}11`,
        opacity: isDead ? 0.5 : 1,
      }}
    >
      {isDead && (
        <div className="absolute inset-0 flex items-center justify-center z-10 rounded-2xl" style={{ background: "rgba(6,8,16,0.7)" }}>
          <p className="text-2xl font-black text-red-400 rotate-[-15deg]">💀 ELIMINATED</p>
        </div>
      )}

      {/* Color bar */}
      <div className="h-1" style={{ background: player.color }} />

      <div className="p-4">
        {/* Name + remove */}
        <div className="flex items-center justify-between mb-3">
          {editName ? (
            <input
              autoFocus
              value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={() => { onNameChange(nameVal); setEditName(false); }}
              onKeyDown={e => { if (e.key === "Enter") { onNameChange(nameVal); setEditName(false); } }}
              className="bg-transparent border-b text-sm font-bold focus:outline-none flex-1"
              style={{ borderColor: player.color, color: player.color }}
            />
          ) : (
            <button onClick={() => setEditName(true)} className="text-sm font-bold" style={{ color: player.color }}>
              {player.name}
            </button>
          )}
          <button onClick={onRemove} className="text-muted hover:text-red-400 transition-colors text-xs ml-2">✕</button>
        </div>

        {/* Life total */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => onLifeChange(-1)}
            onContextMenu={e => { e.preventDefault(); onLifeChange(-5); }}
            className="w-12 h-12 rounded-xl text-2xl font-black transition-all active:scale-95"
            style={{ background: `${player.color}15`, color: player.color }}
          >
            −
          </button>
          <div className="text-center">
            <p className="text-6xl font-black leading-none" style={{ color: player.life <= 5 ? "#ff0080" : "white" }}>
              {player.life}
            </p>
            <p className="text-xs text-muted mt-0.5">life</p>
          </div>
          <button
            onClick={() => onLifeChange(1)}
            onContextMenu={e => { e.preventDefault(); onLifeChange(5); }}
            className="w-12 h-12 rounded-xl text-2xl font-black transition-all active:scale-95"
            style={{ background: `${player.color}15`, color: player.color }}
          >
            +
          </button>
        </div>

        {/* Counters row */}
        <div className="flex gap-2 mb-3">
          {/* Poison */}
          <div className="flex-1 flex items-center gap-1 bg-surface-2 rounded-lg px-2 py-1.5">
            <button onClick={() => onPoisonChange(-1)} className="text-muted hover:text-white text-xs w-4">−</button>
            <div className="flex-1 text-center">
              <p className="text-xs text-muted">☠ Poison</p>
              <p className="text-sm font-bold" style={{ color: player.poison >= 10 ? "#ff0080" : player.poison >= 7 ? "#f59e0b" : "white" }}>
                {player.poison}/10
              </p>
            </div>
            <button onClick={() => onPoisonChange(1)} className="text-muted hover:text-white text-xs w-4">+</button>
          </div>

          {/* Energy */}
          <div className="flex-1 flex items-center gap-1 bg-surface-2 rounded-lg px-2 py-1.5">
            <button onClick={() => onEnergyChange(-1)} className="text-muted hover:text-white text-xs w-4">−</button>
            <div className="flex-1 text-center">
              <p className="text-xs text-muted">⚡ Energy</p>
              <p className="text-sm font-bold text-yellow-400">{player.energy}</p>
            </div>
            <button onClick={() => onEnergyChange(1)} className="text-muted hover:text-white text-xs w-4">+</button>
          </div>
        </div>

        {/* Commander damage */}
        {isCommander && (
          <div>
            <button
              onClick={() => setShowCmdDmg(v => !v)}
              className="w-full text-xs flex items-center justify-between py-1.5 px-2 rounded-lg transition-colors"
              style={{ background: "rgba(124,58,237,0.1)", color: "#a78bfa" }}
            >
              <span>⚔ Commander Damage ({totalCmdDmg}/21)</span>
              <span>{showCmdDmg ? "▲" : "▼"}</span>
            </button>
            {showCmdDmg && (
              <div className="mt-2 space-y-1">
                {allPlayers.filter(p => p.id !== player.id).map(src => (
                  <div key={src.id} className="flex items-center gap-2 px-2">
                    <span className="text-xs flex-1" style={{ color: src.color }}>{src.name}</span>
                    <button onClick={() => onCmdDmg(src.id, -1)} className="text-muted hover:text-white text-xs w-5">−</button>
                    <span className="text-sm font-bold w-5 text-center" style={{ color: (player.commanderDamage[src.id] ?? 0) >= 21 ? "#ff0080" : "white" }}>
                      {player.commanderDamage[src.id] ?? 0}
                    </span>
                    <button onClick={() => onCmdDmg(src.id, 1)} className="text-muted hover:text-white text-xs w-5">+</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function LifePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const [format, setFormat] = useState<Format>("commander");
  const [players, setPlayers] = useState<Player[]>([
    makePlayer("p1", "Player 1", FORMAT_LIFE.commander, PLAYER_COLORS[0]),
    makePlayer("p2", "Player 2", FORMAT_LIFE.commander, PLAYER_COLORS[1]),
    makePlayer("p3", "Player 3", FORMAT_LIFE.commander, PLAYER_COLORS[2]),
    makePlayer("p4", "Player 4", FORMAT_LIFE.commander, PLAYER_COLORS[3]),
  ]);
  const [gameStarted, setGameStarted] = useState(false);

  const isCommander = format === "commander" || format === "brawl";

  function applyFormat(f: Format) {
    setFormat(f);
    const life = FORMAT_LIFE[f];
    setPlayers(prev => prev.map(p => ({ ...p, life, poison: 0, energy: 0, commanderDamage: {} })));
  }

  function addPlayer() {
    if (players.length >= 6) return;
    const idx = players.length;
    setPlayers(prev => [...prev, makePlayer(`p${Date.now()}`, `Player ${idx + 1}`, FORMAT_LIFE[format], PLAYER_COLORS[idx % PLAYER_COLORS.length])]);
  }

  function removePlayer(id: string) {
    setPlayers(prev => prev.filter(p => p.id !== id));
  }

  function updatePlayer(id: string, updater: (p: Player) => Player) {
    setPlayers(prev => prev.map(p => p.id === id ? updater(p) : p));
  }

  function resetGame() {
    const life = FORMAT_LIFE[format];
    setPlayers(prev => prev.map(p => ({ ...p, life, poison: 0, energy: 0, commanderDamage: {} })));
  }

  if (authLoading) return null;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Life Counter</h1>
          <p className="text-sm text-muted">Multi-player life tracking with game timer</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Format selector */}
          <div className="flex bg-surface rounded-xl p-1 border border-border gap-1">
            {FORMATS.map(f => (
              <button
                key={f}
                onClick={() => applyFormat(f)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-colors capitalize"
                style={format === f
                  ? { background: "rgba(0,212,255,0.15)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.3)" }
                  : { color: "#3d5068" }
                }
              >
                {f}
              </button>
            ))}
          </div>

          {players.length < 6 && (
            <button
              onClick={addPlayer}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.3)", color: "#a78bfa" }}
            >
              + Add Player
            </button>
          )}
          <button
            onClick={resetGame}
            className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "rgba(255,0,128,0.08)", border: "1px solid rgba(255,0,128,0.2)", color: "#ff0080" }}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Timer */}
      <div className="mb-6">
        <GameTimer />
      </div>

      {/* Player grid */}
      <div className={`grid gap-4 ${
        players.length <= 2 ? "grid-cols-1 sm:grid-cols-2" :
        players.length <= 4 ? "grid-cols-2 lg:grid-cols-4" :
        "grid-cols-2 lg:grid-cols-3"
      }`}>
        {players.map(player => (
          <PlayerPanel
            key={player.id}
            player={player}
            allPlayers={players}
            isCommander={isCommander}
            onLifeChange={delta => updatePlayer(player.id, p => ({ ...p, life: p.life + delta }))}
            onPoisonChange={delta => updatePlayer(player.id, p => ({ ...p, poison: Math.max(0, p.poison + delta) }))}
            onEnergyChange={delta => updatePlayer(player.id, p => ({ ...p, energy: Math.max(0, p.energy + delta) }))}
            onCmdDmg={(fromId, delta) => updatePlayer(player.id, p => ({
              ...p,
              commanderDamage: { ...p.commanderDamage, [fromId]: Math.max(0, (p.commanderDamage[fromId] ?? 0) + delta) },
              life: p.life - delta,
            }))}
            onNameChange={name => updatePlayer(player.id, p => ({ ...p, name }))}
            onRemove={() => removePlayer(player.id)}
          />
        ))}
      </div>

      {/* Quick tips */}
      <p className="text-center text-xs text-muted mt-6">
        Right-click ± buttons for ±5 · Poison ≥ 10 or Commander damage ≥ 21 = eliminated
      </p>
    </div>
  );
}

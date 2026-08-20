"use client";

import { useState } from "react";

export type DeckInputMethod = "none" | "paste" | "url" | "saved";

const BRACKET_INFO = [
  { label: "Exhibition", desc: "Precon level, janky fun" },
  { label: "Core", desc: "Upgraded precon, casual" },
  { label: "Upgraded", desc: "Focused strategy" },
  { label: "Optimized", desc: "Near-cEDH, efficient" },
  { label: "cEDH", desc: "Fully competitive" },
];

interface SavedDeck {
  id: string;
  name: string;
  commander?: string | null;
}

export interface InputPanelInitialValues {
  bracket?: 1 | 2 | 3 | 4 | 5;
  budget?: number;
  blueprint?: {
    goals?: string[];
    keyCards?: string[];
    avoidCards?: string[];
    modelAfter?: string;
    playSpeed?: "slow" | "balanced" | "fast";
    comboTolerance?: "none" | "low" | "medium" | "high";
    tablePressure?: "low" | "medium" | "high";
    notes?: string;
  };
}

interface InputPanelProps {
  format: "commander" | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper";
  savedDecks: SavedDeck[];
  initialValues?: InputPanelInitialValues;
  onSubmit: (params: {
    instruction: string;
    format: "commander" | "standard" | "pioneer" | "modern" | "legacy" | "vintage" | "pauper";
    bracket: 1 | 2 | 3 | 4 | 5;
    budget: number;
    deckText?: string;
    deckUrl?: string;
    deckId?: string;
    blueprint?: {
      goals?: string[];
      keyCards?: string[];
      avoidCards?: string[];
      modelAfter?: string;
      playSpeed?: "slow" | "balanced" | "fast";
      comboTolerance?: "none" | "low" | "medium" | "high";
      tablePressure?: "low" | "medium" | "high";
      notes?: string;
    };
  }) => void;
  loading: boolean;
}

const GOAL_OPTIONS = ["speed", "resilience", "value", "combo", "interaction", "consistency", "fun", "theme"] as const;

export function InputPanel({ format, savedDecks, initialValues, onSubmit, loading }: InputPanelProps) {
  const [bracket, setBracket] = useState<1 | 2 | 3 | 4 | 5>(initialValues?.bracket ?? 3);
  const [budget, setBudget] = useState(initialValues?.budget ?? 200);
  const [instruction, setInstruction] = useState("");
  const [inputMethod, setInputMethod] = useState<DeckInputMethod>("none");
  const [deckText, setDeckText] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckId, setDeckId] = useState("");
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialValues?.blueprint?.goals ?? []);
  const [keyCards, setKeyCards] = useState(initialValues?.blueprint?.keyCards?.join(", ") ?? "");
  const [avoidCards, setAvoidCards] = useState(initialValues?.blueprint?.avoidCards?.join(", ") ?? "");
  const [modelAfter, setModelAfter] = useState(initialValues?.blueprint?.modelAfter ?? "");
  const [playSpeed, setPlaySpeed] = useState<"slow" | "balanced" | "fast">(
    initialValues?.blueprint?.playSpeed ?? "balanced"
  );
  const [comboTolerance, setComboTolerance] = useState<"none" | "low" | "medium" | "high">(
    initialValues?.blueprint?.comboTolerance ?? "medium"
  );
  const [tablePressure, setTablePressure] = useState<"low" | "medium" | "high">(
    initialValues?.blueprint?.tablePressure ?? "low"
  );
  const [pilotNotes, setPilotNotes] = useState(initialValues?.blueprint?.notes ?? "");

  function parseCsv(input: string): string[] {
    return input
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  function toggleGoal(goal: string) {
    setSelectedGoals((prev) => (prev.includes(goal) ? prev.filter((g) => g !== goal) : [...prev, goal]));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;

    onSubmit({
      instruction: instruction.trim(),
      format,
      bracket,
      budget,
      deckText: inputMethod === "paste" ? deckText : undefined,
      deckUrl: inputMethod === "url" ? deckUrl : undefined,
      deckId: inputMethod === "saved" ? deckId : undefined,
      blueprint: {
        goals: selectedGoals.length ? selectedGoals : undefined,
        keyCards: parseCsv(keyCards).length ? parseCsv(keyCards) : undefined,
        avoidCards: parseCsv(avoidCards).length ? parseCsv(avoidCards) : undefined,
        modelAfter: modelAfter.trim() || undefined,
        ...(format === "commander"
          ? {
              playSpeed,
              comboTolerance,
              tablePressure,
              notes: pilotNotes.trim() || undefined,
            }
          : {}),
      },
    });
  }

  const bracketInfo = BRACKET_INFO[bracket - 1];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="text-[11px] text-slate-400">
        Format: <span className="font-semibold text-slate-200 capitalize">{format}</span>
      </div>

      {/* Commander-only: RC power brackets */}
      {format === "commander" && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Power Level (RC Bracket)
            </label>
            <span className="text-xs font-bold text-teal-400">
              {bracket} — {bracketInfo?.label}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={bracket}
            onChange={(e) => setBracket(parseInt(e.target.value) as 1 | 2 | 3 | 4 | 5)}
            className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-teal-500"
          />
          <div className="flex justify-between mt-1">
            {BRACKET_INFO.map((b, i) => (
              <span key={i} className={`text-xs ${i + 1 === bracket ? "text-teal-400 font-semibold" : "text-slate-600"}`}>
                {i + 1}
              </span>
            ))}
          </div>
          {bracketInfo && <p className="text-xs text-slate-500 mt-1">{bracketInfo.desc}</p>}
        </div>
      )}

      {/* Budget slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Budget
          </label>
          <span className="text-xs font-bold text-teal-400">
            {budget >= 1000 ? "$1000+" : `$${budget}`}
          </span>
        </div>
        <input
          type="range"
          min={25}
          max={1000}
          step={25}
          value={budget}
          onChange={(e) => setBudget(parseInt(e.target.value))}
          className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-teal-500"
        />
        <div className="flex justify-between mt-1">
          {["$25", "$250", "$500", "$750", "$1000+"].map((label) => (
            <span key={label} className="text-xs text-slate-600">{label}</span>
          ))}
        </div>
      </div>

      {/* Customization */}
      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">
          Deck Goals
        </label>
        <div className="flex flex-wrap gap-1.5">
          {GOAL_OPTIONS.map((goal) => {
            const selected = selectedGoals.includes(goal);
            return (
              <button
                key={goal}
                type="button"
                onClick={() => toggleGoal(goal)}
                className={[
                  "text-[11px] px-2 py-1 rounded-lg border transition-colors capitalize",
                  selected
                    ? "bg-teal-600/30 text-teal-200 border-teal-500/50"
                    : "bg-slate-800/60 text-slate-400 border-slate-600/40 hover:border-slate-500/60",
                ].join(" ")}
              >
                {goal}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 block">
          Key Cards (comma separated)
        </label>
        <input
          type="text"
          value={keyCards}
          onChange={(e) => setKeyCards(e.target.value)}
          placeholder="Smothering Tithe, Teferi's Protection"
          className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 block">
          Avoid Cards (comma separated)
        </label>
        <input
          type="text"
          value={avoidCards}
          onChange={(e) => setAvoidCards(e.target.value)}
          placeholder="Mana Crypt, Dockside Extortionist"
          className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50"
        />
      </div>

      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 block">
          Model After (optional)
        </label>
        <input
          type="text"
          value={modelAfter}
          onChange={(e) => setModelAfter(e.target.value)}
          placeholder="A specific decklist URL, creator, or archetype baseline"
          className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50"
        />
      </div>

      {format === "commander" && (
        <div className="rounded-xl border border-slate-600/40 bg-slate-900/40 p-3 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Playstyle (Commander)</div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Refines card choices inside your RC bracket. Bracket rules in the agent prompt still win if something conflicts.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Speed</span>
              <select
                value={playSpeed}
                onChange={(e) => setPlaySpeed(e.target.value as typeof playSpeed)}
                className="mt-1 w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-2 py-1.5 text-slate-300"
              >
                <option value="slow">Slow / grind</option>
                <option value="balanced">Balanced</option>
                <option value="fast">Fast tempo</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Combos</span>
              <select
                value={comboTolerance}
                onChange={(e) => setComboTolerance(e.target.value as typeof comboTolerance)}
                className="mt-1 w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-2 py-1.5 text-slate-300"
              >
                <option value="none">None / fair magic</option>
                <option value="low">Light / telegraphed</option>
                <option value="medium">Strong synergies</option>
                <option value="high">Compact wins OK</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">MLD / stax</span>
              <select
                value={tablePressure}
                onChange={(e) => setTablePressure(e.target.value as typeof tablePressure)}
                className="mt-1 w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-2 py-1.5 text-slate-300"
              >
                <option value="low">Avoid</option>
                <option value="medium">Some OK</option>
                <option value="high">Archetype-driven</option>
              </select>
            </label>
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 block mb-1">
              Pod / house rules (optional)
            </label>
            <textarea
              value={pilotNotes}
              onChange={(e) => setPilotNotes(e.target.value)}
              rows={2}
              placeholder="e.g. No MLD, proxies OK, prefer 75% decks in pod…"
              className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 resize-none"
            />
          </div>
        </div>
      )}

      {/* Deck input method */}
      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 block">
          Existing Deck (optional)
        </label>
        <div className="flex gap-1.5 mb-2">
          {(["none", "paste", "url", "saved"] as DeckInputMethod[]).map((method) => (
            <button
              key={method}
              type="button"
              onClick={() => setInputMethod(method)}
              className={[
                "flex-1 text-xs py-1.5 rounded-lg border transition-colors capitalize",
                inputMethod === method
                  ? "bg-teal-600/30 text-teal-300 border-teal-500/50"
                  : "bg-slate-800/60 text-slate-400 border-slate-600/40 hover:border-slate-500/60",
              ].join(" ")}
            >
              {method === "none" ? "None" : method === "paste" ? "Paste" : method === "url" ? "URL" : "Saved"}
            </button>
          ))}
        </div>

        {inputMethod === "paste" && (
          <textarea
            value={deckText}
            onChange={(e) => setDeckText(e.target.value)}
            placeholder={"1 Sol Ring\n1 Command Tower\n..."}
            rows={6}
            className="w-full text-xs font-mono bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 resize-none"
          />
        )}

        {inputMethod === "url" && (
          <input
            type="url"
            value={deckUrl}
            onChange={(e) => setDeckUrl(e.target.value)}
            placeholder="https://www.moxfield.com/decks/..."
            className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50"
          />
        )}

        {inputMethod === "saved" && (
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="w-full text-xs bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 focus:outline-none focus:border-teal-500/50"
          >
            <option value="">Select a deck...</option>
            {savedDecks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.commander ? ` — ${d.commander}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Instruction text */}
      <div>
        <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 block">
          Instructions
        </label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Build me an Atraxa superfriends deck focused on proliferating planeswalkers. Include budget alternatives where possible."
          rows={4}
          className="w-full text-sm bg-slate-900/60 border border-slate-600/40 rounded-lg px-3 py-2 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-teal-500/50 resize-none leading-relaxed"
        />
      </div>

      {/* Run button */}
      <button
        type="submit"
        disabled={loading || !instruction.trim()}
        className={[
          "w-full py-3 rounded-xl font-bold text-sm transition-all duration-200",
          loading || !instruction.trim()
            ? "bg-slate-700/50 text-slate-500 cursor-not-allowed"
            : "bg-teal-600 hover:bg-teal-500 text-white shadow-lg shadow-teal-900/30",
        ].join(" ")}
      >
        {loading ? "Building..." : "Run Deck AI"}
      </button>
    </form>
  );
}

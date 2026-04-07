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

interface InputPanelProps {
  savedDecks: SavedDeck[];
  onSubmit: (params: {
    instruction: string;
    bracket: 1 | 2 | 3 | 4 | 5;
    budget: number;
    deckText?: string;
    deckUrl?: string;
    deckId?: string;
  }) => void;
  loading: boolean;
}

export function InputPanel({ savedDecks, onSubmit, loading }: InputPanelProps) {
  const [bracket, setBracket] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [budget, setBudget] = useState(200);
  const [instruction, setInstruction] = useState("");
  const [inputMethod, setInputMethod] = useState<DeckInputMethod>("none");
  const [deckText, setDeckText] = useState("");
  const [deckUrl, setDeckUrl] = useState("");
  const [deckId, setDeckId] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!instruction.trim()) return;

    onSubmit({
      instruction: instruction.trim(),
      bracket,
      budget,
      deckText: inputMethod === "paste" ? deckText : undefined,
      deckUrl: inputMethod === "url" ? deckUrl : undefined,
      deckId: inputMethod === "saved" ? deckId : undefined,
    });
  }

  const bracketInfo = BRACKET_INFO[bracket - 1];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Bracket slider */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
            Power Level (RC Bracket)
          </label>
          <span className="text-xs font-bold text-teal-400">{bracket} — {bracketInfo?.label}</span>
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

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

/**
 * Standalone visual prototype for a redesigned deck editor + AI companion.
 * Open: http://localhost:3000/deck-showcase
 *
 * Note: `omc ask gemini` failed in this environment (no GEMINI_API_KEY). This page
 * applies a fresh art direction without the previous teal-glass AI rail.
 */

type ThemeMode = "dark" | "light";

const MOCK_COMMANDER = {
  name: "Yuriko, the Tiger's Shadow",
  typeLine: "Legendary Creature — Human Ninja",
  image:
    "https://cards.scryfall.io/small/front/4/4/44466749-4153-47d6-b7b2-13fe55d47722.jpg?1673304718",
};

const MOCK_MAIN = [
  { name: "Mothdust Changeling", qty: 1, type: "Creature", cmc: 1, price: 2.4 },
  { name: "Ingenious Infiltrator", qty: 1, type: "Creature", cmc: 3, price: 0.35 },
  { name: "Retrofitter Foundry", qty: 1, type: "Artifact", cmc: 3, price: 6.2 },
  { name: "Command Beacon", qty: 1, type: "Land", cmc: 0, price: 14.9 },
  { name: "Demonic Tutor", qty: 1, type: "Sorcery", cmc: 2, price: 42.0 },
];

const MOCK_AI_TIERS = [
  {
    name: "Win Conditions",
    accent: "rose",
    cards: [
      {
        name: "Thassa's Oracle",
        reason: "Compact win after grinding advantage; respects compact meta.",
        tag: "critical",
      },
      { name: "Dramatic Reversal", reason: "Pairs with Isochron Scepter lines if you pivot.", tag: "high" },
    ],
  },
  {
    name: "Core Engine",
    accent: "amber",
    cards: [
      { name: "Sensei's Divining Top", reason: "Velocity + Yuriko triggers; always-good tempo glue.", tag: "high" },
    ],
  },
];

const MOCK_SWAPS = [
  {
    cut: "Coastal Piracy",
    add: "Bident of Thassa",
    delta: "+18% synergy",
    note: "Same role, harder to remove, better with flying bodies.",
  },
];

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function DeckShowcasePage() {
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [format, setFormat] = useState<"commander" | "constructed">("commander");
  const [importOpen, setImportOpen] = useState(false);
  const [aiTab, setAiTab] = useState<"blueprint" | "results" | "upgrades">("blueprint");

  const shell = useMemo(
    () =>
      theme === "dark"
        ? {
            bg: "bg-[#07080F]",
            grid: "bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] bg-[length:22px_22px]",
            ink: "text-[#E7E9EE]",
            muted: "text-[#9AA3B5]",
            hairline: "border-[#1B2233]",
            panel: "bg-[#0C0F18]/90",
            rail: "bg-[#0E121C]/95",
            brass: "text-[#D6B676]",
            brassBg: "bg-[#2A2214]/70",
            focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D6B676]",
          }
        : {
            bg: "bg-[#F6F1E7]",
            grid: "bg-[linear-gradient(rgba(15,23,42,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[length:24px_24px]",
            ink: "text-[#111827]",
            muted: "text-[#4B5563]",
            hairline: "border-[#D7CFC0]",
            panel: "bg-[#FFFBF4]/95",
            rail: "bg-[#FFF7EC]/95",
            brass: "text-[#7A5C2E]",
            brassBg: "bg-[#F3E7CF]",
            focus: "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A5C2E]",
          },
    [theme]
  );

  return (
    <div className={cn("relative min-h-screen overflow-x-hidden font-sans", shell.bg, shell.ink)}>
      <div className={cn("pointer-events-none absolute inset-0 opacity-[0.35]", shell.grid)} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-[#D6B676]/12 to-transparent" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-[1600px] flex-col">
        {/* Top command */}
        <header
          className={cn(
            "flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4 backdrop-blur-md",
            shell.hairline,
            shell.panel
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/deck"
                className={cn(
                  "rounded-lg px-2 py-1 text-xs font-medium tracking-wide text-[#9AA3B5] hover:text-[#E7E9EE]",
                  theme === "light" && "text-[#6B7280] hover:text-[#111827]",
                  shell.focus
                )}
              >
                ← Back to current editor
              </Link>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em]",
                  shell.hairline,
                  shell.brass,
                  shell.brassBg
                )}
              >
                Showcase
              </span>
            </div>
            <div className="flex min-w-0 flex-wrap items-end gap-3">
              <h1 className="truncate text-xl font-semibold tracking-tight md:text-2xl">Obsidian League — Control</h1>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as typeof format)}
                  className={cn(
                    "rounded-lg border px-2 py-1 text-xs font-medium",
                    shell.hairline,
                    theme === "dark" ? "bg-[#0C0F18] text-[#E7E9EE]" : "bg-white text-[#111827]",
                    shell.focus
                  )}
                >
                  <option value="commander">Commander</option>
                  <option value="constructed">Standard / 60</option>
                </select>
                <StatChip label="Main" value="38" theme={theme} />
                <StatChip label="Side" value="0" theme={theme} />
                <StatChip label="Avg CMC" value="2.4" theme={theme} />
                <StatChip label="Est." value="$1,240" theme={theme} accent />
              </div>
            </div>
            <p className={cn("max-w-2xl text-sm", shell.muted)}>
              Full-page workspace prototype: deck list stays central; intelligence is a dedicated column (no floating
              teal bubble). Brass accents + ink surfaces + restrained “arcane” grid.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold transition hover:brightness-110",
                shell.hairline,
                theme === "dark" ? "bg-[#121726] text-[#E7E9EE]" : "bg-white text-[#111827]",
                shell.focus
              )}
            >
              Theme: {theme === "dark" ? "Obsidian" : "Parchment"}
            </button>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className={cn(
                "rounded-lg border px-3 py-2 text-xs font-semibold transition hover:brightness-110",
                shell.hairline,
                theme === "dark" ? "bg-[#121726] text-[#E7E9EE]" : "bg-white text-[#111827]",
                shell.focus
              )}
            >
              Import…
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg px-4 py-2 text-xs font-semibold text-[#0B0D12] shadow-sm transition hover:brightness-110",
                "bg-gradient-to-r from-[#E8CF9A] via-[#D6B676] to-[#C9A66A]",
                shell.focus
              )}
            >
              Save deck
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-0 lg:flex-row">
          {/* Deck column */}
          <main className={cn("flex min-h-0 flex-1 flex-col border-r", shell.hairline, shell.panel)}>
            <div className={cn("flex flex-wrap items-center gap-3 border-b px-6 py-3", shell.hairline)}>
              <div className="relative min-w-[200px] flex-1">
                <span className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs", shell.muted)}>
                  /
                </span>
                <input
                  placeholder="Search library…"
                  className={cn(
                    "w-full rounded-xl border py-2 pl-8 pr-3 text-sm",
                    shell.hairline,
                    theme === "dark" ? "bg-[#0A0C14] text-[#E7E9EE]" : "bg-white text-[#111827]",
                    shell.focus
                  )}
                />
              </div>
              <div className={cn("flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em]", shell.muted)}>
                <span className="rounded-md border px-2 py-1" style={{ borderColor: theme === "dark" ? "#2A3145" : "#D7CFC0" }}>
                  Density: Cozy
                </span>
                <span className="rounded-md border px-2 py-1" style={{ borderColor: theme === "dark" ? "#2A3145" : "#D7CFC0" }}>
                  Sort: Type
                </span>
              </div>
            </div>

            {format === "commander" && (
              <section className={cn("border-b px-6 py-4", shell.hairline)}>
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#D6B676]">Commander</div>
                <div className="mt-3 flex items-center gap-4">
                  <div
                    className={cn(
                      "h-20 w-14 overflow-hidden rounded-lg border shadow-md",
                      shell.hairline,
                      theme === "dark" ? "bg-[#0A0C14]" : "bg-white"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={MOCK_COMMANDER.image} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{MOCK_COMMANDER.name}</div>
                    <div className={cn("truncate text-xs", shell.muted)}>{MOCK_COMMANDER.typeLine}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Pill theme={theme}>ETB triggers</Pill>
                      <Pill theme={theme}>Ninjutsu</Pill>
                      <Pill theme={theme}>Topdeck manipulation</Pill>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <SectionTitle
                kicker="Mainboard"
                title="Curve-stable tempo shell"
                subtitle="Mock list — spacing tuned for long sessions."
                theme={theme}
              />
              <div className="mt-4 space-y-2">
                {MOCK_MAIN.map((c) => (
                  <DeckRow key={c.name} card={c} theme={theme} />
                ))}
              </div>

              <div className="mt-10">
                <SectionTitle
                  kicker="Sideboard"
                  title="15 slots"
                  subtitle="Empty state stays calm, not loud."
                  theme={theme}
                />
                <div
                  className={cn(
                    "mt-4 rounded-2xl border border-dashed px-4 py-10 text-center text-sm",
                    shell.hairline,
                    shell.muted
                  )}
                >
                  No sideboard yet — import a tournament list or generate one from Intelligence.
                </div>
              </div>
            </div>
          </main>

          {/* Intelligence column */}
          <aside className={cn("flex w-full flex-col border-t lg:w-[420px] lg:border-l lg:border-t-0", shell.hairline, shell.rail)}>
            <div className={cn("border-b px-5 py-4", shell.hairline)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#D6B676]">Deck Intelligence</div>
                  <h2 className="mt-1 text-base font-semibold tracking-tight">Co-pilot, not chatbot</h2>
                  <p className={cn("mt-1 text-xs leading-relaxed", shell.muted)}>
                    Structured intent first, then evidence-backed suggestions. No neon glass; readable type.
                  </p>
                </div>
                <div className="rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-[#D6B676]">
                  Live
                </div>
              </div>

              <div className="mt-4 flex rounded-xl border p-1" style={{ borderColor: theme === "dark" ? "#22283A" : "#D7CFC0" }}>
                {(
                  [
                    ["blueprint", "Intent"],
                    ["results", "Build"],
                    ["upgrades", "Diff"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAiTab(id)}
                    className={cn(
                      "flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition",
                      aiTab === id
                        ? theme === "dark"
                          ? "bg-[#141A2A] text-[#E7E9EE] shadow-sm"
                          : "bg-white text-[#111827] shadow-sm"
                        : shell.muted,
                      shell.focus
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {aiTab === "blueprint" && <BlueprintPanel theme={theme} />}
              {aiTab === "results" && <ResultsPanel theme={theme} />}
              {aiTab === "upgrades" && <UpgradesPanel theme={theme} />}
            </div>

            <div className={cn("border-t px-5 py-4", shell.hairline)}>
              <div className={cn("rounded-xl border px-3 py-2 text-[11px] leading-relaxed", shell.hairline, shell.muted)}>
                <span className="font-semibold text-[#D6B676]">Motion:</span> 180–240ms ease-out; respect{" "}
                <code className="font-mono text-[10px]">prefers-reduced-motion</code>.
              </div>
            </div>
          </aside>
        </div>
      </div>

      {importOpen && (
        <ImportModal theme={theme} onClose={() => setImportOpen(false)} shell={shell} focusClass={shell.focus} />
      )}
    </div>
  );
}

function StatChip({
  label,
  value,
  theme,
  accent,
}: {
  label: string;
  value: string;
  theme: ThemeMode;
  accent?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 rounded-full border px-2.5 py-1 text-[11px]",
        theme === "dark" ? "border-[#22283A] bg-[#0C0F18]" : "border-[#D7CFC0] bg-white",
        accent && "border-[#6B4E24]/40 bg-[#2A2214]/50 text-[#F3E8C8]"
      )}
    >
      <span className={cn("font-medium", theme === "dark" ? "text-[#9AA3B5]" : "text-[#6B7280]")}>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </span>
  );
}

function Pill({ children, theme }: { children: string; theme: ThemeMode }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] font-medium",
        theme === "dark"
          ? "border-[#2A3145] bg-[#0A0C14] text-[#C7D0E3]"
          : "border-[#D7CFC0] bg-white text-[#374151]"
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({
  kicker,
  title,
  subtitle,
  theme,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  theme: ThemeMode;
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#D6B676]">{kicker}</div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className={cn("text-xs", theme === "dark" ? "text-[#9AA3B5]" : "text-[#6B7280]")}>{subtitle}</p>
      </div>
    </div>
  );
}

function DeckRow({
  card,
  theme,
}: {
  card: { name: string; qty: number; type: string; cmc: number; price: number };
  theme: ThemeMode;
}) {
  return (
    <div
      className={cn(
        "group flex items-center gap-3 rounded-2xl border px-3 py-2.5 transition",
        theme === "dark"
          ? "border-[#1B2233] bg-[#0C0F18] hover:border-[#2F3A57] hover:bg-[#101425]"
          : "border-[#D7CFC0] bg-white hover:border-[#C9B79E]"
      )}
    >
      <div className="w-8 text-center text-xs font-semibold tabular-nums text-[#D6B676]">{card.qty}×</div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{card.name}</div>
        <div className="truncate text-[11px] text-[#9AA3B5]">{card.type}</div>
      </div>
      <div className="hidden text-[11px] font-mono text-[#9AA3B5] sm:block">{card.cmc} cmc</div>
      <div className={cn("text-xs font-semibold tabular-nums", theme === "dark" ? "text-[#E7E9EE]" : "text-[#111827]")}>
        ${card.price.toFixed(2)}
      </div>
      <button
        type="button"
        className={cn(
          "rounded-lg border px-2 py-1 text-[11px] font-semibold opacity-0 transition group-hover:opacity-100",
          theme === "dark" ? "border-[#2A3145] text-[#E7E9EE]" : "border-[#D7CFC0] text-[#111827]"
        )}
      >
        ⋯
      </button>
    </div>
  );
}

function BlueprintPanel({ theme }: { theme: ThemeMode }) {
  const field =
    theme === "dark"
      ? "border-[#22283A] bg-[#0A0C14] text-[#E7E9EE] placeholder:text-[#5C657A]"
      : "border-[#D7CFC0] bg-white text-[#111827] placeholder:text-[#9CA3AF]";
  return (
    <div className="space-y-4">
      <ActivityStrip theme={theme} />
      <div className="space-y-3">
        <Field
          theme={theme}
          label="Goals"
          placeholder="Tempo · stack interaction · low commander tax"
          fieldClass={field}
        />
        <Field theme={theme} label="Key cards" placeholder="Yuriko, Retrofitter Foundry, …" fieldClass={field} />
        <Field theme={theme} label="Avoid" placeholder="Two-card combos you dislike" fieldClass={field} />
        <Field theme={theme} label="Model after" placeholder="URL / archetype fingerprint" fieldClass={field} />
      </div>
      <button
        type="button"
        className="w-full rounded-xl bg-gradient-to-r from-[#E8CF9A] via-[#D6B676] to-[#C9A66A] px-4 py-3 text-sm font-semibold text-[#0B0D12] shadow-sm transition hover:brightness-110"
      >
        Run analysis
      </button>
      <p className={cn("text-[11px] leading-relaxed", theme === "dark" ? "text-[#9AA3B5]" : "text-[#6B7280]")}>
        Gemini + Nano Banana image generation was requested, but the local Gemini CLI is not authenticated here. Wire{" "}
        <code className="font-mono text-[10px]">GEMINI_API_KEY</code> and rerun <code className="font-mono text-[10px]">omc ask gemini</code>{" "}
        to pull an iterative spec; this page is the visual jump you can react to now.
      </p>
    </div>
  );
}

function ResultsPanel({ theme }: { theme: ThemeMode }) {
  return (
    <div className="space-y-5">
      <ActivityStrip theme={theme} running />
      {MOCK_AI_TIERS.map((tier) => (
        <div
          key={tier.name}
          className={cn(
            "rounded-2xl border p-3",
            theme === "dark" ? "border-[#1B2233] bg-[#0C0F18]" : "border-[#D7CFC0] bg-white"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-semibold tracking-tight">{tier.name}</div>
            <span className="rounded-full border border-[#2A3145] px-2 py-0.5 text-[10px] font-semibold text-[#9AA3B5]">
              {tier.cards.length} cards
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {tier.cards.map((c) => (
              <div
                key={c.name}
                className={cn(
                  "rounded-xl border px-3 py-2",
                  theme === "dark" ? "border-[#22283A] bg-[#0A0C14]" : "border-[#E7DFD0] bg-[#FFFBF4]"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{c.name}</div>
                    <div className="mt-1 text-[11px] leading-relaxed text-[#9AA3B5]">{c.reason}</div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase",
                      c.tag === "critical" && "bg-[#3A1420] text-[#FDA4AF]",
                      c.tag === "high" && "bg-[#2A2214] text-[#FDE68A]"
                    )}
                  >
                    {c.tag}
                  </span>
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className={cn(
                      "rounded-lg border px-3 py-1 text-[11px] font-semibold",
                      theme === "dark"
                        ? "border-[#2A3145] text-[#E7E9EE] hover:bg-[#121726]"
                        : "border-[#D7CFC0] text-[#111827] hover:bg-[#F3EFE6]"
                    )}
                  >
                    Add to deck
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function UpgradesPanel({ theme }: { theme: ThemeMode }) {
  return (
    <div className="space-y-4">
      <ActivityStrip theme={theme} />
      {MOCK_SWAPS.map((s) => (
        <div
          key={s.cut}
          className={cn(
            "rounded-2xl border p-3",
            theme === "dark" ? "border-[#1B2233] bg-[#0C0F18]" : "border-[#D7CFC0] bg-white"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#D6B676]">Suggested upgrades</span>
            <span className="rounded-full bg-[#13231A] px-2 py-0.5 text-[10px] font-semibold text-[#86EFAC]">{s.delta}</span>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="rounded-xl border border-[#3A1420] bg-[#1A1014] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#FDA4AF]">Cut</div>
              <div className="mt-1 text-sm font-semibold">{s.cut}</div>
            </div>
            <div className="flex items-center justify-center text-[#9AA3B5]">
              <span className="rounded-full border border-[#2A3145] px-2 py-1 text-[10px] font-semibold">⇄</span>
            </div>
            <div className="rounded-xl border border-[#13231A] bg-[#101A14] px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-[#86EFAC]">Add</div>
              <div className="mt-1 text-sm font-semibold">{s.add}</div>
              <div className="mt-1 text-[11px] text-[#9AA3B5]">{s.note}</div>
            </div>
          </div>
            <div className="mt-3 flex gap-2">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-lg border py-2 text-xs font-semibold",
                theme === "dark"
                  ? "border-[#2A3145] text-[#E7E9EE] hover:bg-[#121726]"
                  : "border-[#D7CFC0] text-[#111827] hover:bg-[#F3EFE6]"
              )}
            >
              Reject
            </button>
            <button
              type="button"
              className="flex-1 rounded-lg bg-gradient-to-r from-[#E8CF9A] via-[#D6B676] to-[#C9A66A] py-2 text-xs font-semibold text-[#0B0D12]"
            >
              Apply swap
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActivityStrip({ theme, running }: { theme: ThemeMode; running?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-3",
        theme === "dark" ? "border-[#1B2233] bg-[#0A0C14]" : "border-[#D7CFC0] bg-[#FFFBF4]"
      )}
    >
      <div className={cn("text-[10px] font-bold uppercase tracking-[0.22em]", theme === "dark" ? "text-[#9AA3B5]" : "text-[#6B7280]")}>
        Agent activity
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <ToolPill theme={theme} label="meta_snapshot" state={running ? "running" : "idle"} />
        <ToolPill theme={theme} label="edhrec" state="done" />
        <ToolPill theme={theme} label="card_details" state="idle" />
      </div>
      <p className={cn("mt-2 text-[11px] italic", theme === "dark" ? "text-[#7C879A]" : "text-[#6B7280]")}>
        {running ? "Synthesizing tiers from snapshots + priors…" : "Waiting for intent — no spinner theater."}
      </p>
    </div>
  );
}

function ToolPill({ theme, label, state }: { theme: ThemeMode; label: string; state: "running" | "done" | "idle" }) {
  const styles =
    state === "running"
      ? theme === "dark"
        ? "border-[#2F6B62]/60 bg-[#0F241E] text-[#99F6E4]"
        : "border-[#86EFAC]/50 bg-[#ECFDF5] text-[#166534]"
      : state === "done"
        ? theme === "dark"
          ? "border-[#2A3145] bg-[#121726] text-[#C7D0E3]"
          : "border-[#D7CFC0] bg-white text-[#374151]"
        : theme === "dark"
          ? "border-[#2A3145] bg-[#0A0C14] text-[#6C768A]"
          : "border-[#E5E0D6] bg-[#FAF6EE] text-[#6B7280]";
  return (
    <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-semibold", styles)}>
      {label}
      {state === "running" && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#5EEAD4]" />}
    </span>
  );
}

function Field({
  theme,
  label,
  placeholder,
  fieldClass,
}: {
  theme: ThemeMode;
  label: string;
  placeholder: string;
  fieldClass: string;
}) {
  return (
    <label className="block">
      <div
        className={cn(
          "mb-1 text-[10px] font-bold uppercase tracking-[0.18em]",
          theme === "dark" ? "text-[#9AA3B5]" : "text-[#6B7280]"
        )}
      >
        {label}
      </div>
      <input placeholder={placeholder} className={cn("w-full rounded-xl border px-3 py-2 text-sm", fieldClass)} />
    </label>
  );
}

function ImportModal({
  theme,
  onClose,
  shell,
  focusClass,
}: {
  theme: ThemeMode;
  onClose: () => void;
  shell: Record<string, string>;
  focusClass: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div
        className={cn(
          "w-full max-w-lg rounded-2xl border shadow-2xl",
          shell.hairline,
          theme === "dark" ? "bg-[#0C0F18]" : "bg-[#FFFBF4]"
        )}
      >
        <div className={cn("flex items-center justify-between border-b px-5 py-4", shell.hairline)}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#D6B676]">Import</div>
            <h3 className="text-base font-semibold">Bring a list in cleanly</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cn(
              "rounded-lg px-2 py-1 text-sm",
              theme === "dark" ? "text-[#9AA3B5] hover:text-[#E7E9EE]" : "text-[#6B7280] hover:text-[#111827]",
              focusClass
            )}
          >
            Close
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className={cn("text-sm", shell.muted)}>Paste MTGO / Arena export, or drop a public URL. Validation runs before mutating the list.</p>
          <textarea
            className={cn(
              "h-36 w-full resize-none rounded-xl border p-3 font-mono text-xs",
              shell.hairline,
              theme === "dark" ? "bg-[#0A0C14] text-[#E7E9EE]" : "bg-white text-[#111827]",
              focusClass
            )}
            defaultValue={"4 Lightning Bolt\n2 Counterspell\n\n// Sideboard\n2 Pyroblast"}
          />
          <button
            type="button"
            className="w-full rounded-xl bg-gradient-to-r from-[#E8CF9A] via-[#D6B676] to-[#C9A66A] py-2.5 text-sm font-semibold text-[#0B0D12]"
          >
            Import (mock)
          </button>
        </div>
      </div>
    </div>
  );
}

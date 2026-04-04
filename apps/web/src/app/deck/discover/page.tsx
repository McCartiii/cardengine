"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface DeckSuggestion {
  commander: {
    name: string;
    variantId: string;
    imageUri: string | null;
    colorIdentity: string[];
  };
  ownedCardsInIdentity: number;
  edhrecDecks: number;
  themes: string[];
  estimatedBudgetToComplete: number;
}

const MANA_VARIANTS: Record<string, "mana-W" | "mana-U" | "mana-B" | "mana-R" | "mana-G"> = {
  W: "mana-W",
  U: "mana-U",
  B: "mana-B",
  R: "mana-R",
  G: "mana-G",
};

export default function DiscoverPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<DeckSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user for NavBar
  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    loadUser();
  }, []);

  useEffect(() => {
    async function fetchSuggestions() {
      setLoading(true);
      setError(null);
      try {
        const token = typeof window !== "undefined" ? localStorage.getItem("sb-access-token") : null;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch(`${API_URL}/v1/deck/suggest`, {
          method: "POST",
          headers,
          body: JSON.stringify({}),
        });

        if (res.status === 401) {
          setError("Sign in to discover deck ideas from your collection.");
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error(`Server error: ${res.status}`);

        const data = await res.json();
        setSuggestions(data.suggestions ?? []);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load suggestions");
      } finally {
        setLoading(false);
      }
    }

    fetchSuggestions();
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      <NavBar user={user} />

      <main className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text-primary">
            Discover Decks
          </h1>
          <p className="mt-2 text-text-secondary">
            Commander deck ideas based on legendary creatures in your collection.
            We analyze your owned cards and cross-reference EDHREC to find the decks
            you&apos;re closest to building.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <span className="ml-4 text-text-muted">
              Scanning your collection and EDHREC...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-danger bg-danger-light p-6 text-center animate-fade-in">
            <p className="text-[var(--danger-text)]">{error}</p>
          </div>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-12 text-center animate-slide-up">
            <h2 className="text-lg font-semibold text-text-primary">
              No commander suggestions yet
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Add legendary creatures to your collection to see deck building suggestions here.
            </p>
            <Link
              href="/collection"
              className="mt-4 inline-block"
            >
              <Button>Go to Collection</Button>
            </Link>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s, i) => (
              <div
                key={s.commander.variantId}
                className={`group overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-card)] card-hover animate-slide-up stagger-${Math.min(i + 1, 6)}`}
              >
                {/* Commander image */}
                {s.commander.imageUri && (
                  <div className="relative h-48 overflow-hidden">
                    <img
                      src={s.commander.imageUri}
                      alt={s.commander.name}
                      className="h-full w-full object-cover object-top transition group-hover:scale-105"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    <h3 className="absolute bottom-3 left-4 right-4 text-lg font-bold text-white">
                      {s.commander.name}
                    </h3>
                  </div>
                )}
                {!s.commander.imageUri && (
                  <div className="flex h-32 items-center justify-center bg-surface-sunken">
                    <h3 className="text-lg font-bold text-text-primary">
                      {s.commander.name}
                    </h3>
                  </div>
                )}

                <div className="p-4">
                  {/* Color identity */}
                  <div className="flex items-center gap-1 mb-3">
                    {s.commander.colorIdentity.map((c) => {
                      const variant = MANA_VARIANTS[c];
                      return variant ? (
                        <Badge key={c} variant={variant}>
                          {c}
                        </Badge>
                      ) : null;
                    })}
                    {s.commander.colorIdentity.length === 0 && (
                      <span className="text-xs text-text-muted">Colorless</span>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">
                        Owned Cards
                      </p>
                      <p className="text-lg font-bold text-success">
                        {s.ownedCardsInIdentity}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">
                        EDHREC Decks
                      </p>
                      <p className="text-lg font-bold text-text-primary">
                        {s.edhrecDecks > 0 ? s.edhrecDecks.toLocaleString() : "N/A"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-text-muted">
                        Est. Budget
                      </p>
                      <p className="text-lg font-bold text-accent-text">
                        {s.estimatedBudgetToComplete > 0
                          ? `$${s.estimatedBudgetToComplete.toFixed(0)}`
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  {/* Themes */}
                  {s.themes.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {s.themes.map((theme) => (
                        <Badge key={theme}>{theme}</Badge>
                      ))}
                    </div>
                  )}

                  {/* Action */}
                  <Link
                    href={`/deck?commander=${encodeURIComponent(s.commander.name)}&format=commander`}
                    className="block w-full rounded-xl bg-success px-4 py-2 text-center text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                  >
                    Start Building
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

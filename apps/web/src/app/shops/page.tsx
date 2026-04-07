"use client";

import { useState } from "react";
import { api, type Shop } from "@/lib/api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TODAY_IDX = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1; // 0=Mon

function parseHours(hoursStr: string): string[] {
  // Hours stored as "Mon: 9AM-9PM | Tue: 9AM-9PM | ..."
  return hoursStr.split(" | ").filter(Boolean);
}

function TodayHours({ hours }: { hours: string }) {
  const parts = parseHours(hours);
  const today = parts[TODAY_IDX] ?? parts[0];
  return today ? <span>{today}</span> : null;
}

function HoursExpanded({ hours }: { hours: string }) {
  const parts = parseHours(hours);
  // weekday_text from Google is like "Monday: 9:00 AM – 9:00 PM"
  return (
    <div className="grid gap-1 mt-2">
      {parts.map((line, i) => {
        const isToday = i === TODAY_IDX;
        const colonIdx = line.indexOf(":");
        const day = colonIdx >= 0 ? line.slice(0, colonIdx) : line;
        const time = colonIdx >= 0 ? line.slice(colonIdx + 1).trim() : "";
        return (
          <div key={i} className="flex justify-between text-xs gap-4"
            style={{ color: isToday ? "#00d4ff" : "#3d5068", fontWeight: isToday ? 600 : 400 }}>
            <span>{day}</span>
            <span style={{ color: isToday ? "#00d4ff" : "#526880" }}>{time || line}</span>
          </div>
        );
      })}
    </div>
  );
}

function ShopCard({ shop }: { shop: Shop }) {
  const [showHours, setShowHours] = useState(false);
  const hasHours = Boolean(shop.hours);

  return (
    <div className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white mb-1 text-base">{shop.name}</h3>
          {shop.address && (
            <p className="text-xs mb-2" style={{ color: "#526880" }}>
              {shop.address}{shop.city ? `, ${shop.city}` : ""}{shop.state ? `, ${shop.state}` : ""}
            </p>
          )}

          {/* Action chips row */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {shop.website && (
              <a href={shop.website} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                Website
              </a>
            )}
            {shop.phone && (
              <a href={`tel:${shop.phone}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: "rgba(124,58,237,0.1)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.2)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.63 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                {shop.phone}
              </a>
            )}
            {hasHours && (
              <button onClick={() => setShowHours(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: "rgba(80,200,120,0.1)", color: "#50c878", border: "1px solid rgba(80,200,120,0.2)" }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                {showHours ? "Hide Hours" : "Hours"}
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right flex flex-col items-end gap-2">
          {shop.distance != null && (
            <span className="px-2.5 py-1 rounded-lg text-xs font-bold"
              style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}>
              {shop.distance.toFixed(1)} mi
            </span>
          )}
          {shop.verified && (
            <span className="text-xs" style={{ color: "#50c878" }}>✓ Verified</span>
          )}
        </div>
      </div>

      {/* Hours panel */}
      {showHours && shop.hours && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid rgba(0,212,255,0.06)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#3d5068" }}>Hours</p>
          <HoursExpanded hours={shop.hours} />
        </div>
      )}

      {/* Today's hours teaser when collapsed */}
      {!showHours && shop.hours && (
        <div className="mt-3 pt-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(0,212,255,0.06)" }}>
          <span className="text-xs font-semibold" style={{ color: "#50c878" }}>Today</span>
          <span className="text-xs" style={{ color: "#526880" }}>
            <TodayHours hours={shop.hours} />
          </span>
        </div>
      )}
    </div>
  );
}

export default function ShopsPage() {
  const [shops, setShops]       = useState<Shop[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [city, setCity]         = useState("");

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!city.trim()) return;
    setLoading(true); setError(null);
    try {
      const { shops: results } = await api.shops.nearby({ city: city.trim() });
      setShops(results); setSearched(true);
    } catch (err) { setError(err instanceof Error ? err.message : "Search failed."); }
    finally { setLoading(false); }
  }

  async function useGeolocation() {
    setLoading(true); setError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { shops: results } = await api.shops.nearby({ lat: pos.coords.latitude, lng: pos.coords.longitude, radius: 50 });
          setShops(results); setSearched(true);
        } catch (err) { setError(err instanceof Error ? err.message : "Search failed."); }
        finally { setLoading(false); }
      },
      () => { setError("Geolocation denied — enter a city instead."); setLoading(false); }
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="font-extrabold text-4xl text-white leading-none mb-2">Local Shops</h1>
        <p className="text-sm" style={{ color: "#3d5068" }}>Find game stores near you</p>
      </div>

      <div className="glass rounded-2xl p-6 mb-8" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Enter city name…"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none py-2.5"
            style={{ borderBottom: "1px solid rgba(0,212,255,0.2)", caretColor: "#00d4ff" }} />
          <button type="submit" disabled={loading || !city.trim()} className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: city.trim() ? "rgba(0,212,255,0.1)" : "rgba(30,45,69,0.5)", color: city.trim() ? "#00d4ff" : "#3d5068", border: `1px solid ${city.trim() ? "rgba(0,212,255,0.2)" : "#1e2d45"}` }}>
            Search
          </button>
        </form>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ flex: 1, height: 1, background: "rgba(0,212,255,0.06)" }} />
          <span className="text-xs" style={{ color: "#3d5068" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(0,212,255,0.06)" }} />
        </div>
        <button onClick={useGeolocation} disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", color: "#a78bfa" }}>
          {loading ? "Locating…" : "📍 Use My Location"}
        </button>
      </div>

      {error && <div className="glass rounded-2xl p-4 mb-6 text-sm" style={{ color: "#ff6bad" }}>{error}</div>}

      {searched && shops.length === 0 && !loading && (
        <div className="glass rounded-2xl p-12 text-center" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
          <p className="font-bold text-lg text-white mb-1">No shops found</p>
          <p className="text-sm" style={{ color: "#3d5068" }}>Try a different city or use your location</p>
        </div>
      )}

      {shops.length > 0 && (
        <div className="space-y-3 animate-enter">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#3d5068" }}>
            {shops.length} shop{shops.length !== 1 ? "s" : ""} found
          </p>
          {shops.map((shop) => <ShopCard key={shop.id} shop={shop} />)}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { api, type Shop } from "@/lib/api";

export default function ShopsPage() {
  const [city, setCity]         = useState("");
  const [shops, setShops]       = useState<Shop[]>([]);
  const [loading, setLoading]   = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!city.trim()) return;
    setLoading(true);
    try {
      const { shops: results } = await api.shops.nearby({ city: city.trim() });
      setShops(results);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const nearMe = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const { shops: results } = await api.shops.nearby({ lat: coords.latitude, lng: coords.longitude, radius: 50 });
          setShops(results);
          setSearched(true);
        } finally {
          setLoading(false);
        }
      },
      () => setLoading(false)
    );
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-10">
        <h1 className="text-4xl font-black mb-2"><span className="gradient-text">Game Stores</span></h1>
        <p className="text-sm" style={{ color: "#7c6f9a" }}>Find local card shops near you</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-3 mb-8">
        <div
          className="flex-1 flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-200"
          style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c6f9a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          <input
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Enter a city name…"
            className="flex-1 bg-transparent text-white placeholder:text-muted/60 focus:outline-none text-sm"
          />
        </div>
        <button type="submit" disabled={loading || !city.trim()}
          className="px-5 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-40 transition-all duration-200"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
          Search
        </button>
        <button type="button" onClick={nearMe} disabled={loading}
          className="px-5 py-3 rounded-xl font-semibold text-sm transition-all duration-200"
          style={{ background: "#1a1430", border: "1px solid #2a1f4a", color: "#c4b5fd" }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(139,92,246,0.4)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#2a1f4a"; }}>
          📍 Near Me
        </button>
      </form>

      {/* Skeleton */}
      {loading && (
        <div className="space-y-4">
          {[0,1,2].map(i => (
            <div key={i} className="rounded-2xl p-5" style={{ background: "#110d1f", border: "1px solid #2a1f4a" }}>
              <div className="skeleton h-6 w-48 rounded mb-3" />
              <div className="skeleton h-4 w-64 rounded mb-2" />
              <div className="skeleton h-4 w-32 rounded" />
            </div>
          ))}
        </div>
      )}

      {searched && shops.length === 0 && !loading && (
        <div className="py-20 text-center animate-enter">
          <p className="text-5xl mb-4 opacity-30">🏪</p>
          <p className="text-lg font-bold text-white mb-2">No shops found</p>
          <p className="text-sm" style={{ color: "#7c6f9a" }}>Try a different city or use &ldquo;Near Me&rdquo;</p>
        </div>
      )}

      <div className="space-y-4">
        {shops.map((shop, i) => (
          <div
            key={shop.id}
            className="rounded-2xl p-5 transition-all duration-200 animate-enter"
            style={{ background: "#110d1f", border: "1px solid #2a1f4a", animationDelay: `${i * 60}ms` }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(139,92,246,0.3)";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 0 20px rgba(139,92,246,0.08)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLDivElement).style.borderColor = "#2a1f4a";
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-white text-lg">{shop.name}</h3>
                  {shop.verified && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                      style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }}>
                      Verified
                    </span>
                  )}
                </div>
                {shop.address && (
                  <p className="text-sm mb-1" style={{ color: "#7c6f9a" }}>
                    {[shop.address, shop.city, shop.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {shop.distance != null && (
                  <p className="text-sm font-semibold text-cyan">{shop.distance.toFixed(1)} mi away</p>
                )}
                {shop.hours && (
                  <p className="text-sm mt-2" style={{ color: "#7c6f9a" }}>🕒 {shop.hours}</p>
                )}
              </div>
              <div className="flex flex-col gap-2 shrink-0 text-right">
                {shop.website && (
                  <a href={shop.website} target="_blank" rel="noopener noreferrer"
                    className="text-sm font-semibold transition-colors duration-200"
                    style={{ color: "#c4b5fd" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#ede9fe"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#c4b5fd"; }}>
                    Website →
                  </a>
                )}
                {shop.phone && (
                  <a href={`tel:${shop.phone}`} className="text-sm transition-colors duration-200" style={{ color: "#7c6f9a" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#ede9fe"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "#7c6f9a"; }}>
                    {shop.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

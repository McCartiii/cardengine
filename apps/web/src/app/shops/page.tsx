"use client";

import { useState } from "react";
import { api, type Shop } from "@/lib/api";

export default function ShopsPage() {
  const [city, setCity] = useState("");
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(false);
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
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const { shops: results } = await api.shops.nearby({ lat: coords.latitude, lng: coords.longitude, radius: 50 });
        setShops(results);
        setSearched(true);
      } finally {
        setLoading(false);
      }
    }, () => setLoading(false));
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black mb-1">Game Stores</h1>
        <p className="text-muted">Find local card shops near you</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3 mb-4">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="City name…"
          className="flex-1 bg-surface border border-border rounded-xl px-4 py-2.5 text-white placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/60 text-sm"
        />
        <button type="submit" disabled={loading || !city.trim()} className="px-4 py-2.5 bg-accent text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-accent/80 transition-colors">
          Search
        </button>
        <button type="button" onClick={nearMe} disabled={loading} className="px-4 py-2.5 bg-surface border border-border text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:border-accent/60 transition-colors">
          📍 Near Me
        </button>
      </form>

      {loading && <p className="text-muted animate-pulse">Finding shops…</p>}

      {searched && shops.length === 0 && !loading && (
        <p className="text-muted py-12 text-center">No shops found. Try a different city.</p>
      )}

      <div className="space-y-4">
        {shops.map((shop) => (
          <div key={shop.id} className="bg-surface border border-border rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg">{shop.name}</h3>
                  {shop.verified && <span className="text-xs bg-accent/20 text-accent-light border border-accent/40 px-2 py-0.5 rounded-md font-bold">Verified</span>}
                </div>
                {shop.address && <p className="text-muted text-sm mt-1">{[shop.address, shop.city, shop.state].filter(Boolean).join(", ")}</p>}
                {shop.distance != null && <p className="text-accent-light text-sm font-semibold">{shop.distance.toFixed(1)} mi away</p>}
                {shop.hours && <p className="text-muted text-sm mt-2">🕒 {shop.hours}</p>}
              </div>
              <div className="flex flex-col gap-2 shrink-0">
                {shop.website && (
                  <a href={shop.website} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-light hover:underline">
                    Website →
                  </a>
                )}
                {shop.phone && (
                  <a href={`tel:${shop.phone}`} className="text-sm text-muted hover:text-white">
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

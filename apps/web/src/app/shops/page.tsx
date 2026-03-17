"use client";

import { useState } from "react";
import { api, type Shop } from "@/lib/api";

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
        <h1 className="font-display font-extrabold text-4xl text-white leading-none mb-2">Local Shops</h1>
        <p className="text-sm" style={{ color: "#3d5068" }}>Find game stores near you</p>
      </div>
      <div className="glass rounded-2xl p-6 mb-8" style={{ border: "1px solid rgba(0,212,255,0.1)" }}>
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Enter city name…"
            className="flex-1 bg-transparent text-white text-sm focus:outline-none py-2.5"
            style={{ borderBottom: "1px solid rgba(0,212,255,0.2)", caretColor: "#00d4ff" }} />
          <button type="submit" disabled={loading || !city.trim()} className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
            style={{ background: city.trim() ? "rgba(0,212,255,0.1)" : "rgba(30,45,69,0.5)", color: city.trim() ? "#00d4ff" : "#3d5068", border: `1px solid ${city.trim() ? "rgba(0,212,255,0.2)" : "#1e2d45"}` }}>Search</button>
        </form>
        <div className="flex items-center gap-3 mb-4">
          <div style={{ flex: 1, height: 1, background: "rgba(0,212,255,0.06)" }} />
          <span className="text-xs" style={{ color: "#3d5068" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "rgba(0,212,255,0.06)" }} />
        </div>
        <button onClick={useGeolocation} disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)", color: "#a78bfa" }}>
          {loading ? "Locating…" : "Use My Location"}
        </button>
      </div>
      {error && <div className="glass rounded-2xl p-4 mb-6 text-sm" style={{ color: "#ff6bad" }}>{error}</div>}
      {searched && shops.length === 0 && !loading && (
        <div className="glass rounded-2xl p-12 text-center" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
          <p className="font-display font-bold text-lg text-white mb-1">No shops found</p>
          <p className="text-sm" style={{ color: "#3d5068" }}>Try a different city</p>
        </div>
      )}
      {shops.length > 0 && (
        <div className="space-y-3 animate-enter">
          <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: "#3d5068" }}>{shops.length} shop{shops.length !== 1 ? "s" : ""} found</p>
          {shops.map((shop) => (
            <div key={shop.id} className="glass rounded-2xl p-5" style={{ border: "1px solid rgba(0,212,255,0.08)" }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-white mb-1">{shop.name}</h3>
                  {shop.address && <p className="text-xs" style={{ color: "#3d5068" }}>{shop.address}{shop.city ? `, ${shop.city}` : ""}{shop.state ? `, ${shop.state}` : ""}</p>}
                  <div className="flex items-center gap-4 mt-2">
                    {shop.phone && <a href={`tel:${shop.phone}`} className="text-xs" style={{ color: "#3d5068" }}>{shop.phone}</a>}
                    {shop.website && <a href={shop.website} target="_blank" rel="noopener noreferrer" className="text-xs" style={{ color: "#3d5068" }}>Website ↗</a>}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {shop.distance != null && <span className="px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: "rgba(0,212,255,0.1)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.2)" }}>{shop.distance.toFixed(1)} mi</span>}
                  {shop.verified && <p className="text-xs mt-1" style={{ color: "#50c878" }}>✓ Verified</p>}
                </div>
              </div>
              {shop.hours && <p className="text-xs mt-3 pt-3" style={{ color: "#3d5068", borderTop: "1px solid rgba(0,212,255,0.06)" }}>{shop.hours}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

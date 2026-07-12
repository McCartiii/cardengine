"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import Map, { Marker, NavigationControl, Popup } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { NavBar } from "@/components/ui/NavBar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

interface Shop {
  id: string;
  name: string;
  address?: string;
  city?: string;
  state?: string;
  lat?: number;
  lng?: number;
  category: string;
  phone?: string;
  website?: string;
  hours?: string;
  distance?: number;
}

export default function MapPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [searchCity, setSearchCity] = useState("");
  const [radiusMi, setRadiusMi] = useState(30);
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [viewState, setViewState] = useState({
    latitude: 40.76,
    longitude: -111.89,
    zoom: 10,
  });
  const [tab, setTab] = useState<"shops" | "add">("shops");
  const [token, setToken] = useState<string | null>(null);
  const [checkedIn, setCheckedIn] = useState<Set<string>>(new Set());
  const [user, setUser] = useState<{ email?: string } | null>(null);

  // New shop form
  const [newShop, setNewShop] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    category: "card_shop",
  });

  // Get auth token + user
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setToken(session?.access_token ?? null);
    });
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      setUser(u ? { email: u.email ?? undefined } : null);
    });
  }, []);

  // Pure fetcher: returns the shops (or null when offline) and leaves state
  // updates to the caller, so effects can set state in a callback.
  const fetchShops = useCallback(
    async (lat?: number, lng?: number): Promise<Shop[] | null> => {
      try {
        const params = new URLSearchParams();
        if (lat != null && lng != null) {
          params.set("lat", String(lat));
          params.set("lng", String(lng));
        }
        params.set("radius", String(radiusMi));
        params.set("limit", "50");

        const res = await fetch(`${API_URL}/v1/shops?${params}`);
        const data = await res.json();
        return data.shops ?? [];
      } catch {
        // Offline — keep whatever is currently shown
        return null;
      }
    },
    [radiusMi]
  );

  useEffect(() => {
    let cancelled = false;
    fetchShops().then((shops) => {
      if (shops && !cancelled) setShops(shops);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchShops]);

  // Geocode city search
  const handleSearch = async () => {
    if (!searchCity.trim()) {
      const shops = await fetchShops();
      if (shops) setShops(shops);
      return;
    }

    try {
      const res = await fetch(
        `${API_URL}/v1/geocode?q=${encodeURIComponent(searchCity)}&limit=1`
      );
      const data = await res.json();
      if (data.results?.length > 0) {
        const { lat, lng } = data.results[0];
        setViewState({ latitude: lat, longitude: lng, zoom: 11 });
        fetchShops(lat, lng).then((shops) => {
          if (shops) setShops(shops);
        });
      } else {
        const params = new URLSearchParams();
        params.set("city", searchCity);
        params.set("limit", "50");
        const shopRes = await fetch(`${API_URL}/v1/shops?${params}`);
        const shopData = await shopRes.json();
        setShops(shopData.shops ?? []);
      }
    } catch {
      const params = new URLSearchParams({ city: searchCity, limit: "50" });
      fetch(`${API_URL}/v1/shops?${params}`)
        .then((r) => r.json())
        .then((d) => setShops(d.shops ?? []))
        .catch(() => {});
    }
  };

  const handleCheckin = async (shopId: string) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/v1/checkins`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ shopId }),
      });
      setCheckedIn((prev) => new Set([...prev, shopId]));
    } catch {
      // Error
    }
  };

  const handleCreateShop = async () => {
    if (!token || !newShop.name.trim()) return;

    let lat: number | undefined;
    let lng: number | undefined;
    const geocodeQuery = [newShop.address, newShop.city, newShop.state]
      .filter(Boolean)
      .join(", ");
    if (geocodeQuery) {
      try {
        const res = await fetch(
          `${API_URL}/v1/geocode?q=${encodeURIComponent(geocodeQuery)}&limit=1`
        );
        const data = await res.json();
        if (data.results?.length > 0) {
          lat = data.results[0].lat;
          lng = data.results[0].lng;
        }
      } catch {
        // No geocode
      }
    }

    try {
      await fetch(`${API_URL}/v1/shops`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...newShop,
          lat,
          lng,
        }),
      });
      setNewShop({
        name: "",
        address: "",
        city: "",
        state: "",
        category: "card_shop",
      });
      setTab("shops");
      const shops = await fetchShops();
      if (shops) setShops(shops);
    } catch {
      // Error
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <NavBar user={user} />

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-80 overflow-y-auto border-r border-border bg-surface animate-fade-in">
          {/* Tabs */}
          <div className="flex border-b border-border">
            {(
              [
                ["shops", "Shops"],
                ["add", "Add Shop"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`flex-1 py-3 text-xs font-semibold transition-colors ${
                  tab === key
                    ? "border-b-2 border-tab-map text-tab-map"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-4">
            {tab === "shops" && (
              <div className="animate-fade-in">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={searchCity}
                    onChange={(e) => setSearchCity(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    placeholder="Search city..."
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-map focus:outline-none focus:ring-1 focus:ring-tab-map"
                  />
                  <Button size="sm" onClick={handleSearch}>
                    Go
                  </Button>
                </div>
                <div className="mt-3">
                  <label className="text-xs text-text-muted">
                    Radius: {radiusMi}mi
                  </label>
                  <input
                    type="range"
                    min={5}
                    max={125}
                    value={radiusMi}
                    onChange={(e) => setRadiusMi(Number(e.target.value))}
                    className="w-full accent-[var(--tab-map)]"
                  />
                </div>

                <div className="mt-4 space-y-2">
                  {shops.length === 0 && (
                    <p className="text-sm text-text-muted">No shops found.</p>
                  )}
                  {shops.map((shop, i) => (
                    <button
                      key={shop.id}
                      onClick={() => {
                        setSelectedShop(shop);
                        setShowPopup(true);
                        if (shop.lat && shop.lng) {
                          setViewState({
                            latitude: shop.lat,
                            longitude: shop.lng,
                            zoom: 14,
                          });
                        }
                      }}
                      className={`w-full rounded-2xl border p-3 text-left transition-all animate-slide-up card-hover ${
                        selectedShop?.id === shop.id
                          ? "border-tab-map bg-tab-map-bg"
                          : "border-border bg-surface hover:border-border-strong hover:shadow-[var(--shadow-card)]"
                      }`}
                      style={{ animationDelay: `${i * 30}ms` }}
                    >
                      <p className="text-sm font-medium text-text-primary">
                        {shop.name}
                      </p>
                      <p className="text-xs text-text-secondary">
                        {[shop.address, shop.city, shop.state]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {shop.distance != null && (
                        <p className="mt-1 text-xs text-tab-map">
                          {shop.distance.toFixed(1)}mi away
                        </p>
                      )}
                      <Badge variant="default" className="mt-1">
                        {shop.category.replace("_", " ")}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === "add" && (
              <div className="animate-fade-in">
                <h3 className="text-sm font-semibold text-text-primary">
                  Add a Game Shop
                </h3>
                <div className="mt-3 space-y-3">
                  <input
                    type="text"
                    value={newShop.name}
                    onChange={(e) =>
                      setNewShop((s) => ({ ...s, name: e.target.value }))
                    }
                    placeholder="Shop name *"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-map focus:outline-none focus:ring-1 focus:ring-tab-map"
                  />
                  <input
                    type="text"
                    value={newShop.address}
                    onChange={(e) =>
                      setNewShop((s) => ({ ...s, address: e.target.value }))
                    }
                    placeholder="Address"
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-map focus:outline-none focus:ring-1 focus:ring-tab-map"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newShop.city}
                      onChange={(e) =>
                        setNewShop((s) => ({ ...s, city: e.target.value }))
                      }
                      placeholder="City"
                      className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-map focus:outline-none focus:ring-1 focus:ring-tab-map"
                    />
                    <input
                      type="text"
                      value={newShop.state}
                      onChange={(e) =>
                        setNewShop((s) => ({ ...s, state: e.target.value }))
                      }
                      placeholder="State"
                      className="w-20 rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-tab-map focus:outline-none focus:ring-1 focus:ring-tab-map"
                    />
                  </div>
                  <select
                    value={newShop.category}
                    onChange={(e) =>
                      setNewShop((s) => ({ ...s, category: e.target.value }))
                    }
                    className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  >
                    <option value="card_shop">Card Shop</option>
                    <option value="hobby_shop">Hobby Shop</option>
                    <option value="game_store">Game Store</option>
                    <option value="community_center">Community Center</option>
                    <option value="library">Library</option>
                    <option value="cafe">Cafe</option>
                  </select>
                  <Button
                    onClick={handleCreateShop}
                    disabled={!newShop.name.trim() || !token}
                    className="w-full"
                  >
                    {token ? "Add Shop" : "Sign in to add shops"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1">
          <Map
            {...viewState}
            onMove={(evt) => setViewState(evt.viewState)}
            style={{ width: "100%", height: "100%" }}
            mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
          >
            <NavigationControl position="top-right" />

            {shops
              .filter((s) => s.lat != null && s.lng != null)
              .map((shop) => (
                <Marker
                  key={shop.id}
                  latitude={shop.lat!}
                  longitude={shop.lng!}
                  onClick={(e) => {
                    e.originalEvent.stopPropagation();
                    setSelectedShop(shop);
                    setShowPopup(true);
                  }}
                >
                  <div
                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg shadow-[var(--shadow-elevated)] transition-transform hover:scale-110 ${
                      selectedShop?.id === shop.id
                        ? "scale-125 bg-tab-map ring-2 ring-white"
                        : "bg-surface border-2 border-border-strong"
                    }`}
                  >
                    {shop.category === "card_shop"
                      ? "\uD83C\uDCCF"
                      : shop.category === "cafe"
                        ? "\u2615"
                        : "\uD83C\uDFEA"}
                  </div>
                </Marker>
              ))}

            {showPopup && selectedShop?.lat && selectedShop?.lng && (
              <Popup
                latitude={selectedShop.lat}
                longitude={selectedShop.lng}
                closeOnClick={false}
                onClose={() => setShowPopup(false)}
                anchor="bottom"
                offset={20}
              >
                <div className="min-w-48 p-1">
                  <h3 className="font-semibold text-text-primary">
                    {selectedShop.name}
                  </h3>
                  <p className="mt-0.5 text-xs text-text-secondary">
                    {[selectedShop.address, selectedShop.city, selectedShop.state]
                      .filter(Boolean)
                      .join(", ")}
                  </p>
                  {selectedShop.hours && (
                    <p className="mt-1 text-xs text-text-secondary">
                      Hours: {selectedShop.hours}
                    </p>
                  )}
                  {selectedShop.phone && (
                    <p className="text-xs text-text-secondary">
                      Phone: {selectedShop.phone}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    {token && (
                      <Button
                        size="sm"
                        onClick={() => handleCheckin(selectedShop.id)}
                        disabled={checkedIn.has(selectedShop.id)}
                      >
                        {checkedIn.has(selectedShop.id)
                          ? "Checked in"
                          : "Check in"}
                      </Button>
                    )}
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        </div>
      </div>
    </div>
  );
}

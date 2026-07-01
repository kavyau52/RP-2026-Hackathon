"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import type { FormEvent } from "react";
import SetupGuard from "@/components/SetupGuard";
import SpeakButton from "@/components/SpeakButton";
import type { Language } from "@/lib/languages";
import type { ResourceTip } from "@/lib/types";

const ResourcesLeafletMap = dynamic(() => import("./ResourcesLeafletMap"), {
  ssr: false,
  loading: () => (
    <div className="resource-map resource-map--loading">
      <span className="spinner" style={{ borderTopColor: "var(--brand)" }} />
    </div>
  ),
});

const CATEGORIES = [
  {
    id: "legal",
    icon: "⚖️",
    label: "Legal Help",
    radiusMeters: 6000,
    tags: [["office", "lawyer"], ["amenity", "courthouse"], ["office", "ngo"]],
  },
  {
    id: "banking",
    icon: "🏦",
    label: "Banks",
    radiusMeters: 5000,
    tags: [["amenity", "bank"], ["amenity", "bureau_de_change"], ["amenity", "atm"]],
  },
  {
    id: "foodbank",
    icon: "🥗",
    label: "Food Banks",
    radiusMeters: 12000,
    tags: [["social_facility", "food_bank"], ["social_facility", "soup_kitchen"], ["amenity", "food_bank"], ["amenity", "soup_kitchen"]],
  },
  {
    id: "transit",
    icon: "🚌",
    label: "Bus / Transit",
    radiusMeters: 3000,
    tags: [["amenity", "bus_station"], ["railway", "station"], ["highway", "bus_stop"]],
  },
  {
    id: "healthcare",
    icon: "🏥",
    label: "Clinics & Hospitals",
    radiusMeters: 6000,
    tags: [["amenity", "clinic"], ["amenity", "doctors"], ["amenity", "hospital"], ["healthcare", "clinic"], ["healthcare", "doctor"], ["healthcare", "hospital"]],
  },
  {
    id: "education",
    icon: "📚",
    label: "Education Help",
    radiusMeters: 6000,
    tags: [["amenity", "school"], ["amenity", "college"], ["amenity", "library"], ["amenity", "language_school"], ["office", "educational_institution"]],
  },
  {
    id: "caregivers",
    icon: "🤝",
    label: "Care & Family Help",
    radiusMeters: 8000,
    tags: [["amenity", "social_facility"], ["social_facility", "day_care"], ["social_facility", "assisted_living"], ["healthcare", "home_healthcare"], ["office", "ngo"]],
  },
] as const;

type Category = (typeof CATEGORIES)[number];

type TipsResult =
  | { fallback: boolean; ok: true; tips: ResourceTip[] }
  | { ok: false; message: string };

interface NearbyPlace {
  name: string;
  address?: string;
  distanceKm: number;
  lat: number;
  lon: number;
}

interface MapPoint {
  lat: number;
  lon: number;
}

interface LocationSearchResult extends MapPoint {
  label: string;
}

const DEFAULT_MAP_CENTER: MapPoint = {
  lat: 39.8283,
  lon: -98.5795,
};

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12000
) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function describeGeolocationError(error: unknown) {
  if (error && typeof error === "object" && "code" in error) {
    const code = Number((error as { code: unknown }).code);
    if (code === 1) {
      return "Location access is blocked. Allow location for this site, or search by city or ZIP below.";
    }
    if (code === 2) {
      return "Your browser could not find your current location. Search by city or ZIP below.";
    }
    if (code === 3) {
      return "Finding your location took too long. Search by city or ZIP below, or try again.";
    }
  }

  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return "This browser does not support location sharing. Search by city or ZIP below.";
  }

  return "Location not available. Search by city or ZIP below.";
}

async function geocodeLocation(query: string): Promise<LocationSearchResult> {
  const res = await fetchWithTimeout(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
      query
    )}`,
    {},
    10000
  );

  if (!res.ok) throw new Error("Location search is unavailable. Try again shortly.");

  const data = await res.json();
  const first = data[0] as
    | { display_name?: string; lat?: string; lon?: string }
    | undefined;
  const lat = first?.lat ? Number(first.lat) : NaN;
  const lon = first?.lon ? Number(first.lon) : NaN;

  if (!first || Number.isNaN(lat) || Number.isNaN(lon)) {
    throw new Error("No matching location found. Try a city, state, or ZIP code.");
  }

  return {
    label: first.display_name ?? query,
    lat,
    lon,
  };
}

async function fetchResourceTips({
  category,
  heritage,
  mainstream,
}: {
  category: string;
  heritage: string;
  mainstream: string;
}): Promise<{ fallback: boolean; tips: ResourceTip[] }> {
  const res = await fetch("/api/resources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category,
      heritage,
      mainstream,
    }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  if (!res.ok || !contentType.includes("application/json")) {
    throw new Error("Advice is unavailable right now. The map results still work.");
  }

  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return {
    fallback: Boolean(data.fallback),
    tips: data.tips ?? [],
  };
}

async function loadResourceTips(input: {
  category: string;
  heritage: string;
  mainstream: string;
}): Promise<TipsResult> {
  try {
    const result = await fetchResourceTips(input);
    return {
      fallback: result.fallback,
      ok: true,
      tips: result.tips,
    };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Advice is unavailable right now. The map results still work.",
    };
  }
}

async function fetchNearbyPlaces(
  tags: readonly (readonly [string, string])[],
  radiusMeters: number,
  lat: number,
  lon: number
): Promise<NearbyPlace[]> {
  const tagLines = tags
    .map(
      ([k, v]) =>
        `node["${k}"="${v}"](around:${radiusMeters},${lat},${lon});` +
        `way["${k}"="${v}"](around:${radiusMeters},${lat},${lon});`
    )
    .join("\n");

  const query = `[out:json][timeout:20];(\n${tagLines}\n);out center;`;

  let data: { elements?: Record<string, unknown>[] } | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
        },
        14000
      );

      if (res.ok) {
        data = await res.json();
        break;
      }
    } catch {
      // Try the next public Overpass mirror.
    }
  }

  if (!data) throw new Error("OpenStreetMap unavailable. Try again shortly.");

  return (data.elements ?? [])
    .filter((el: Record<string, unknown>) => {
      const tags = el.tags as Record<string, string> | undefined;
      return tags?.name;
    })
    .map((el: Record<string, unknown>) => {
      const elTags = el.tags as Record<string, string>;
      const elLat =
        typeof el.lat === "number"
          ? el.lat
          : (el.center as { lat: number } | undefined)?.lat ?? lat;
      const elLon =
        typeof el.lon === "number"
          ? el.lon
          : (el.center as { lon: number } | undefined)?.lon ?? lon;
      const addrParts = [
        elTags["addr:housenumber"],
        elTags["addr:street"],
        elTags["addr:city"],
      ].filter(Boolean);
      return {
        name: elTags.name,
        address: addrParts.length ? addrParts.join(" ") : elTags["addr:full"],
        distanceKm: haversineKm(lat, lon, elLat, elLon),
        lat: elLat,
        lon: elLon,
      };
    })
    .sort((a: NearbyPlace, b: NearbyPlace) => a.distanceKm - b.distanceKm)
    .slice(0, 8);
}

export default function ResourcesPage() {
  return (
    <SetupGuard>
      {({ heritage, mainstream, heritageLang }) => (
        <Resources
          heritage={heritage}
          mainstream={mainstream}
          heritageLang={heritageLang}
        />
      )}
    </SetupGuard>
  );
}

function Resources({
  heritage,
  mainstream,
  heritageLang,
}: {
  heritage: string;
  mainstream: string;
  heritageLang?: Language;
}) {
  const [activeCategory, setActiveCategory] = useState<Category>(CATEGORIES[0]);
  const [places, setPlaces] = useState<NearbyPlace[]>([]);
  const [tips, setTips] = useState<ResourceTip[]>([]);
  const [adviceFallback, setAdviceFallback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [locNote, setLocNote] = useState<string | null>(
    "Choose a tab to load nearby places on the map."
  );
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<MapPoint | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [selectedPlace, setSelectedPlace] = useState<NearbyPlace | null>(null);

  const mapCenter = useMemo(() => {
    if (places.length > 0) {
      return {
        lat: places.reduce((sum, p) => sum + p.lat, 0) / places.length,
        lon: places.reduce((sum, p) => sum + p.lon, 0) / places.length,
      };
    }
    return userLocation ?? DEFAULT_MAP_CENTER;
  }, [places, userLocation]);

  const mapZoom = userLocation || places.length > 0 ? 14 : 4;

  const loadPlacesForPoint = useCallback(
    async (cat: Category, point: MapPoint, label: string) => {
      const nearbyPlaces = await fetchNearbyPlaces(
        cat.tags,
        cat.radiusMeters,
        point.lat,
        point.lon
      );
      const radiusKm = Math.round(cat.radiusMeters / 1000);

      if (nearbyPlaces.length === 0) {
        setLocNote(
          `No ${cat.label.toLowerCase()} results found within ${radiusKm} km of ${label}. The advice below can still help.`
        );
      } else {
        setLocNote(
          `Showing ${nearbyPlaces.length} nearby ${cat.label.toLowerCase()} result${
            nearbyPlaces.length === 1 ? "" : "s"
          } near ${label}.`
        );
      }

      setPlaces(nearbyPlaces);
      setSelectedPlace(null);
    },
    []
  );

  const loadCategory = useCallback(
    async (cat: Category) => {
      setActiveCategory(cat);
      setPlaces([]);
      setTips([]);
      setAdviceFallback(false);
      setSelectedPlace(null);
      setLocNote(null);
      setError(null);
      setLoading(true);

      try {
        const tipsPromise = loadResourceTips({
          category: cat.label,
          heritage,
          mainstream,
        });

        try {
          const coords = await new Promise<GeolocationCoordinates>(
            (resolve, reject) =>
              navigator.geolocation.getCurrentPosition(
                (p) => resolve(p.coords),
                reject,
                { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 15000 }
              )
          );
          const nextLocation = {
            lat: coords.latitude,
            lon: coords.longitude,
          };
          setUserLocation(nextLocation);
          await loadPlacesForPoint(cat, nextLocation, "your location");
        } catch (locationError) {
          setLocNote(describeGeolocationError(locationError));
        }

        const tipsResult = await tipsPromise;
        if (tipsResult.ok) {
          setTips(tipsResult.tips);
          setAdviceFallback(tipsResult.fallback);
        } else {
          setError(tipsResult.message);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [heritage, loadPlacesForPoint, mainstream]
  );

  const searchLocation = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const trimmedQuery = locationQuery.trim();
      if (!trimmedQuery) return;

      setPlaces([]);
      setTips([]);
      setAdviceFallback(false);
      setSelectedPlace(null);
      setLocNote(null);
      setError(null);
      setLoading(true);

      try {
        const tipsPromise = loadResourceTips({
          category: activeCategory.label,
          heritage,
          mainstream,
        });

        const point = await geocodeLocation(trimmedQuery);
        setUserLocation({ lat: point.lat, lon: point.lon });
        await loadPlacesForPoint(activeCategory, point, point.label.split(",")[0]);

        const tipsResult = await tipsPromise;
        if (tipsResult.ok) {
          setTips(tipsResult.tips);
          setAdviceFallback(tipsResult.fallback);
        } else {
          setError(tipsResult.message);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [activeCategory, heritage, loadPlacesForPoint, locationQuery, mainstream]
  );

  return (
    <div>
      <Link href="/" className="back-link">
        ← Home
      </Link>
      <span className="pill-tag">📍 Resources · {heritage}</span>
      <h1 style={{ marginTop: 4 }}>Find help near you</h1>
      <p className="hint" style={{ marginBottom: 18 }}>
        Switch tabs to see live nearby places on the map, plus advice in your language.
      </p>

      <div
        className="tabs"
        role="tablist"
        aria-label="Resource categories"
        style={{
          alignItems: "stretch",
          display: "flex",
          gap: 8,
          marginBottom: 16,
          overflowX: "auto",
          paddingBottom: 4,
        }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            role="tab"
            aria-selected={activeCategory.id === cat.id}
            className={`tab ${activeCategory.id === cat.id ? "active" : ""}`}
            onClick={() => loadCategory(cat)}
            disabled={loading && activeCategory.id !== cat.id}
            style={{
              alignItems: "center",
              display: "inline-flex",
              flex: "0 0 auto",
              gap: 8,
              minHeight: 44,
              whiteSpace: "nowrap",
            }}
          >
            <span aria-hidden="true">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      <section className="card" style={{ overflow: "hidden", padding: 0 }}>
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: 12,
            justifyContent: "space-between",
            padding: "14px 16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 800 }}>
              {activeCategory.icon} {activeCategory.label}
            </div>
            <div className="hint" style={{ fontSize: 14, marginTop: 2 }}>
              {locNote ?? "Loading nearby places and map pins."}
            </div>
          </div>
          <button
            className="btn"
            onClick={() => loadCategory(activeCategory)}
            disabled={loading}
            style={{ minHeight: 42 }}
          >
            {loading ? "Updating..." : "Use my location"}
          </button>
        </div>

        <form
          onSubmit={searchLocation}
          style={{
            alignItems: "center",
            borderTop: "1px solid var(--line)",
            display: "flex",
            gap: 10,
            padding: "12px 16px",
          }}
        >
          <input
            aria-label="Search by city or ZIP"
            placeholder="Search city or ZIP"
            type="text"
            value={locationQuery}
            onChange={(event) => setLocationQuery(event.target.value)}
            style={{ minWidth: 0 }}
          />
          <button
            className="btn btn--bridge"
            disabled={loading || !locationQuery.trim()}
            type="submit"
            style={{ flex: "0 0 auto", minHeight: 42, paddingInline: 18 }}
          >
            Search
          </button>
        </form>

        <div className="resource-map-shell">
          <ResourcesLeafletMap
            activeIcon={activeCategory.icon}
            center={mapCenter}
            initialZoom={mapZoom}
            loading={loading}
            onSelectPlace={setSelectedPlace}
            places={places}
            selectedPlace={selectedPlace}
            userLocation={userLocation}
          />
        </div>
      </section>

      {error && !loading && (
        <p className="error-text" style={{ marginTop: 14 }}>
          {error}
        </p>
      )}

      {places.length > 0 && (
        <section style={{ marginTop: 26 }}>
          <h2 className="section" style={{ marginTop: 0 }}>
            Nearby {activeCategory.label}
          </h2>
          <div className="stack">
            {places.map((p, i) => (
              <button
                key={`${p.name}-${i}`}
                className="card"
                onClick={() => setSelectedPlace(p)}
                style={{
                  padding: "14px 18px",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ alignItems: "center", display: "flex", gap: 10 }}>
                  <span className="pill-tag" style={{ margin: 0 }}>
                    {i + 1}
                  </span>
                  <div style={{ fontWeight: 800, fontSize: 17 }}>{p.name}</div>
                </div>
                {p.address && (
                  <div className="hint" style={{ marginTop: 6 }}>
                    {p.address}
                  </div>
                )}
                <div
                  style={{
                    display: "flex",
                    gap: 14,
                    marginTop: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <span className="pill-tag" style={{ margin: 0 }}>
                    {p.distanceKm < 1
                      ? `${Math.round(p.distanceKm * 1000)} m away`
                      : `${p.distanceKm.toFixed(1)} km away`}
                  </span>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    style={{
                      fontSize: 14,
                      color: "var(--bridge)",
                      fontWeight: 800,
                      textDecoration: "none",
                    }}
                  >
                    Get directions →
                  </a>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {tips.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 className="section" style={{ marginTop: 0 }}>
            {adviceFallback ? "General advice" : `Advice in ${heritage}`}
          </h2>
          <div className="stack">
            {tips.map((tip, i) => (
              <div key={i} className="card">
                <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 10 }}>
                  {tip.title}
                </div>

                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    lineHeight: 1.5,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                  }}
                >
                  <span>{tip.heritageAdvice}</span>
                  <SpeakButton
                    text={tip.heritageAdvice}
                    lang={heritageLang?.bcp47 ?? null}
                  />
                </div>

                <div
                  className="hint"
                  style={{ marginTop: 8, fontSize: 14, lineHeight: 1.5 }}
                >
                  {tip.mainstreamAdvice}
                </div>

                {tip.phrase && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: "12px 14px",
                      background: "#fff3e2",
                      borderRadius: 12,
                      border: "1px solid #f1dcc0",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 16 }}>
                        {tip.phrase}
                      </div>
                      <div
                        style={{
                          fontStyle: "italic",
                          color: "var(--brand-dark)",
                          fontSize: 14,
                          marginTop: 2,
                        }}
                      >
                        🔤 {tip.phonetic}
                      </div>
                    </div>
                    <SpeakButton
                      text={tip.phrase}
                      lang={heritageLang?.bcp47 ?? null}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

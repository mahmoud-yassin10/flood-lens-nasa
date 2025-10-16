import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";

import floodsRaw from "@/data/floods.geojson?raw";
import assetsRaw from "@/data/assets.geojson?raw";
import { MapView } from "@/components/MapView";
import { FloodDetailsDrawer } from "@/components/FloodDetailsDrawer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CityPanel } from "@/components/CityPanel";
import type {
  AssetFeature,
  AssetFeatureCollection,
  FloodEventFeature,
  FloodFeatureCollection,
} from "@/types/geo";
import { impactedAssets, cityBbox } from "@/lib/geo";
import { fitToBbox, setMapInstance } from "@/lib/mapInstance";
import { cn } from "@/lib/utils";
import { BasemapChoice, ThemeMode, useThemeMode } from "@/lib/theme";
import { useCityStore } from "@/store/cityStore";

// NEW: unified city data loader (prefers real, falls back to model) + time utils
import { fetchCity } from "@/lib/fetchCity";
import { fmtLocal } from "@/utils/buckets";

function safeParseJSON<T>(raw: string, label: string): T {
  const cleaned = raw.replace(/^\uFEFF/, "").trim().replace(/^'|'$/g, "");
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    const preview = cleaned.slice(0, 80);
    console.error(`[Flood-Lens] Failed to parse ${label}. Preview:`, preview);
    throw error;
  }
}

function extractCityIdFromHash(): string | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash;
  if (!raw) return null;
  const stripped = raw.replace(/^#/, "");
  const withoutLeadingSlash = stripped.startsWith("/") ? stripped.slice(1) : stripped;
  const params = new URLSearchParams(
    withoutLeadingSlash.includes("?")
      ? withoutLeadingSlash.split("?")[1]
      : withoutLeadingSlash
  );
  return params.get("city");
}

const floodsCollection = safeParseJSON<FloodFeatureCollection>(floodsRaw, "floods.geojson");
const assetsCollection = safeParseJSON<AssetFeatureCollection>(assetsRaw, "assets.geojson");
const FLOODS: FloodEventFeature[] = floodsCollection.features;
const ASSETS: AssetFeature[] = assetsCollection.features;

export default function Home() {
  const [themeMode, setThemeMode] = useThemeMode();
  const [basemapChoice, setBasemapChoice] = useState<BasemapChoice>("auto");
  const [isFullMapView, setIsFullMapView] = useState(false);
  const [selectedFloodId, setSelectedFloodId] = useState<string>(FLOODS[0]?.properties.id ?? "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mapRef = useRef<LeafletMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const { cities, selectedCityId, setSelectedCityId } = useCityStore();

  const selectedCity = useMemo(() => {
    if (!selectedCityId) return null;
    return cities.find((city) => city.id === selectedCityId) ?? null;
  }, [cities, selectedCityId]);

  // NEW: city payload (real → model fallback) + loading state
  const [cityData, setCityData] = useState<any | null>(null);
  const [loadingCity, setLoadingCity] = useState(false);

  // Pick city from URL hash on first load
  useEffect(() => {
    const fromHash = extractCityIdFromHash();
    if (fromHash) setSelectedCityId(fromHash);
  }, [setSelectedCityId]);

  // Sync on hash changes
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handleHashChange = () => {
      const nextId = extractCityIdFromHash();
      if (nextId) setSelectedCityId(nextId);
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [setSelectedCityId]);

  // Zoom to selected city
  useEffect(() => {
    if (!selectedCity || !mapReady) return;
    fitToBbox(cityBbox(selectedCity));
  }, [selectedCity, mapReady]);

  // Cleanup map instance on unmount
  useEffect(() => {
    return () => {
      mapRef.current = null;
      setMapInstance(null);
    };
  }, []);

  // Lock body scroll in full map mode
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    if (isFullMapView) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previousOverflow;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullMapView]);

  // Precompute impacted assets per flood
  const impactedByFlood = useMemo(() => {
    return FLOODS.reduce<Record<string, AssetFeature[]>>((acc, flood) => {
      acc[flood.properties.id] = impactedAssets(flood, ASSETS);
      return acc;
    }, {});
  }, []);

  const selectedFlood = useMemo(() => {
    return FLOODS.find((feature) => feature.properties.id === selectedFloodId) ?? null;
  }, [selectedFloodId]);

  const selectedImpacted = useMemo(
    () => impactedByFlood[selectedFloodId] ?? [],
    [impactedByFlood, selectedFloodId]
  );

  const mapSectionClass = cn(
    "relative bg-panel shadow-sm transition-all",
    isFullMapView
      ? "fixed inset-0 z-[2000] m-0 overflow-hidden rounded-none p-0 sm:p-3 bg-[var(--bg)]"
      : "rounded-xl p-3"
  );

  const mapWrapperClass = cn("w-full", isFullMapView ? "h-screen" : "h-[70vh] min-h-[420px]");

  const handleThemeChange = (mode: ThemeMode) => setThemeMode(mode);

  // NEW: Load city JSON with no-cache and model fallback.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCity?.id) {
        setCityData(null);
        return;
      }
      try {
        setLoadingCity(true);
        const payload = await fetchCity(selectedCity.id);
        if (!cancelled) setCityData(payload);
      } catch (e) {
        console.error("[Flood-Lens] city load failed:", e);
        if (!cancelled) setCityData(null);
      } finally {
        if (!cancelled) setLoadingCity(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCity?.id]);

  // Derive Updated… label (falls back to “now”)
  const updatedLabel = useMemo(() => {
    const iso = cityData?.timestamp_iso ?? new Date().toISOString();
    return fmtLocal(iso);
  }, [cityData?.timestamp_iso]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="flex flex-col gap-2 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold">Flood-Lens</h1>
          <p className="text-sm text-muted-foreground">
            NASA-powered situational awareness for flood response
          </p>
          {/* NEW: Updated timestamp mirrors JSON (refreshes every 3h via workflow/seed) */}
          {selectedCity?.id && (
            <span className="mt-1 text-xs text-muted-foreground">
              Updated {updatedLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle mode={themeMode} onModeChange={handleThemeChange} />
        </div>
      </header>

      <main className={cn("grid gap-6 px-6 py-6", !isFullMapView && "lg:grid-cols-[2fr,1fr]")}>
        <section className={mapSectionClass}>
          <div className={mapWrapperClass}>
            <MapView
              floods={FLOODS}
              impactedByFlood={impactedByFlood}
              selectedFloodId={selectedFloodId}
              themeMode={themeMode}
              basemapChoice={basemapChoice}
              onSelectFlood={setSelectedFloodId}
              onChangeBasemap={setBasemapChoice}
              onOpenDetails={() => setDrawerOpen(true)}
              onMapReady={(map) => {
                mapRef.current = map;
                setMapReady(true);
                setMapInstance(map);
              }}
              onToggleFullMap={() => setIsFullMapView((prev) => !prev)}
              isFullMapView={isFullMapView}
            />
          </div>
        </section>

        {!isFullMapView && (
          <aside className="h-[70vh] min-h-[420px] overflow-hidden">
            {/* NEW: Provide city data so the panel can fill all fields immediately (model → real). */}
            {/* @ts-expect-error allow optional prop injection without changing the component type */}
            <CityPanel data={cityData} loading={loadingCity} />
          </aside>
        )}
      </main>

      <FloodDetailsDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        flood={selectedFlood}
        impactedAssets={selectedImpacted}
        map={mapRef.current}
      />
    </div>
  );
}

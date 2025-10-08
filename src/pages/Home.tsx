import { useEffect, useMemo, useRef, useState } from "react";
import L, { type Map as LeafletMap } from "leaflet";

import floodsRaw from "@/data/floods.geojson?raw";
import assetsRaw from "@/data/assets.geojson?raw";
import { MapView } from "@/components/MapView";
import { FloodDetailsDrawer } from "@/components/FloodDetailsDrawer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CityPanel } from "@/components/CityPanel";
import type { AssetFeature, AssetFeatureCollection, FloodEventFeature, FloodFeatureCollection } from "@/types/geo";
import { impactedAssets, cityBounds } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { BasemapChoice, ThemeMode, useThemeMode } from "@/lib/theme";
import { useCityStore } from "@/store/cityStore";

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
  const params = new URLSearchParams(withoutLeadingSlash.includes("?") ? withoutLeadingSlash.split("?")[1] : withoutLeadingSlash);
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

  useEffect(() => {
    const fromHash = extractCityIdFromHash();
    if (fromHash) {
      setSelectedCityId(fromHash);
    }
  }, [setSelectedCityId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleHashChange = () => {
      const nextId = extractCityIdFromHash();
      if (nextId) {
        setSelectedCityId(nextId);
      }
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [setSelectedCityId]);

  useEffect(() => {
    if (!selectedCity || !mapRef.current || !mapReady) return;
    const bounds = cityBounds(selectedCity);
    const nextBounds = L.latLngBounds(bounds[0], bounds[1]);
    if (!nextBounds.isValid()) return;
    mapRef.current.fitBounds(nextBounds, { padding: [32, 32] });
  }, [selectedCity?.id, mapReady]);

  const impactedByFlood = useMemo(() => {
    return FLOODS.reduce<Record<string, AssetFeature[]>>((acc, flood) => {
      acc[flood.properties.id] = impactedAssets(flood, ASSETS);
      return acc;
    }, {});
  }, []);

  const selectedFlood = useMemo(() => {
    return FLOODS.find((feature) => feature.properties.id === selectedFloodId) ?? null;
  }, [selectedFloodId]);

  const selectedImpacted = useMemo(() => impactedByFlood[selectedFloodId] ?? [], [impactedByFlood, selectedFloodId]);

  const mapSectionClass = cn(
    "relative rounded-xl bg-panel p-3 shadow-sm",
    isFullMapView ? "col-span-full h-[calc(100vh-160px)] sm:h-[calc(100vh-200px)]" : "h-[70vh] min-h-[420px]",
  );

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <header className="flex flex-col gap-4 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Flood-Lens</h1>
          <p className="text-sm text-muted-foreground">NASA-powered situational awareness for flood response</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle mode={themeMode} onModeChange={handleThemeChange} />
        </div>
      </header>

      <main className={cn("grid gap-6 px-6 py-6", !isFullMapView && "lg:grid-cols-[2fr,1fr]")}>
        <section className={mapSectionClass}>
          <div className="h-full">
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
              }}
              onToggleFullMap={() => setIsFullMapView((prev) => !prev)}
              isFullMapView={isFullMapView}
            />
          </div>
        </section>

        {!isFullMapView && (
          <aside className="h-[70vh] min-h-[420px] overflow-hidden">
            <CityPanel />
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

import { useMemo, useRef, useState } from "react";
import type L from "leaflet";

import floodsRaw from "@/data/floods.geojson?raw";
import assetsRaw from "@/data/assets.geojson?raw";
import { MapView } from "@/components/MapView";
import { FloodDetailsDrawer } from "@/components/FloodDetailsDrawer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { LocalClock } from "@/components/LocalClock";
import { Button } from "@/components/ui/button";
import type { AssetFeature, AssetFeatureCollection, FloodEventFeature, FloodFeatureCollection } from "@/types/geo";
import { impactedAssets, formatIsoRange } from "@/lib/geo";
import { cn } from "@/lib/utils";
import { BASEMAP_CHOICES, BasemapChoice, ThemeMode, useThemeMode } from "@/lib/theme";

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
  const mapRef = useRef<L.Map | null>(null);

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
  const selectedTimezone = selectedFlood?.properties.timezone ?? "UTC";
  const mapSectionClass = cn(
    "relative rounded-xl bg-panel p-3 shadow-sm",
    isFullMapView ? "col-span-full h-[calc(100vh-160px)] sm:h-[calc(100vh-200px)]" : "h-[70vh] min-h-[420px]"
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
              onSelectFlood={(id) => {
                setSelectedFloodId(id);
              }}
              onChangeBasemap={setBasemapChoice}
              onOpenDetails={() => setDrawerOpen(true)}
              onMapReady={(map) => {
                mapRef.current = map;
              }}
              onToggleFullMap={() => setIsFullMapView((prev) => !prev)}
              isFullMapView={isFullMapView}
            />
          </div>
        </section>

        {!isFullMapView && (
          <aside className="flex h-[70vh] flex-col gap-4">
            <div className="rounded-xl border border-border bg-panel p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Flood events</h2>
                <p className="text-xs text-muted-foreground">Choose a flood to inspect on the map</p>
              </div>
              <Badge variant="outline" className="text-xs">
                {FLOODS.length} active
              </Badge>
            </div>

            <Select value={selectedFloodId} onValueChange={setSelectedFloodId}>
              <SelectTrigger className="mt-4 bg-panel">
                <SelectValue placeholder="Select a flood" />
              </SelectTrigger>
              <SelectContent>
                {FLOODS.map((flood) => (
                  <SelectItem key={flood.properties.id} value={flood.properties.id}>
                    {flood.properties.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedFlood ? (
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Location:</span>
                  <span className="text-muted-foreground">
                    {selectedFlood.properties.admin1 ?? "-"}, {selectedFlood.properties.country} ({selectedFlood.properties.iso3})
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Period:</span>
                  <span className="text-muted-foreground">
                    {formatIsoRange(selectedFlood.properties.start, selectedFlood.properties.end)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Local time:</span>
                  <LocalClock timezone={selectedTimezone} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">Impacted assets:</span>
                  <span className="text-muted-foreground">{selectedImpacted.length}</span>
                </div>
                {selectedFlood.properties.severity ? (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">Severity:</span>
                    <Badge variant="outline" className="text-xs uppercase">
                      {selectedFlood.properties.severity}
                    </Badge>
                  </div>
                ) : null}
              </div>
            ) : null}

            <Button className="mt-6 w-full" variant="default" onClick={() => setDrawerOpen(true)} disabled={!selectedFlood}>
              View full details
            </Button>
          </div>

          <div className="rounded-xl border border-border bg-panel p-4 shadow-sm">
            <h3 className="text-base font-semibold">Basemap mode</h3>
            <p className="text-xs text-muted-foreground">Auto matches the active theme.</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {BASEMAP_CHOICES.map((choice) => (
                <Button
                  key={choice}
                  variant={choice === basemapChoice ? "default" : "outline"}
                  className="justify-center"
                  onClick={() => setBasemapChoice(choice)}
                >
                  {choice.charAt(0).toUpperCase() + choice.slice(1)}
                </Button>
              ))}
            </div>
          </div>
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













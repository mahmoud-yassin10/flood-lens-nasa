import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, GeoJSON, Marker, Popup, TileLayer, Pane } from "react-leaflet";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import type { AssetFeature, FloodEventFeature } from "@/types/geo";
import { assetCentroid, floodCentroid, MAX_ASSET_MARKERS } from "@/lib/geo";
import { BaseLayerToggle } from "@/components/BaseLayerToggle";
import { Button } from "@/components/ui/button";
import { LocalClock } from "@/components/LocalClock";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { BASEMAP_CHOICES, BASEMAP_LABELS, BasemapChoice, ThemeMode } from "@/lib/theme";
import { useCityStore } from "@/store/cityStore";
import { fetchCityLive, LiveCity } from "@/lib/live";

interface MapViewProps {
  floods: FloodEventFeature[];
  impactedByFlood: Record<string, AssetFeature[]>;
  selectedFloodId: string;
  themeMode: ThemeMode;
  basemapChoice: BasemapChoice;
  onSelectFlood: (floodId: string) => void;
  onChangeBasemap: (choice: BasemapChoice) => void;
  onOpenDetails: () => void;
  onMapReady?: (map: L.Map) => void;
  onToggleFullMap: () => void;
  isFullMapView: boolean;
}


export function MapView({
  floods,
  impactedByFlood,
  selectedFloodId,
  themeMode,
  basemapChoice,
  onSelectFlood,
  onChangeBasemap,
  onOpenDetails,
  onMapReady,
  onToggleFullMap,
  isFullMapView,
}: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const sarInitializedRef = useRef(false);
  const { selectedCityId } = useCityStore();
  const [showSarOverlay, setShowSarOverlay] = useState(false);

  const { data: liveCity } = useQuery<LiveCity>({
    queryKey: ["city-live", selectedCityId],
    queryFn: () => fetchCityLive(selectedCityId!),
    enabled: Boolean(selectedCityId),
    staleTime: 60 * 1000,
    retry: false,
  });

  const sarTiles = liveCity?.tiles;
  const sarOverlayKey = sarTiles ? `${sarTiles.template}|${sarTiles.minzoom ?? ""}|${sarTiles.maxzoom ?? ""}` : null;
  const sarOverlayAvailable = Boolean(sarOverlayKey);

  useEffect(() => {
    if (!sarOverlayKey) {
      sarInitializedRef.current = false;
      setShowSarOverlay(false);
      return;
    }
    if (!sarInitializedRef.current) {
      sarInitializedRef.current = true;
      setShowSarOverlay(true);
    }
  }, [sarOverlayKey]);

  const selectedFlood = useMemo(() => {
    return floods.find((feature) => feature.properties.id === selectedFloodId) ?? floods[0] ?? null;
  }, [floods, selectedFloodId]);

  const selectedImpacted: AssetFeature[] = useMemo(() => {
    if (!selectedFlood) return [];
    return impactedByFlood[selectedFlood.properties.id] ?? [];
  }, [impactedByFlood, selectedFlood]);

  const floodCollection = useMemo(() => ({
    type: "FeatureCollection",
    features: floods,
  }), [floods]);

  const floodMarkerIcon = useMemo(() => {
    return L.divIcon({
      className: "",
      html: '<div class="flood-marker" role="presentation"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  }, []);

  const assetIcons = useRef<Record<string, L.DivIcon>>({});

  const assetsForMarkers = useMemo(() => {
    return selectedImpacted
      .slice(0, MAX_ASSET_MARKERS)
      .map((asset) => {
        const position = assetCentroid(asset);
        if (!position) return null;
        return { asset, position };
      })
      .filter((entry): entry is { asset: AssetFeature; position: { lat: number; lng: number } } => Boolean(entry));
  }, [selectedImpacted]);

  const truncated = selectedImpacted.length > MAX_ASSET_MARKERS;

  const fullMapLabel = isFullMapView ? "Exit full map" : "Full map view";

  const handleMapReady = useCallback(
    (map: L.Map) => {
      mapRef.current = map;
      onMapReady?.(map);
    },
    [onMapReady],
  );

  const handleFeatureClick = useCallback(
    (feature: FloodEventFeature) => {
      onSelectFlood(feature.properties.id);
    },
    [onSelectFlood],
  );

  const registerFeature = useCallback(
    (feature: FloodEventFeature, layer: L.Layer) => {
      layer.on("click", () => handleFeatureClick(feature));
    },
    [handleFeatureClick],
  );

  const centroid = selectedFlood ? floodCentroid(selectedFlood) : { lat: 0, lng: 0 };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[centroid.lat, centroid.lng]}
        zoom={6}
        className="h-full w-full rounded-xl border border-border"
        scrollWheelZoom
        whenCreated={handleMapReady}
        preferCanvas
      >
        <BaseLayerToggle mode={themeMode} choice={basemapChoice} />

        {sarOverlayAvailable ? (
          <Pane name="sar-overlay" style={{ zIndex: 650 }}>
            {showSarOverlay && sarTiles ? (
              <TileLayer
                url={sarTiles.template}
                opacity={0.6}
                minZoom={sarTiles.minzoom ?? 0}
                maxZoom={sarTiles.maxzoom ?? 22}
                pane="sar-overlay"
              />
            ) : null}
          </Pane>
        ) : null}

        <GeoJSON
          key={selectedFlood?.properties.id ?? "floods"}
          data={floodCollection as any}
          style={(feature) => {
            const isSelected = feature?.properties?.id === selectedFlood?.properties.id;
            return {
              color: "var(--map-flood)",
              weight: isSelected ? 3 : 1.5,
              opacity: isSelected ? 0.9 : 0.6,
              fillColor: "var(--map-flood)",
              fillOpacity: isSelected ? 0.35 : 0.18,
            };
          }}
          onEachFeature={(feature, layer) => registerFeature(feature as FloodEventFeature, layer)}
        />

        {floods.map((feature) => {
          const { lat, lng } = floodCentroid(feature);
          const impactedCount = impactedByFlood[feature.properties.id]?.length ?? 0;
          const timezone = feature.properties.timezone ?? "UTC";
          return (
            <Marker
              key={feature.properties.id}
              position={[lat, lng]}
              icon={floodMarkerIcon}
              eventHandlers={{
                click: () => onSelectFlood(feature.properties.id),
              }}
            >
              <Popup>
                <div className="space-y-2 text-sm">
                  <div>
                    <h3 className="text-base font-semibold">{feature.properties.name}</h3>
                    <p className="text-muted-foreground">
                      {feature.properties.admin1 ?? "-"}, {feature.properties.country} ({feature.properties.iso3})
                    </p>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span>Local:</span>
                    <LocalClock timezone={timezone} />
                  </div>
                  <p className="text-sm">Impacted assets: {impactedCount}</p>
                  <Button className="w-full" onClick={() => {
                    onSelectFlood(feature.properties.id);
                    onOpenDetails();
                  }}>
                    Open details
                  </Button>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {assetsForMarkers.map(({ asset, position }) => {
          const type = asset.properties.type;
          if (!assetIcons.current[type]) {
            assetIcons.current[type] = L.divIcon({
              className: "",
              html: `<div class="asset-marker" title="${type}"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7],
            });
          }
          const icon = assetIcons.current[type];
          return (
            <Marker key={asset.properties.id} position={[position.lat, position.lng]} icon={icon}>
              <Popup>
                <div className="space-y-1 text-sm">
                  <p className="font-medium">{asset.properties.name}</p>
                  <p className="text-muted-foreground capitalize">{asset.properties.type}</p>
                  <p className="text-muted-foreground">
                    {asset.properties.admin1 ?? "-"}, {asset.properties.country}
                  </p>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="pointer-events-none absolute left-4 top-4 z-[1200] flex flex-col gap-3">
        <div className="pointer-events-auto self-end">
          <Button size="sm" variant="secondary" onClick={onToggleFullMap}>
            {fullMapLabel}
          </Button>
        </div>
        <div className="pointer-events-auto rounded-md border bg-panel/95 p-2 shadow-lg backdrop-blur">
          <p className="text-xs font-medium uppercase text-muted-foreground">Basemap</p>
          <ToggleGroup
            type="single"
            value={basemapChoice}
            onValueChange={(value) => {
              if (!value) return;
              onChangeBasemap(value as BasemapChoice);
            }}
            className="mt-2"
          >
            {BASEMAP_CHOICES.map((choice) => (
              <ToggleGroupItem key={choice} value={choice} className="text-xs capitalize">
                {BASEMAP_LABELS[choice]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {sarOverlayAvailable ? (
          <div className="pointer-events-auto flex items-center justify-between gap-4 rounded-md border bg-panel/95 p-3 shadow-lg backdrop-blur">
            <div>
              <p className="text-sm font-semibold">New water (SAR)</p>
              <p className="text-xs text-muted-foreground">Latest detections overlay</p>
            </div>
            <Switch checked={showSarOverlay} onCheckedChange={setShowSarOverlay} aria-label="Toggle SAR new water overlay" />
          </div>
        ) : null}

        <div className="pointer-events-auto rounded-md border bg-panel/95 p-3 text-xs shadow-lg backdrop-blur">
          <p className="font-semibold text-sm">Legend</p>
          <ul className="mt-2 space-y-1">
            <li className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--map-marker)" }} />
              Flood centroid
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--map-flood)" }} />
              Flood extent
            </li>
            <li className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--map-asset)" }} />
              Impacted assets
            </li>
          </ul>
          {truncated ? (
            <p className="mt-2 text-muted-foreground">
              Showing first {MAX_ASSET_MARKERS.toLocaleString()} of {selectedImpacted.length.toLocaleString()} assets.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useCityStore } from "@/store/cityStore";
import { Basemaps, BasemapKey } from "@/config/basemaps";

// Fix Leaflet default marker icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const baseLayerRef = useRef<L.TileLayer | null>(null);

  const { cities, selectedCity, basemap } = useCityStore();

  // Helper to add basemap layer
  const addBaseLayer = (map: L.Map, key: BasemapKey) => {
    const cfg = Basemaps[key];
    if (!cfg) return null;

    if (cfg.type === "wmts") {
      const { layer, tileMatrixSet, time, attribution, maxZoom } = cfg.options;
      const template = cfg.url
        .replace("{Layer}", layer)
        .replace("{Time}", time)
        .replace("{TileMatrixSet}", tileMatrixSet);
      return L.tileLayer(template, { attribution, maxZoom }).addTo(map);
    }

    return L.tileLayer(cfg.url, cfg.options).addTo(map);
  };

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    // Initialize map
    const map = L.map(mapRef.current, {
      center: [15, 30],
      zoom: 3,
      zoomControl: true,
    });

    // Add initial base layer
    baseLayerRef.current = addBaseLayer(map, basemap);

    // Add NASA GIBS layer example (IMERG precipitation)
    const today = new Date().toISOString().split("T")[0];
    L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/GPM_3IMERGHH/default/${today}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.png`,
      {
        attribution: "NASA GIBS - GPM IMERG",
        opacity: 0.6,
        maxZoom: 9,
      }
    ).addTo(map);

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      baseLayerRef.current = null;
    };
  }, []);

  // Update markers when cities change
  useEffect(() => {
    if (!mapInstance.current) return;

    const map = mapInstance.current;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    // Add markers for each city
    cities.forEach((city) => {
      const marker = L.marker([city.lat, city.lon], {
        title: city.name,
      }).addTo(map);

      marker.bindPopup(`
        <div class="p-2">
          <strong>${city.name}</strong><br/>
          <span class="text-sm text-gray-600">${city.lat.toFixed(4)}, ${city.lon.toFixed(4)}</span>
        </div>
      `);

      markersRef.current.set(city.id, marker);
    });
  }, [cities]);

  // Update basemap when changed
  useEffect(() => {
    if (!mapInstance.current) return;

    // Remove old base layer
    if (baseLayerRef.current) {
      baseLayerRef.current.remove();
    }

    // Add new base layer
    baseLayerRef.current = addBaseLayer(mapInstance.current, basemap);
  }, [basemap]);

  // Pan to selected city
  useEffect(() => {
    if (!mapInstance.current || !selectedCity) return;

    const map = mapInstance.current;
    map.setView([selectedCity.lat, selectedCity.lon], 8, {
      animate: true,
      duration: 1,
    });

    const marker = markersRef.current.get(selectedCity.id);
    if (marker) {
      marker.openPopup();
    }
  }, [selectedCity]);

  return (
    <div className="relative h-screen w-full">
      <div ref={mapRef} className="h-full w-full" />
      
      {/* Legend Overlay */}
      <div className="absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm p-4 rounded-lg shadow-lg border max-w-xs">
        <h3 className="font-semibold mb-2 text-sm">Active Layers</h3>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-primary/60 rounded"></div>
            <span>NASA GIBS - GPM IMERG Precipitation</span>
          </div>
          <p className="text-muted-foreground text-xs mt-2">
            Last update: {new Date().toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}

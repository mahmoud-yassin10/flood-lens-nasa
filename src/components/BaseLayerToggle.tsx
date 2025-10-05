import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

import type { BasemapChoice, ThemeMode } from "@/lib/theme";

const createTiles = () => ({
  light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; Carto",
    maxZoom: 19,
  }),
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; Carto",
    maxZoom: 19,
  }),
  satellite: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      attribution: "Tiles &copy; Esri",
      maxZoom: 19,
    },
  ),
  labelsLight: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
  }),
  labelsDark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
  }),
});

export function BaseLayerToggle({ mode, choice }: { mode: ThemeMode; choice: BasemapChoice }) {
  const map = useMap();

  useEffect(() => {
    const tiles = createTiles();
    const activeLayers: L.Layer[] = [];

    const addLayer = (layer: L.Layer) => {
      layer.addTo(map);
      activeLayers.push(layer);
    };

    if (choice === "satellite") {
      addLayer(tiles.satellite);
      addLayer(mode === "dark" ? tiles.labelsDark : tiles.labelsLight);
    } else if (choice === "light" || (choice === "auto" && mode === "light")) {
      addLayer(tiles.light);
    } else if (choice === "dark" || (choice === "auto" && mode === "dark")) {
      addLayer(tiles.dark);
    }

    return () => {
      activeLayers.forEach((layer) => {
        map.removeLayer(layer);
      });
    };
  }, [map, mode, choice]);

  return null;
}

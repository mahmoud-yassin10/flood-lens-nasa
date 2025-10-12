import type { Map as LeafletMap, PointExpression } from "leaflet";

type BBox = [number, number, number, number];

let mapInstance: LeafletMap | null = null;

export function setMapInstance(map: LeafletMap | null) {
  mapInstance = map;
  if (typeof window !== "undefined") {
    if (map) {
      window.__MAP__ = map;
    } else {
      delete window.__MAP__;
    }
  }
}

export function getMapInstance(): LeafletMap | null {
  return mapInstance;
}

export function fitToBbox(bbox?: BBox | null, padding: PointExpression = [32, 32]) {
  if (!mapInstance || !bbox) return;
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number) as BBox;
  if (![minLon, minLat, maxLon, maxLat].every((value) => Number.isFinite(value))) return;
  const southWest: [number, number] = [minLat, minLon];
  const northEast: [number, number] = [maxLat, maxLon];
  try {
    mapInstance.fitBounds([southWest, northEast], { padding });
  } catch (error) {
    console.warn("fitToBbox failed", { bbox }, error);
  }
}

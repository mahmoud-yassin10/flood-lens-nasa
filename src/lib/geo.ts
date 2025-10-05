import * as turf from "@turf/turf";
import type { AssetFeature, FloodEventFeature } from "@/types/geo";

export const MAX_ASSET_MARKERS = 2000;

export function impactedAssets(flood: FloodEventFeature, assets: AssetFeature[]): AssetFeature[] {
  return assets.filter((asset) => {
    try {
      return turf.booleanIntersects(asset as any, flood as any);
    } catch (error) {
      console.warn("Failed to intersect asset", asset.properties.id, error);
      return false;
    }
  });
}

export function floodCentroid(feature: FloodEventFeature): { lat: number; lng: number } {
  const centroid = turf.centroid(feature as any);
  const [lng, lat] = centroid.geometry.coordinates as [number, number];
  return { lat, lng };
}

export function assetCentroid(asset: AssetFeature): { lat: number; lng: number } | null {
  if (asset.geometry.type === "Point") {
    const [lng, lat] = asset.geometry.coordinates as [number, number];
    return { lat, lng };
  }

  try {
    const centroid = turf.centroid(asset as any);
    const [lng, lat] = centroid.geometry.coordinates as [number, number];
    return { lat, lng };
  } catch (error) {
    console.warn("Failed to derive centroid for asset", asset.properties.id, error);
    return null;
  }
}

export function countAssetsByType(assets: AssetFeature[]): { type: string; count: number }[] {
  const counts = assets.reduce<Record<string, number>>((acc, asset) => {
    const type = asset.properties.type;
    acc[type] = (acc[type] ?? 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
}

export function formatIsoRange(start?: string, end?: string): string {
  if (!start && !end) return "—";
  if (start && !end) return new Date(start).toLocaleString();
  if (!start && end) return new Date(end).toLocaleString();
  const startDt = new Date(start!);
  const endDt = new Date(end!);
  return `${startDt.toLocaleString()} -> ${endDt.toLocaleString()}`;
}


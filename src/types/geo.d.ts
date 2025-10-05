import type { Feature, FeatureCollection, Geometry, Point, LineString, Polygon, MultiPolygon } from "geojson";

export type ISODate = string;

export interface FloodEventProps {
  id: string;
  name: string;
  start: ISODate;
  end?: ISODate;
  country: string;
  iso3: string;
  admin1?: string;
  severity?: "low" | "med" | "high";\n  timezone?: string;
}

export type FloodEventGeometry = Polygon | MultiPolygon;

export type FloodEventFeature = Feature<FloodEventGeometry, FloodEventProps>;

export interface AssetProps {
  id: string;
  name: string;
  type: "hospital" | "school" | "road" | "power" | "water" | "telecom" | "other";
  country: string;
  admin1?: string;
}

export type AssetGeometry = Point | LineString | Polygon;

export type AssetFeature = Feature<AssetGeometry, AssetProps>;

export type FloodFeatureCollection = FeatureCollection<FloodEventGeometry, FloodEventProps>;
export type AssetFeatureCollection = FeatureCollection<AssetGeometry, AssetProps>;

declare module "leaflet-image" {
  import type { Map } from "leaflet";

  export default function leafletImage(
    map: Map,
    callback: (err: Error | null, canvas: HTMLCanvasElement) => void
  ): void;
}


declare module "*.geojson" {
  const value: unknown;
  export default value;
}



declare module "*.geojson?raw" {
  const value: string;
  export default value;
}



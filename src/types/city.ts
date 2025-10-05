export interface City {
  id: string;
  group: "med_delta" | "blue_nile" | "global_hotspot";
  name: string;
  lat: number;
  lon: number;
  tz: string;
  radius_km: number;
}

export interface CityMetrics {
  cityId: string;
  timestamp: string;
  rain_0_3h: number;
  rain_0_24h: number;
  rain_24_72h: number;
  soil_moisture?: number;
  water_area_delta?: number;
  swot_wse_anomaly?: number;
  risk: "Low" | "Medium" | "High";
  lastUpdate: string;
  freshness: "fresh" | "stale" | "old";
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

export type GroupFilter = "all" | "blue_nile" | "global_hotspot" | "med_delta";

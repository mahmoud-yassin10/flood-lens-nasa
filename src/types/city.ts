export interface City {
  id: string;
  group: "med_delta" | "blue_nile" | "global_hotspot";
  name: string;
  lat: number;
  lon: number;
  tz: string;
  radius_km: number;
}

export type GroupFilter = "all" | "blue_nile" | "global_hotspot" | "med_delta";

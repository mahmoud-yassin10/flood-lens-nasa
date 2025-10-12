export type LiveCity = {
  cityId: string;
  tz?: string;
  updated: string;
  rain: { h3: number | null; h24: number | null; h72: number | null; api72: number | null };
  sar: {
    age_hours: number | null;
    new_water_km2: number | null;
    pct_aoi: number | null;
    confidence: "low" | "medium" | "high" | null;
    tiles_template?: string;
  };
  terrain: { low_HAND_pct: number | null };
  risk: { score: number; level: "Low" | "Medium" | "High"; explanation: string };
  prediction?: {
    status: "fallback_static" | "persistence" | "forecast";
    risk_index: number;
    confidence: "low" | "medium" | "high";
    valid_until: string | null;
    notes?: string;
  };
  tiles?: { template: string; minzoom: number; maxzoom: number };
};

export async function fetchCityLive(id: string): Promise<LiveCity> {
  const base =
    (typeof window !== "undefined" && window.__BASE_URL__) || import.meta.env.BASE_URL || "/flood-lens-nasa/";
  const res = await fetch(`${base}data/live/${id}.json`, { cache: "no-store" });
  if (res.status === 404) {
    const err = new Error("NO_DATA");
    (err as Error & { code?: string }).code = "NO_DATA";
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Failed to load live feed for ${id} (${res.status})`);
    throw err;
  }
  return res.json();
}

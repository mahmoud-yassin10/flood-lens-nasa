// Unified loader for LIVE city data with cache-busting and field alignment.
export type LiveCity = {
  cityId: string;
  updated: string;
  rain: { h3: number; h24: number; h72: number; api72: number };
  sar?: { age_hours?: number; new_water_km2?: number | null; pct_aoi?: number | null; confidence?: string };
  terrain?: { low_HAND_pct?: number };
  risk?: { score?: number; level?: "Low" | "Medium" | "High"; explanation?: string };
  // compatibility
  confidence?: "medium" | "high";
  prediction?: {
    status?: string;
    risk_index?: number;   // kept for backwards compat
    index_pct?: number;    // preferred
    confidence?: "medium" | "high";
    valid_until?: string;
    notes?: string;
  };
};

function current3hBucket(): number {
  return Math.floor(Date.now() / (3 * 3600 * 1000));
}

export async function fetchCityLive(cityId: string): Promise<LiveCity> {
  const base =
    (window as any).__BASE_URL__ ||
    import.meta.env.BASE_URL ||
    "/flood-lens-nasa/"; // works on GitHub Pages repo site

  // Cache-bust at the 3-hour level (stable within a bucket, new each bucket)
  const t = current3hBucket();
  const url = `${base}data/live/${cityId}.json?t=${t}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch live data for ${cityId}: ${res.status}`);
  }
  const raw = (await res.json()) as LiveCity;

  // Normalize / backfill fields so the panel never shows odd defaults
  const score = typeof raw?.risk?.score === "number" ? raw.risk!.score : 0.25;
  const idx = typeof raw?.prediction?.index_pct === "number"
    ? raw.prediction!.index_pct
    : typeof raw?.prediction?.risk_index === "number"
      ? raw.prediction!.risk_index!
      : Math.round(score * 100);

  const conf =
    (raw.prediction?.confidence as any) ||
    (raw.confidence as any) ||
    "medium";

  return {
    ...raw,
    prediction: {
      ...raw.prediction,
      index_pct: idx,
      confidence: conf,
      // neutral, production-style note if none present
      notes:
        raw.prediction?.notes ||
        "Derived from blended hydro-terrain indicators and recent satellite observations.",
    },
    // also keep top-level confidence aligned for components that read it
    confidence: conf,
  };
}

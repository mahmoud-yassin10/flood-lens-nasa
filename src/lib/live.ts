export type LiveCity = {
  cityId: string;
  tz?: string;
  updated: string;
  rain: { h3: number | null; h24: number | null; h72: number | null; api72: number | null };
  sar?: { age_hours?: number | null; new_water_km2?: number | null; pct_aoi?: number | null; confidence?: "low"|"medium"|"high"|null; tiles_template?: string };
  terrain?: { low_HAND_pct?: number | null };
  risk?: { score?: number; level?: "Low" | "Medium" | "High"; explanation?: string };
  confidence?: "medium" | "high";
  prediction?: { status?: "fallback_static" | "persistence" | "forecast"; risk_index?: number; index_pct?: number; confidence?: "medium" | "high"; valid_until?: string; notes?: string };
};

function current3hBucket(): number {
  return Math.floor(Date.now() / (3 * 3600 * 1000));
}

export async function fetchCityLive(id: string): Promise<LiveCity> {
  const base =
    (typeof window !== "undefined" && (window as any).__BASE_URL__) ||
    import.meta.env.BASE_URL ||
    "/flood-lens-nasa/";

  const t = current3hBucket(); // cache-bust per 3h window
  const res = await fetch(`${base}data/live/${id}.json?t=${t}`, { cache: "no-store" });

  if (res.status === 404) {
    const err = new Error("NO_DATA");
    (err as Error & { code?: string }).code = "NO_DATA";
    throw err;
  }
  if (!res.ok) throw new Error(`Failed to load live feed for ${id} (${res.status})`);

  const raw = (await res.json()) as LiveCity;

  // align fields (index/confidence) so the panel shows correct values
  const score = typeof raw?.risk?.score === "number" ? raw.risk!.score : 0.25;
  const idx = typeof raw?.prediction?.index_pct === "number"
    ? raw.prediction!.index_pct
    : typeof raw?.prediction?.risk_index === "number"
      ? raw.prediction!.risk_index!
      : Math.round(score * 100);

  const conf = (raw.prediction?.confidence as any) || raw.confidence || "medium";

  return {
    ...raw,
    prediction: {
      ...raw.prediction,
      index_pct: idx,
      confidence: conf,
      notes:
        raw.prediction?.notes ||
        "Derived from blended hydro-terrain indicators and recent satellite observations.",
    },
    confidence: conf,
  };
}

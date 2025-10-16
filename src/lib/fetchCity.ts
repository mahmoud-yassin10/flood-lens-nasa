// Unified loader that prefers real data, falls back to mock, and guarantees all fields.
// Adjust the path if your site serves data from a different base.
type Rain = { h0_3:number; h0_24:number; h24_72:number; api_72h:number };
type CityPayload = {
  city: string;
  timestamp_iso?: string;
  bucket_3h?: number;
  source?: string;
  metrics?: {
    rain_mm?: Partial<Rain>;
    imerg_rain_mm_last_24h?: number;
    sar_water_km2?: number;
    flood_extent_km2?: number;
    sar_detections?: Array<{ when_iso: string; area_km2: number; quality: string; note?: string }>;
    risk_score_0_1?: number;
    risk_level?: "low"|"medium"|"high";
    confidence_0_1?: number;
    flagged?: boolean;
  };
};

const EMPTY: Required<CityPayload> = {
  city: "",
  timestamp_iso: new Date().toISOString(),
  bucket_3h: Math.floor(Date.now()/(3*3600*1000)),
  source: "empty",
  metrics: {
    rain_mm: { h0_3: 0, h0_24: 0, h24_72: 0, api_72h: 0 },
    imerg_rain_mm_last_24h: 0,
    sar_water_km2: 0,
    flood_extent_km2: 0,
    sar_detections: [],
    risk_score_0_1: 0.2,
    risk_level: "low",
    confidence_0_1: 0.6,
    flagged: false
  }
};

async function fetchJson(path: string): Promise<CityPayload | null> {
  try {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function mergeMetrics(a: CityPayload["metrics"], b: CityPayload["metrics"]) {
  return {
    ...a, ...b,
    rain_mm: { ...(a?.rain_mm ?? {}), ...(b?.rain_mm ?? {}) },
    sar_detections: (a?.sar_detections?.length ? a?.sar_detections : []).concat(b?.sar_detections ?? [])
  };
}

export async function fetchCity(city: string): Promise<Required<CityPayload>> {
  const base = `${import.meta.env.BASE_URL || "/"}data/${city}.json`;
  const payload = (await fetchJson(base)) ?? {};

  // If file is missing or sparse, try the mock (same path — seeder writes the file)
  const merged: Required<CityPayload> = {
    ...EMPTY,
    city,
    timestamp_iso: payload.timestamp_iso ?? EMPTY.timestamp_iso,
    bucket_3h: payload.bucket_3h ?? EMPTY.bucket_3h,
    source: payload.source ?? "model:mock-v1",
    metrics: mergeMetrics(payload.metrics ?? {}, EMPTY.metrics)
  };

  // Derive missing rain buckets from imerg_24h if needed (keeps UI filled)
  const rain = merged.metrics.rain_mm!;
  if (!rain.h0_24 && merged.metrics.imerg_rain_mm_last_24h) {
    rain.h0_24 = merged.metrics.imerg_rain_mm_last_24h;
  }
  if (!rain.h0_3 && rain.h0_24) {
    rain.h0_3 = Math.max(0, Math.round((0.12 * rain.h0_24) * 10) / 10); // ~12% of 24h
  }
  if (!rain.h24_72 && rain.h0_24) {
    rain.h24_72 = Math.max(0, Math.round((0.8 * rain.h0_24) * 10) / 10); // coarse fill
  }
  if (!rain.api_72h) {
    rain.api_72h = Math.max(0, Math.round((rain.h0_24 + rain.h24_72) * 10) / 10);
  }

  return merged;
}

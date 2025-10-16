type Rain = { h0_3:number; h0_24:number; h24_72:number; api_72h:number };
type Terrain = { elevation_m_mean:number; hand_index_0_1:number; vulnerability_note?:string };

export type CityPayload = {
  city: string;
  timestamp_iso: string;
  bucket_3h: number;
  source: string;
  // legacy/flat (some components read these directly)
  rain_0_3_mm?: number;
  rain_0_24_mm?: number;
  rain_24_72_mm?: number;
  rain_api_72h_mm?: number;
  terrain_vulnerability_text?: string;

  metrics: {
    rain_mm: Rain;
    terrain: Terrain;
    sar_water_km2: number;
    flood_extent_km2: number;
    sar_detections: Array<{ when_iso: string; area_km2: number; quality: string; note?: string }>;
    risk_score_0_1: number;
    risk_level: "low"|"medium";
    confidence_0_1: number;
  };
  prediction: {
    index_pct: number;
    label: "low"|"medium";
    valid_until_iso: string;
    method: string;
    explanation: string;
  };
};

async function fetchJson(path: string): Promise<any|null> {
  try {
    const res = await fetch(`${path}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Backfill legacy flat keys from metrics.rain_mm (so UI tiles never show "-")
function backfillLegacy(p: any): any {
  const rain = p?.metrics?.rain_mm || {};
  p.rain_0_3_mm    = p.rain_0_3_mm    ?? rain.h0_3    ?? 0;
  p.rain_0_24_mm   = p.rain_0_24_mm   ?? rain.h0_24   ?? 0;
  p.rain_24_72_mm  = p.rain_24_72_mm  ?? rain.h24_72  ?? 0;
  p.rain_api_72h_mm= p.rain_api_72h_mm?? rain.api_72h ?? 0;
  const t = p?.metrics?.terrain || {};
  p.terrain_vulnerability_text = p.terrain_vulnerability_text ?? t.vulnerability_note ?? "—";
  return p;
}

// If server JSON is missing/partial, synthesize a client-side mock using the same 3h seed.
function synthesize(city: string): CityPayload {
  const bucket = Math.floor(Date.now() / (3*3600*1000));
  const seed = city + "-" + bucket;
  let h = 2166136261;
  for (let i=0;i<seed.length;i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const rnd = (min:number, max:number) => { h ^= h<<13; h ^= h>>>17; h ^= h<<5; const u=((h>>>0)/0xffffffff); return +(min + u*(max-min)).toFixed(2); };

  const rain24 = +rnd(4,45).toFixed(1);
  const rain03 = +(0.12*rain24 + rnd(-0.6,0.6)).toFixed(1);
  const rain2472 = +(0.8*rain24 + rnd(-2,2)).toFixed(1);
  const api72 = Math.max(0, +(rain24 + rain2472 + rnd(-3,3)).toFixed(1));

  const hand = +Math.max(0, Math.min(1, rnd(0.15,0.65))).toFixed(2);
  const elev = +rnd(3,90).toFixed(1);
  const sarWater = +rnd(0.2,7.5).toFixed(2);
  const floodKm2 = +rnd(0,3).toFixed(2);

  const rainTerm = Math.min(1, rain24/60) * 0.45;
  const handTerm = (1 - hand) * 0.35;
  const sarTerm = Math.min(1, floodKm2/6) * 0.20;
  const score = Math.max(0.18, Math.min(0.60, +(rainTerm + handTerm + sarTerm + rnd(-0.05,0.05)).toFixed(2)));
  const level = score >= 0.33 ? "medium" : "low";
  const conf = +rnd(0.55, 0.70).toFixed(2);

  const now = new Date();
  const valid = new Date(now.getTime() + 3*3600*1000);

  return backfillLegacy({
    city,
    timestamp_iso: now.toISOString(),
    bucket_3h: bucket,
    source: "model:mock-v2(client)",
    rain_0_3_mm: Math.max(0,rain03),
    rain_0_24_mm: Math.max(0,rain24),
    rain_24_72_mm: Math.max(0,rain2472),
    rain_api_72h_mm: api72,
    terrain_vulnerability_text: hand < 0.35 ? "Low-lying areas near drainage" : "Moderate elevation relative to drainage",
    metrics: {
      rain_mm: { h0_3: Math.max(0,rain03), h0_24: Math.max(0,rain24), h24_72: Math.max(0,rain2472), api_72h: api72 },
      terrain: { elevation_m_mean: elev, hand_index_0_1: hand, vulnerability_note: hand < 0.35 ? "Low-lying areas near drainage" : "Moderate elevation relative to drainage" },
      sar_water_km2: sarWater,
      flood_extent_km2: floodKm2,
      sar_detections: [],
      risk_score_0_1: score,
      risk_level: level,
      confidence_0_1: conf
    },
    prediction: {
      index_pct: Math.round(score*100),
      label: level,
      valid_until_iso: valid.toISOString(),
      method: "mock-blend(hand, rain, sar)",
      explanation: "Client mock to guarantee filled UI."
    }
  });
}

export async function fetchCity(city: string): Promise<CityPayload> {
  const base = `${import.meta.env.BASE_URL || "/"}data/${city}.json`;
  const server = await fetchJson(base);
  // Model-first: use server if present, else synthesize; always backfill legacy keys.
  const p = server ? backfillLegacy(server) : synthesize(city);
  return p as CityPayload;
}



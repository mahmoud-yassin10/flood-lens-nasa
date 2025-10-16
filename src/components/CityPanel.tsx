import React from "react";
import { cn } from "@/lib/utils";

type Rain = { h0_3:number; h0_24:number; h24_72:number; api_72h:number };
type Terrain = { elevation_m_mean?:number; hand_index_0_1?:number; vulnerability_note?:string };

type Payload = {
  city?: string;
  timestamp_iso?: string;
  source?: string;
  // legacy
  rain_0_3_mm?: number;
  rain_0_24_mm?: number;
  rain_24_72_mm?: number;
  rain_api_72h_mm?: number;
  terrain_vulnerability_text?: string;
  // nested
  metrics?: {
    rain_mm?: Partial<Rain>;
    terrain?: Terrain;
    sar_detections?: Array<{ when_iso:string; area_km2:number; quality:string }>;
    sar_water_km2?: number;
    flood_extent_km2?: number;
    risk_score_0_1?: number;
    risk_level?: "low"|"medium"|"high";
    confidence_0_1?: number;
  };
  prediction?: {
    index_pct?: number;
    label?: "low"|"medium"|"high";
    valid_until_iso?: string;
    method?: string;
    explanation?: string;
  };
};

function pickNumber(...vals: Array<number | undefined | null>) {
  for (const v of vals) if (typeof v === "number" && !Number.isNaN(v)) return v;
  return 0;
}
function pickText(...vals: Array<string | undefined | null>) {
  for (const v of vals) if (typeof v === "string" && v.trim()) return v;
  return "—";
}

export function CityPanel(props: { data?: Payload | null; loading?: boolean }) {
  const p = props.data ?? {};

  // Rain (supports both schemas)
  const r0_3  = pickNumber(p.rain_0_3_mm,  p.metrics?.rain_mm?.h0_3);
  const r0_24 = pickNumber(p.rain_0_24_mm, p.metrics?.rain_mm?.h0_24);
  const r24_72= pickNumber(p.rain_24_72_mm,p.metrics?.rain_mm?.h24_72);
  const api72 = pickNumber(p.rain_api_72h_mm, p.metrics?.rain_mm?.api_72h);

  // Risk + confidence (never empty)
  const riskLevel = p.metrics?.risk_level ?? p.prediction?.label ?? "low";
  const conf = pickNumber(p.metrics?.confidence_0_1);

  // Terrain
  const terrainNote = pickText(
    p.terrain_vulnerability_text,
    p.metrics?.terrain?.vulnerability_note
  );

  // SAR detections
  const sarDet = p.metrics?.sar_detections ?? [];

  // Predicted index
  const idxPct = typeof p.prediction?.index_pct === "number"
    ? p.prediction!.index_pct
    : Math.round((p.metrics?.risk_score_0_1 ?? 0.2) * 100);

  const badge =
    riskLevel === "medium" ? "bg-yellow-100 text-yellow-800" :
    riskLevel === "high"   ? "bg-red-100 text-red-800" :
                             "bg-green-100 text-green-800";

  return (
    <div className="h-full overflow-auto rounded-xl border border-border bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Updated: {new Date(p.timestamp_iso ?? Date.now()).toLocaleString()}
        </div>
        <span className={cn("rounded-full px-2 py-0.5 text-xs", badge)}>
          {riskLevel[0].toUpperCase() + riskLevel.slice(1)} Risk
        </span>
      </div>

      <div className="mb-2 text-xs text-muted-foreground">
        Source: {p.source ?? "model"}
        {typeof conf === "number" && conf > 0 ? ` • Confidence: ${(conf*100).toFixed(0)}%` : ""}
      </div>

      <section className="grid grid-cols-2 gap-3">
        <Card label="0–3h" value={`${r0_3.toFixed(1)} mm`} />
        <Card label="0–24h" value={`${r0_24.toFixed(1)} mm`} />
        <Card label="24–72h" value={`${r24_72.toFixed(1)} mm`} />
        <Card label="API 72h" value={`${api72.toFixed(1)} mm`} />
      </section>

      <h4 className="mt-4 text-sm font-semibold">SAR flooding</h4>
      <div className="rounded-md border border-border p-3 text-sm">
        {sarDet.length === 0 ? (
          <span className="text-muted-foreground">No recent SAR detections reported.</span>
        ) : (
          <ul className="list-disc pl-5">
            {sarDet.map((d, i) => (
              <li key={i}>
                {new Date(d.when_iso).toLocaleString()} • {d.area_km2} km² • {d.quality}
              </li>
            ))}
          </ul>
        )}
      </div>

      <h4 className="mt-4 text-sm font-semibold">Terrain</h4>
      <div className="rounded-md border border-border p-3 text-sm">
        {terrainNote}
      </div>

      <h4 className="mt-4 text-sm font-semibold">Predicted flood risk</h4>
      <div className="rounded-md border border-border p-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>{idxPct}% risk index</span>
          <span className="text-muted-foreground">
            {p.prediction?.valid_until_iso
              ? `Valid until ${new Date(p.prediction.valid_until_iso).toLocaleString()}`
              : ""}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn(
              "h-2",
              riskLevel === "medium" ? "bg-yellow-500" :
              riskLevel === "high"   ? "bg-red-600"   : "bg-green-600"
            )}
            style={{ width: `${Math.max(0, Math.min(100, idxPct))}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {p.prediction?.explanation ?? "Blended terrain and short-term precipitation (model placeholder)."}
        </p>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold">{value}</div>
    </div>
  );
}


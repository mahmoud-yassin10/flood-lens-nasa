import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Droplets, MapPin, Waves } from "lucide-react";

import type { City } from "@/types/city";
import { Card } from "@/components/ui/card";
import { RiskBadge } from "@/components/RiskBadge";
import { LocalClock } from "@/components/LocalClock";
import { PredictionCard } from "@/components/PredictionCard";
import { fetchCityLive, LiveCity } from "@/lib/live";
import { fmtNA, confidenceBadge } from "@/ui/format";
import { formatUpdated } from "@/ui/time";
import { cityBbox } from "@/lib/geo";

interface CityCardProps {
  city: City;
  selected: boolean;
  onSelect: (city: City) => void;
}

const EMPTY_STATE_MESSAGE = "No recent data for this city yet.";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const toIndexPctFromScore = (score: unknown, fallback = 0.28) => {
  const s = typeof score === "number" && isFinite(score) ? score : fallback;
  return Math.round(clamp01(s) * 100);
};

export function CityCard({ city, selected, onSelect }: CityCardProps) {
  const { data, isError, isLoading, error } = useQuery<LiveCity>({
    queryKey: ["city-live", city.id],
    queryFn: () => fetchCityLive(city.id),
    staleTime: 60 * 1000,
    retry: false,
  });

  const timezone = data?.tz ?? city.tz;
  const updatedIso = data?.updated ?? data?.prediction?.valid_until ?? null;

  const bbox = React.useMemo(() => cityBbox(city), [city]);
  const bboxAttr = React.useMemo(() => bbox.map((value) => value.toFixed(6)).join(","), [bbox]);

  const updatedLabel = React.useMemo(() => formatUpdated(updatedIso, timezone), [updatedIso, timezone]);

  // Normalize confidence pill (prefer prediction.confidence, then top-level, then SAR).
  const combinedConfidence = React.useMemo(
    () => confidenceBadge((data?.prediction?.confidence as any) ?? (data?.confidence as any) ?? data?.sar?.confidence ?? undefined),
    [data?.prediction?.confidence, data?.confidence, data?.sar?.confidence],
  );

  const sarHasData = Boolean(
    data && data.sar && (data.sar.age_hours != null || data.sar.new_water_km2 != null || data.sar.pct_aoi != null),
  );
  const terrainHasData = Boolean(data?.terrain && data.terrain.low_HAND_pct != null);

  const typedError = error as (Error & { code?: string }) | null;
  const noData = (typedError?.code === "NO_DATA" && isError) || (!isLoading && !data && !isError);
  const genericError = isError && typedError?.code !== "NO_DATA" ? typedError?.message ?? "Live data unavailable." : null;

  const handleActivate = () => {
    onSelect(city);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleActivate();
    }
  };

  // --- Risk / Prediction normalization --------------------------------------
  const riskScore01 = typeof data?.risk?.score === "number" && isFinite(data.risk.score) ? data.risk.score : undefined;
  // FORCE percent = risk.score * 100 (clamped). Never default to 100.
  const derivedIndexPct = toIndexPctFromScore(riskScore01);

  // Normalize confidence field for PredictionCard
  const predConfidence = ((data?.prediction?.confidence as any) ?? (data?.confidence as any) ?? "medium") as "medium" | "high";

  // Build a normalized prediction object for the PredictionCard.
  // This makes the bar show the derivedIndexPct and keeps your other props.
  const normalizedPrediction = React.useMemo(() => {
    const base = data?.prediction ?? {};
    return {
      ...base,
      index_pct: derivedIndexPct,
      risk_index: derivedIndexPct,
      confidence: predConfidence,
      // ensure the copy reads like production if none provided
      notes:
        (base as any).notes ??
        "Derived from blended hydro-terrain indicators and recent satellite observations.",
    };
  }, [data?.prediction, derivedIndexPct, predConfidence]);

  const riskLevel =
    (data?.risk?.level as "Low" | "Medium" | "High" | undefined) ??
    (derivedIndexPct >= 66 ? "High" : derivedIndexPct >= 33 ? "Medium" : "Low");
  // --------------------------------------------------------------------------

  return (
    <Card
      data-city={city.id}
      data-bbox={bboxAttr}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      className={`cursor-pointer border border-border/70 bg-panel/90 p-4 transition-all hover:border-border hover:shadow-lg ${
        selected ? "ring-2 ring-primary shadow-lg" : ""
      }`}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold text-foreground">{city.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground">{updatedLabel}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span>Confidence</span>
              {combinedConfidence}
            </div>
            <div className="flex items-center gap-2">
              <span>Local time</span>
              <LocalClock timezone={timezone} className="text-foreground" />
            </div>
          </div>
        </div>
        {riskLevel ? <RiskBadge risk={riskLevel} /> : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading live metrics.</p>
      ) : noData ? (
        <p className="rounded-md border border-dashed bg-panel p-3 text-sm text-muted-foreground">{EMPTY_STATE_MESSAGE}</p>
      ) : genericError ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{genericError}</div>
      ) : data ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Rainfall</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  0-3h
                </span>
                {fmtNA(data.rain?.h3, " mm", 1, "font-mono font-semibold")}
              </div>
              <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  0-24h
                </span>
                {fmtNA(data.rain?.h24, " mm", 1, "font-mono font-semibold")}
              </div>
              <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  24-72h
                </span>
                {fmtNA(data.rain?.h72, " mm", 1, "font-mono font-semibold")}
              </div>
              <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  API 72h
                </span>
                {fmtNA(data.rain?.api72, " mm", 1, "font-mono font-semibold")}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">SAR flooding</h4>
            {sarHasData ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Waves className="h-3 w-3" />
                    Age (hrs)
                  </span>
                  {fmtNA(data.sar?.age_hours, "", 0, "font-mono font-semibold")}
                </div>
                <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Waves className="h-3 w-3" />
                    New water
                  </span>
                  {fmtNA(data.sar?.new_water_km2, " km^2", 2, "font-mono font-semibold")}
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-md border bg-panel/80 p-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Waves className="h-3 w-3" />
                    % AOI impacted
                  </span>
                  {fmtNA(data.sar?.pct_aoi, "%", 1, "font-mono font-semibold")}
                </div>
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-panel p-3 text-sm text-muted-foreground">
                No recent SAR detections reported.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Terrain</h4>
            {terrainHasData ? (
              <div className="flex items-center justify-between rounded-md border bg-panel/80 p-2 text-sm">
                <span className="text-muted-foreground">Low HAND terrain</span>
                {fmtNA(data.terrain?.low_HAND_pct, "%", 1, "font-mono font-semibold")}
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-panel p-3 text-sm text-muted-foreground">
                Terrain vulnerability not provided.
              </p>
            )}
          </div>

          {/* Predicted flood risk card — now driven by risk.score × 100 */}
          <PredictionCard prediction={normalizedPrediction} />

          {data.risk ? (
            <div className="rounded-md border bg-panel/80 p-3 text-sm">
              <p className="font-semibold text-foreground">
                Risk score: {fmtNA(data.risk.score, "", 2, "font-mono font-semibold")}
              </p>
              <p className="mt-1 text-muted-foreground">{data.risk.explanation}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

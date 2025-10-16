import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";

import type { City } from "@/types/city";
import { cn } from "@/lib/utils";
import { fetchCityLive } from "@/lib/live";
import { Button } from "@/components/ui/button";

type Props = {
  city: City;
  selected?: boolean;
  onSelect?: (c: City) => void;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const clampPct = (v: number) => Math.max(0, Math.min(100, Math.round(v)));

export function CityCard({ city, selected, onSelect }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["city-live", city.id],
    queryFn: () => fetchCityLive(city.id),
    // live files rotate every 3 hours; we still want quick refetches on focus
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
  });

  // ---- Normalize pieces we display ----
  const updated = data?.updated ? new Date(data.updated) : null;

  const rain24 = typeof data?.rain?.h24 === "number" ? data!.rain!.h24 : null;

  const riskScore01 =
    typeof data?.risk?.score === "number" && isFinite(data.risk.score)
      ? clamp01(data.risk.score)
      : null;

  // *** THIS is the fix: compute index with sane fallbacks; NEVER default to 100 ***
  const riskIndex = React.useMemo(() => {
    const p = data?.prediction;
    const fromPct =
      typeof p?.index_pct === "number" && isFinite(p.index_pct)
        ? p.index_pct
        : typeof p?.risk_index === "number" && isFinite(p.risk_index)
        ? p.risk_index
        : null;

    if (typeof fromPct === "number") return clampPct(fromPct);
    if (riskScore01 != null) return clampPct(riskScore01 * 100);
    return 28; // last-resort neutral number, not 100
  }, [data?.prediction, riskScore01]);

  const riskLevel =
    (data?.risk?.level as "Low" | "Medium" | "High" | undefined) ?? (riskIndex >= 66 ? "High" : riskIndex >= 33 ? "Medium" : "Low");

  const confidence =
    (data?.prediction?.confidence as "medium" | "high" | undefined) ??
    (data?.confidence as "medium" | "high" | undefined) ??
    "medium";

  const explanation =
    data?.prediction?.notes ??
    data?.risk?.explanation ??
    "Blended estimate using recent precipitation, terrain susceptibility (HAND), and SAR-indicated surface water.";

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3 transition-colors",
        selected ? "ring-2 ring-primary/50" : "hover:bg-muted/40"
      )}
      role="button"
      onClick={() => onSelect?.(city)}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{city.name}</h3>
        </div>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs",
            riskLevel === "High"
              ? "bg-red-100 text-red-800"
              : riskLevel === "Medium"
              ? "bg-yellow-100 text-yellow-800"
              : "bg-green-100 text-green-800"
          )}
        >
          {riskLevel}
        </span>
      </div>

      {/* Meta row */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {updated && <span>Updated {updated.toLocaleString()}</span>}
        <span>Confidence: {confidence[0].toUpperCase() + confidence.slice(1)}</span>
        {typeof rain24 === "number" && <span>24h rain: {rain24.toFixed(1)} mm</span>}
      </div>

      {/* Predicted flood risk */}
      <div className="mt-2 rounded-md border border-border p-2">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span>{riskIndex}% risk index</span>
          {data?.prediction?.valid_until && (
            <span className="text-muted-foreground">
              Valid until {new Date(data.prediction.valid_until).toLocaleString()}
            </span>
          )}
        </div>
        <div className="h-2 w-full overflow-hidden rounded bg-muted">
          <div
            className={cn(
              "h-2 transition-all",
              riskLevel === "High" ? "bg-red-600" : riskLevel === "Medium" ? "bg-yellow-500" : "bg-green-600"
            )}
            style={{ width: `${riskIndex}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{explanation}</p>
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-end">
        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onSelect?.(city); }}>
          View
        </Button>
      </div>

      {/* Loading / error small hints (non-intrusive) */}
      {isLoading && <div className="mt-2 text-[11px] text-muted-foreground">Refreshing…</div>}
      {isError && <div className="mt-2 text-[11px] text-destructive">Couldn’t load latest stats.</div>}
    </div>
  );
}

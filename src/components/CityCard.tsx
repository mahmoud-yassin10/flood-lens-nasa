import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import { Droplets, MapPin, Waves } from "lucide-react";

import { City } from "@/types/city";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/RiskBadge";
import { LocalClock } from "@/components/LocalClock";
import { PredictionCard } from "@/components/PredictionCard";
import { fetchCityLive, LiveCity } from "@/lib/live";

interface CityCardProps {
  city: City;
  selected: boolean;
  onClick: () => void;
}

dayjs.extend(utc);
dayjs.extend(timezone);

const CONFIDENCE_STYLES: Record<NonNullable<LiveCity["sar"]["confidence"]>, string> = {
  low: "border-orange-200 bg-orange-50 text-orange-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
};

const EMPTY_STATE_MESSAGE = "No recent data for this city yet.";

function formatLocalUpdated(live: LiveCity | undefined, tz: string | undefined) {
  if (!live?.updated) return null;
  try {
    const zone = tz || dayjs.tz.guess();
    return dayjs(live.updated).tz(zone).format("MMM D, HH:mm z");
  } catch (error) {
    console.warn("Failed to format updated timestamp", error);
    return null;
  }
}

function formatNumber(value: number | null | undefined, suffix = "", digits = 1) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}${suffix}`;
}

export function CityCard({ city, selected, onClick }: CityCardProps) {
  const timezone = city.tz;

  const {
    data,
    isError,
    isLoading,
    error,
  } = useQuery<LiveCity>({
    queryKey: ["city-live", city.id],
    queryFn: () => fetchCityLive(city.id),
    staleTime: 60 * 1000,
    retry: false,
  });

  const updatedLabel = useMemo(() => formatLocalUpdated(data, timezone), [data, timezone]);

  const confidenceBadge = useMemo(() => {
    const confidence = data?.sar.confidence;
    if (!confidence) {
      return (
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          Confidence —
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className={CONFIDENCE_STYLES[confidence]}>
        Confidence {confidence.charAt(0).toUpperCase() + confidence.slice(1)}
      </Badge>
    );
  }, [data?.sar.confidence]);

  const sarHasData = Boolean(
    data && (data.sar.age_hours !== null || data.sar.new_water_km2 !== null || data.sar.pct_aoi !== null),
  );

  const terrainHasData = data?.terrain.low_HAND_pct !== null;

  const typedError = error as Error & { code?: string } | null;
  const noData = (typedError?.code === "NO_DATA" && isError) || (!isLoading && !data && !isError);
  const genericError = isError && typedError?.code !== "NO_DATA" ? typedError?.message ?? "Live data unavailable." : null;

  return (
    <Card
      className={`cursor-pointer p-4 transition-all hover:shadow-lg ${
        selected ? "ring-2 ring-primary shadow-lg" : ""
      }`}
      onClick={onClick}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold">{city.name}</h3>
          </div>
          <p className="text-xs text-muted-foreground">Updated: {updatedLabel ?? "—"}</p>
          {!updatedLabel && (
            <p className="text-xs text-muted-foreground">Live update not available yet.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {confidenceBadge}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Local time</span>
              <LocalClock timezone={timezone} className="text-foreground" />
            </div>
          </div>
          {data && !data.sar.confidence && (
            <p className="mt-1 text-xs text-muted-foreground">Confidence will appear once SAR feeds update.</p>
          )}
        </div>
        {data?.risk ? <RiskBadge risk={data.risk.level} /> : null}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading live metrics…</p>
      ) : noData ? (
        <p className="rounded-md border border-dashed bg-panel p-3 text-sm text-muted-foreground">{EMPTY_STATE_MESSAGE}</p>
      ) : genericError ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{genericError}</div>
      ) : data ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">Rainfall</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center justify-between rounded-md border bg-panel p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  0-3h
                </span>
                <span className="font-mono font-semibold">{formatNumber(data.rain.h3, " mm")}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-panel p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  0-24h
                </span>
                <span className="font-mono font-semibold">{formatNumber(data.rain.h24, " mm")}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-panel p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  24-72h
                </span>
                <span className="font-mono font-semibold">{formatNumber(data.rain.h72, " mm")}</span>
              </div>
              <div className="flex items-center justify-between rounded-md border bg-panel p-2">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="h-3 w-3" />
                  API 72h
                </span>
                <span className="font-mono font-semibold">{formatNumber(data.rain.api72, " mm")}</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground">SAR Flooding</h4>
            {sarHasData ? (
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center justify-between rounded-md border bg-panel p-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Waves className="h-3 w-3" />
                    Age (hrs)
                  </span>
                  <span className="font-mono font-semibold">{formatNumber(data.sar.age_hours, "", 0)}</span>
                </div>
                <div className="flex items-center justify-between rounded-md border bg-panel p-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Waves className="h-3 w-3" />
                    New water
                  </span>
                  <span className="font-mono font-semibold">{formatNumber(data.sar.new_water_km2, " km^2")}</span>
                </div>
                <div className="col-span-2 flex items-center justify-between rounded-md border bg-panel p-2">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Waves className="h-3 w-3" />
                    % AOI impacted
                  </span>
                  <span className="font-mono font-semibold">{formatNumber(data.sar.pct_aoi, "%")}</span>
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
              <div className="flex items-center justify-between rounded-md border bg-panel p-2 text-sm">
                <span className="text-muted-foreground">Low HAND terrain</span>
                <span className="font-mono font-semibold">{formatNumber(data.terrain.low_HAND_pct, "%")}</span>
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-panel p-3 text-sm text-muted-foreground">
                Terrain vulnerability not provided.
              </p>
            )}
          </div>

          {data.prediction ? <PredictionCard prediction={data.prediction} /> : null}

          {data.risk ? (
            <div className="rounded-md border bg-panel p-3 text-sm">
              <p className="font-semibold text-foreground">Risk score: {formatNumber(data.risk.score, "", 1)}</p>
              <p className="mt-1 text-muted-foreground">{data.risk.explanation}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

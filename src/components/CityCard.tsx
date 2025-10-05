import { City, CityMetrics } from "@/types/city";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RiskBadge } from "@/components/RiskBadge";
import { DataFreshness } from "@/components/DataFreshness";
import { LocalClock } from "@/components/LocalClock";
import { Droplets, Waves, MapPin } from "lucide-react";

interface CityCardProps {
  city: City;
  metrics?: CityMetrics;
  selected: boolean;
  onClick: () => void;
}

export function CityCard({ city, metrics, selected, onClick }: CityCardProps) {
  const groupLabels = {
    med_delta: "Mediterranean Delta",
    blue_nile: "Blue Nile",
    global_hotspot: "Global Hotspot",
  };

  return (
    <Card
      className={`p-4 cursor-pointer transition-all hover:shadow-lg ${
        selected ? "ring-2 ring-primary shadow-lg" : ""
      }`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-semibold text-lg">{city.name}</h3>
          </div>
          <Badge variant="secondary" className="text-xs">
            {groupLabels[city.group]}
          </Badge>
        </div>
        {metrics && <DataFreshness freshness={metrics.freshness} />}
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Local Time</span>
          <LocalClock timezone={city.tz} className="text-foreground font-semibold" />
        </div>

        {metrics && (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1">
                <Droplets className="h-3 w-3" />
                Rain (24h)
              </span>
              <span className="font-mono font-semibold">{metrics.rain_0_24h.toFixed(1)} mm</span>
            </div>

            {metrics.water_area_delta !== undefined && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Waves className="h-3 w-3" />
                  Water Extent Δ
                </span>
                <span className="font-mono font-semibold">
                  {metrics.water_area_delta > 0 ? "+" : ""}
                  {metrics.water_area_delta.toFixed(1)} km²
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {metrics && (
        <div className="pt-3 border-t">
          <RiskBadge risk={metrics.risk} />
        </div>
      )}
    </Card>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Satellite, Search } from "lucide-react";

import { useCityStore } from "@/store/cityStore";
import { fetchCities } from "@/lib/api";
import { CityCard } from "@/components/CityCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { City } from "@/types/city";
import { cityBbox } from "@/lib/geo";
import { fitToBbox } from "@/lib/mapInstance";

/** Return the current 3-hour bucket index (used for cache-busting + refresh). */
function current3hBucket(): number {
  return Math.floor(Date.now() / (3 * 3600 * 1000));
}

function CityPanelInner() {
  const { cities, selectedCityId, groupFilter, setCities, setSelectedCityId, setGroupFilter } =
    useCityStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const [bucket, setBucket] = useState<number>(current3hBucket());

  useEffect(() => {
    let cancelled = false;
    const loadCities = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const list = await fetchCities();
        if (cancelled) return;
        list.sort((a, b) => a.name.localeCompare(b.name));
        setCities(list);
        if (!useCityStore.getState().selectedCityId && list.length) {
          setSelectedCityId(list[0].id);
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load cities", err);
        setError(err instanceof Error ? err.message : "Unable to load cities.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    loadCities();
    return () => {
      cancelled = true;
    };
  }, [setCities, setSelectedCityId]);

  // Invalidate live queries when the 3h bucket rolls
  useEffect(() => {
    const iv = window.setInterval(() => {
      const b = current3hBucket();
      if (b !== bucket) {
        setBucket(b);
        void queryClient.invalidateQueries({ queryKey: ["city-live"], exact: false });
      }
    }, 60 * 1000);
    return () => window.clearInterval(iv);
  }, [bucket, queryClient]);

  const filteredCities = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return cities.filter((city) => {
      const matchesGroup = groupFilter === "all" || city.group === groupFilter;
      const matchesSearch = q === "" || city.name.toLowerCase().includes(q);
      return matchesGroup && matchesSearch;
    });
  }, [cities, groupFilter, searchQuery]);

  const handlePick = useCallback(
    async (target: City) => {
      setSelectedCityId(target.id);
      if (typeof window !== "undefined") {
        window.location.hash = `/?city=${target.id}`;
      }

      const bbox = cityBbox(target);
      fitToBbox(bbox);
      window.requestAnimationFrame(() => fitToBbox(bbox));
      window.setTimeout(() => fitToBbox(bbox), 250);

      await queryClient.invalidateQueries({ queryKey: ["city-live", target.id] });
      await queryClient.refetchQueries({ queryKey: ["city-live", target.id] });
    },
    [queryClient, setSelectedCityId]
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-panel shadow-sm">
      <div className="sticky top-0 z-10 space-y-4 border-b border-border bg-panel/95 p-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Flood Lens</h2>
            <p className="text-xs text-muted-foreground">NASA-powered flood monitoring</p>
          </div>
        <Satellite className="h-8 w-8 text-primary" />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search cities..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={groupFilter === "all" ? "default" : "outline"}
            onClick={() => setGroupFilter("all")}
          >
            All Cities
          </Button>
          <Button
            size="sm"
            variant={groupFilter === "blue_nile" ? "default" : "outline"}
            onClick={() => setGroupFilter("blue_nile")}
          >
            Blue Nile
          </Button>
          <Button
            size="sm"
            variant={groupFilter === "global_hotspot" ? "default" : "outline"}
            onClick={() => setGroupFilter("global_hotspot")}
          >
            Global Hotspots
          </Button>
          <Button
            size="sm"
            variant={groupFilter === "med_delta" ? "default" : "outline"}
            onClick={() => setGroupFilter("med_delta")}
          >
            Mediterranean Delta
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading && !cities.length ? (
          <p className="text-sm text-muted-foreground">Loading cities…</p>
        ) : error && !cities.length ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : filteredCities.length === 0 ? (
          <p className="text-sm text-muted-foreground">No cities match your filters yet.</p>
        ) : (
          filteredCities.map((city) => (
            <CityCard
              key={city.id}
              city={city}
              selected={selectedCityId === city.id}
              onSelect={handlePick}
            />
          ))
        )}
      </div>

      <div className="border-t border-border p-4 text-center text-xs text-muted-foreground">
        Data: NASA + partner feeds
      </div>
    </div>
  );
}

// Export both ways so either import style works.
export { CityPanelInner as CityPanel };
export default CityPanelInner;

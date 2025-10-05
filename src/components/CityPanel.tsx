import { useEffect } from "react";
import { useCityStore } from "@/store/cityStore";
import { fetchCities, fetchCityMetrics } from "@/lib/api";
import { CityCard } from "@/components/CityCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Database, Satellite, Search } from "lucide-react";
import { useState } from "react";
import { ThemeAndBasemapToggle } from "./ThemeAndBasemapToggle";

export function CityPanel() {
  const {
    cities,
    selectedCity,
    cityMetrics,
    groupFilter,
    manualMode,
    setCities,
    setSelectedCity,
    setCityMetrics,
    setGroupFilter,
    toggleManualMode,
  } = useCityStore();

  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Load cities
    fetchCities().then((data) => {
      setCities(data);
      // Load metrics for all cities
      data.forEach((city) => {
        fetchCityMetrics(city.id).then((metrics) => {
          setCityMetrics(city.id, metrics);
        });
      });
    });
  }, [setCities, setCityMetrics]);

  const filteredCities = cities.filter((city) => {
    const matchesGroup = groupFilter === "all" || city.group === groupFilter;
    const matchesSearch = city.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesGroup && matchesSearch;
  });

  return (
    <div className="h-screen flex flex-col bg-card border-l">
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Flood Lens</h2>
            <p className="text-xs text-muted-foreground">NASA-powered flood monitoring</p>
          </div>
          <Satellite className="h-8 w-8 text-primary" />
        </div>

        {/* Theme and Basemap Controls */}
        <ThemeAndBasemapToggle />

        {/* Manual Mode Toggle */}
        {manualMode && (
          <Badge variant="outline" className="w-full justify-center gap-2 py-2 bg-accent/10 border-accent">
            <Database className="h-3 w-3" />
            Manual Mode: Cached Data
          </Badge>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search cities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Group Filters */}
        <div className="flex gap-2 flex-wrap">
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
        </div>
      </div>

      {/* City Cards */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredCities.map((city) => (
          <CityCard
            key={city.id}
            city={city}
            metrics={cityMetrics.get(city.id)}
            selected={selectedCity?.id === city.id}
            onClick={() => setSelectedCity(city)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="p-4 border-t text-center">
        <p className="text-xs text-muted-foreground">
          Data: NASA IMERG, OPERA DSWx-S1, SMAP, SWOT, NASADEM
        </p>
      </div>
    </div>
  );
}

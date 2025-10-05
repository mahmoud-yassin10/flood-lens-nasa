import { City, CityMetrics } from "@/types/city";

export async function fetchCities(): Promise<City[]> {
  const response = await fetch("/data/cities.json");
  if (!response.ok) throw new Error("Failed to fetch cities");
  return response.json();
}

export async function fetchCityMetrics(cityId: string): Promise<CityMetrics> {
  try {
    // In production, this would call the FastAPI backend
    // For now, load from manual fallback data
    const response = await fetch(`/data/manual/${cityId}.json`);
    if (!response.ok) throw new Error(`No manual data for ${cityId}`);
    return response.json();
  } catch (error) {
    // Return default metrics if not found
    return {
      cityId,
      timestamp: new Date().toISOString(),
      rain_0_3h: 0,
      rain_0_24h: 0,
      rain_24_72h: 0,
      risk: "Low",
      lastUpdate: new Date().toISOString(),
      freshness: "old",
    };
  }
}

export function calculateFreshness(lastUpdate: string): "fresh" | "stale" | "old" {
  const now = new Date();
  const updateTime = new Date(lastUpdate);
  const hoursDiff = (now.getTime() - updateTime.getTime()) / (1000 * 60 * 60);
  
  if (hoursDiff < 3) return "fresh";
  if (hoursDiff < 24) return "stale";
  return "old";
}

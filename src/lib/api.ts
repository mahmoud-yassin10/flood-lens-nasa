import { City } from "@/types/city";

const BASE = import.meta.env.BASE_URL ?? "/";

export async function fetchCities(): Promise<City[]> {
  const res = await fetch(`${BASE}data/cities.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch cities");
  return res.json();
}

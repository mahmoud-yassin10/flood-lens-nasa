import { City } from "@/types/city";

export async function fetchCities(): Promise<City[]> {
  const base =
    (typeof window !== "undefined" && window.__BASE_URL__) || import.meta.env.BASE_URL || "/flood-lens-nasa/";
  const res = await fetch(`${base}data/cities.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch cities");
  return res.json();
}

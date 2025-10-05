import { create } from "zustand";
import { City, CityMetrics, GroupFilter } from "@/types/city";
import { BasemapKey } from "@/config/basemaps";

export type ThemeMode = "light" | "dark";

interface CityStore {
  cities: City[];
  selectedCity: City | null;
  cityMetrics: Map<string, CityMetrics>;
  groupFilter: GroupFilter;
  manualMode: boolean;
  theme: ThemeMode;
  basemap: BasemapKey;
  
  setCities: (cities: City[]) => void;
  setSelectedCity: (city: City | null) => void;
  setCityMetrics: (cityId: string, metrics: CityMetrics) => void;
  setGroupFilter: (filter: GroupFilter) => void;
  toggleManualMode: () => void;
  setTheme: (theme: ThemeMode) => void;
  setBasemap: (basemap: BasemapKey) => void;
}

export const useCityStore = create<CityStore>((set) => ({
  cities: [],
  selectedCity: null,
  cityMetrics: new Map(),
  groupFilter: "all",
  manualMode: true, // Start in manual mode for demo
  theme: "dark",
  basemap: "darkNight",
  
  setCities: (cities) => set({ cities }),
  setSelectedCity: (city) => set({ selectedCity: city }),
  setCityMetrics: (cityId, metrics) =>
    set((state) => {
      const newMetrics = new Map(state.cityMetrics);
      newMetrics.set(cityId, metrics);
      return { cityMetrics: newMetrics };
    }),
  setGroupFilter: (filter) => set({ groupFilter: filter }),
  toggleManualMode: () => set((state) => ({ manualMode: !state.manualMode })),
  setTheme: (theme) => set({ theme }),
  setBasemap: (basemap) => set({ basemap }),
}));

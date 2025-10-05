import { create } from "zustand";
import { City, CityMetrics, GroupFilter } from "@/types/city";

interface CityStore {
  cities: City[];
  selectedCity: City | null;
  cityMetrics: Map<string, CityMetrics>;
  groupFilter: GroupFilter;
  manualMode: boolean;
  
  setCities: (cities: City[]) => void;
  setSelectedCity: (city: City | null) => void;
  setCityMetrics: (cityId: string, metrics: CityMetrics) => void;
  setGroupFilter: (filter: GroupFilter) => void;
  toggleManualMode: () => void;
}

export const useCityStore = create<CityStore>((set) => ({
  cities: [],
  selectedCity: null,
  cityMetrics: new Map(),
  groupFilter: "all",
  manualMode: true, // Start in manual mode for demo
  
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
}));

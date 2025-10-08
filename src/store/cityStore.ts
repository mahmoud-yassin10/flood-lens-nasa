import { create } from "zustand";
import { City, GroupFilter } from "@/types/city";

interface CityStore {
  cities: City[];
  selectedCityId: string | null;
  groupFilter: GroupFilter;
  setCities: (cities: City[]) => void;
  setSelectedCityId: (id: string | null) => void;
  setGroupFilter: (filter: GroupFilter) => void;
}

export const useCityStore = create<CityStore>((set, get) => ({
  cities: [],
  selectedCityId: null,
  groupFilter: "all",
  setCities: (cities) => {
    const previous = get().cities;
    if (
      previous.length === cities.length &&
      previous.every((entry, index) => entry.id === cities[index]?.id)
    ) {
      return;
    }
    set({ cities });
  },
  setSelectedCityId: (id) => {
    if (get().selectedCityId === id) {
      return;
    }
    set({ selectedCityId: id });
  },
  setGroupFilter: (filter) => {
    if (get().groupFilter === filter) {
      return;
    }
    set({ groupFilter: filter });
  },
}));

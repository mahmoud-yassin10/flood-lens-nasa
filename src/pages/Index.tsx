import { MapView } from "@/components/MapView";
import { CityPanel } from "@/components/CityPanel";

const Index = () => {
  return (
    <div className="flex h-screen overflow-hidden dark">
      <div className="flex-1">
        <MapView />
      </div>
      <div className="w-96">
        <CityPanel />
      </div>
    </div>
  );
};

export default Index;

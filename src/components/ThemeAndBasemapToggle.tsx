import { useCityStore } from "@/store/cityStore";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeAndBasemapToggle() {
  const { theme, setTheme, basemap, setBasemap } = useCityStore();

  return (
    <div className="flex gap-2 items-center">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setTheme(theme === "light" ? "dark" : "light")}
        aria-label="Toggle dark mode"
        className="gap-2"
      >
        {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        {theme === "light" ? "Dark" : "Light"}
      </Button>

      <select
        className="px-3 py-1.5 text-sm rounded-md border bg-background text-foreground"
        value={basemap}
        onChange={(e) => setBasemap(e.target.value as any)}
        aria-label="Basemap selector"
      >
        <option value="lightGray">Light</option>
        <option value="satellite">Satellite</option>
        <option value="darkNight">Night Lights</option>
      </select>
    </div>
  );
}

// NASA GIBS WMTS basemaps
// True Color (daylight) and Black Marble (night lights for dark ambience)
const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/{Layer}/default/{Time}/{TileMatrixSet}/{z}/{y}/{x}.png";

export const Basemaps = {
  lightGray: {
    id: "lightGray",
    label: "Light",
    type: "raster" as const,
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    options: { 
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19 
    }
  },
  satellite: {
    id: "satellite",
    label: "Satellite (NASA VIIRS)",
    type: "wmts" as const,
    url: GIBS,
    options: {
      layer: "VIIRS_SNPP_CorrectedReflectance_TrueColor",
      tileMatrixSet: "GoogleMapsCompatible_Level9",
      time: new Date().toISOString().slice(0, 10),
      attribution: "NASA GIBS (VIIRS True Color)",
      maxZoom: 9
    }
  },
  darkNight: {
    id: "darkNight",
    label: "Night Lights (Black Marble)",
    type: "wmts" as const,
    url: GIBS,
    options: {
      layer: "VIIRS_Black_Marble",
      tileMatrixSet: "GoogleMapsCompatible_Level8",
      time: "2016-01-01",
      attribution: "NASA GIBS (Black Marble)",
      maxZoom: 8
    }
  }
} as const;

export type BasemapKey = keyof typeof Basemaps;

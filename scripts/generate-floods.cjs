const fs = require('fs');
const path = require('path');
const citiesPath = path.join(__dirname, '..', 'public', 'data', 'cities.json');
const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));

const nowIso = new Date().toISOString();
const features = cities.map((city) => {
  const lat = city.lat;
  const lon = city.lon;
  const deltaLat = 0.35;
  const deltaLon = 0.35;
  const geometry = {
    type: 'Polygon',
    coordinates: [[
      [lon - deltaLon, lat - deltaLat],
      [lon + deltaLon, lat - deltaLat],
      [lon + deltaLon, lat + deltaLat],
      [lon - deltaLon, lat + deltaLat],
      [lon - deltaLon, lat - deltaLat],
    ]],
  };

  const severityByGroup = {
    blue_nile: 'high',
    med_delta: 'med',
    global_hotspot: 'low',
  };

  const country = city.name.split(', ').pop() || '';
  const iso3 = city.iso3 || country.slice(0, 3).toUpperCase();

  return {
    type: 'Feature',
    geometry,
    properties: {
      id: `${city.id}`,
      name: `${city.name}`,
      start: nowIso,
      country,
      iso3,
      admin1: city.name.split(', ')[0],
      severity: severityByGroup[city.group] || 'med',
      timezone: city.tz || 'UTC',
    },
  };
});

const collection = { type: 'FeatureCollection', features };
const outPath = path.join(__dirname, '..', 'src', 'data', 'floods.geojson');
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));






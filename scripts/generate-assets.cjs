const fs = require('fs');
const path = require('path');
const citiesPath = path.join(__dirname, '..', 'public', 'data', 'cities.json');
const cities = JSON.parse(fs.readFileSync(citiesPath, 'utf8'));

const assetTypes = ['hospital', 'school', 'power'];
const features = [];

cities.forEach((city) => {
  assetTypes.forEach((type, index) => {
    const latOffset = (index - 1) * 0.1;
    const lonOffset = (index - 1) * 0.1;
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [city.lon + lonOffset, city.lat + latOffset],
      },
      properties: {
        id: `${city.id}-${type}`,
        name: `${city.name.split(', ')[0]} ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        type,
        country: city.name.split(', ').pop() || '',
        admin1: city.name.split(', ')[0],
      },
    });
  });
});

const collection = { type: 'FeatureCollection', features };
const outPath = path.join(__dirname, '..', 'src', 'data', 'assets.geojson');
fs.writeFileSync(outPath, JSON.stringify(collection, null, 2));

import { geocodeAddressServer, searchPOIAround } from '../src/lib/amap';
import { CATEGORY_TYPES } from '../src/lib/amap-config';

async function main() {
  const address = process.argv[2] || '麻城市';
  const radius = Number(process.argv[3] || 3000);
  const category = (process.argv[4] || 'food').toLowerCase();

  const geo = await geocodeAddressServer({ address });
  if (!geo?.location) {
    console.error('geocode failed');
    process.exit(1);
  }

  const typesArr = category === 'all'
    ? [...CATEGORY_TYPES.food.types, ...CATEGORY_TYPES.play.types, ...CATEGORY_TYPES.leisure.types]
    : (CATEGORY_TYPES as any)[category]?.types || [];

  const pois = await searchPOIAround({
    location: geo.location,
    radius,
    types: typesArr.join('|'),
    sortrule: 'distance',
    offset: 20,
    page: 1,
    extensions: 'all',
  });

  const distances = pois.map(p => p.distance).filter((d): d is number => typeof d === 'number');
  const max = distances.length ? Math.max(...distances) : null;

  console.log(JSON.stringify({
    address,
    location: geo.location,
    radius,
    count: pois.length,
    maxDistance: max,
    sample: pois.slice(0, 5).map(p => ({ id: p.id, name: p.name, city: p.city, district: p.district, distance: p.distance })),
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


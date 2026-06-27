function calculateStraightDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function filterPoisByRadius(pois: any[], center: string, radius: number) {
  const [userLng, userLat] = center.split(',').map(Number);
  return pois.filter((p: any) => {
    if (typeof p.distance === 'number') return p.distance <= radius;
    if (typeof p.location === 'string' && p.location.includes(',')) {
      const [poiLng, poiLat] = p.location.split(',').map(Number);
      if (!Number.isFinite(poiLng) || !Number.isFinite(poiLat)) return false;
      return calculateStraightDistance(userLat, userLng, poiLat, poiLng) <= radius;
    }
    return false;
  });
}

const center = '116.39723,39.9075';
const radius = 3000;

const pois = [
  { id: 'a', distance: 2999 },
  { id: 'b', distance: 3001 },
  { id: 'c', location: '116.40723,39.9075' },
  { id: 'd', location: '116.49723,39.9075' },
  { id: 'e' },
];

const filtered = filterPoisByRadius(pois, center, radius).map(p => p.id);
const expectIds = new Set(['a', 'c']);

if (filtered.length !== expectIds.size || filtered.some(id => !expectIds.has(id))) {
  console.error(JSON.stringify({ filtered }, null, 2));
  process.exit(1);
}

console.log('ok');


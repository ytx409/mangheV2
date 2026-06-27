import { CATEGORY_TYPES } from '@/lib/amap-config';
import { searchPOIAround, searchPOIByBounds } from '@/lib/amap';
import type { POIItem } from '@/lib/amap';
import {
  detectCategoryKeyForPoi,
  isPoiCompatibleWithCategory,
  type CategoryKey,
  type AllCategoryKey,
} from '@/lib/poi-category';

export type { CategoryKey, AllCategoryKey } from '@/lib/poi-category';
export { detectCategoryKeyForPoi, isPoiCompatibleWithCategory } from '@/lib/poi-category';
export type SearchMode = 'fast' | 'full' | 'complete';

type CategoryCollection = Record<CategoryKey, POIItem[]>;

function calculateStraightDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computeDistance(origin: string, poi: POIItem): number | undefined {
  if (typeof poi.distance === 'number' && Number.isFinite(poi.distance)) {
    return poi.distance;
  }

  if (!origin.includes(',') || !poi.location || !poi.location.includes(',')) {
    return undefined;
  }

  const [originLng, originLat] = origin.split(',').map(Number);
  const [poiLng, poiLat] = poi.location.split(',').map(Number);
  if (!Number.isFinite(originLng) || !Number.isFinite(originLat) || !Number.isFinite(poiLng) || !Number.isFinite(poiLat)) {
    return undefined;
  }

  return calculateStraightDistance(originLat, originLng, poiLat, poiLng);
}

function normalizePoi(origin: string, poi: POIItem): POIItem {
  return {
    ...poi,
    distance: computeDistance(origin, poi),
  };
}

function buildKeywordBatches(category: CategoryKey): string[] {
  const configured = Array.isArray(CATEGORY_TYPES[category].keywords)
    ? CATEGORY_TYPES[category].keywords.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const defaults: Record<CategoryKey, string[]> = {
    food: ['美食', '餐厅', '饭店', '火锅', '烧烤', '快餐', '面馆', '咖啡', '甜品', '小吃'],
    play: [
      '台球厅', '台球馆', '足球场', '篮球场', '羽毛球馆', '网球场',
      '保龄球馆', '攀岩馆', '射箭馆', '卡丁车', '电竞馆',
      '景点', '公园', '游乐场', 'KTV', '密室', '运动', '健身', '台球', '电玩', '桌游',
    ],
    leisure: ['电影院', '咖啡馆', '书店', '茶馆', '酒吧', '展览', '博物馆', 'SPA', '美甲', '花店'],
  };

  const pool = Array.from(new Set([...configured, ...defaults[category]])).filter(Boolean);
  const batches: string[] = [];
  for (let i = 0; i < pool.length; i += 3) {
    const part = pool.slice(i, i + 3);
    if (part.length > 0) {
      batches.push(part.join('|'));
    }
  }
  return batches;
}

function getRootTypes(category: CategoryKey): string {
  if (category === 'food') return '050000';
  if (category === 'play') return '080000|090000|110000';
  return '060000|070000|080000|140000';
}

function getRectangles(location: string, radius: number): string[] {
  const [originLng, originLat] = location.split(',').map(Number);
  if (!Number.isFinite(originLng) || !Number.isFinite(originLat)) return [];

  const latRad = (originLat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = Math.max(1, metersPerDegLat * Math.cos(latRad));
  const dLat = radius / metersPerDegLat;
  const dLng = radius / metersPerDegLng;
  const minLat = originLat - dLat;
  const maxLat = originLat + dLat;
  const minLng = originLng - dLng;
  const maxLng = originLng + dLng;
  const midLat = (minLat + maxLat) / 2;
  const midLng = (minLng + maxLng) / 2;

  return [
    `${minLng},${minLat}|${midLng},${minLat}|${midLng},${midLat}|${minLng},${midLat}`,
    `${midLng},${minLat}|${maxLng},${minLat}|${maxLng},${midLat}|${midLng},${midLat}`,
    `${minLng},${midLat}|${midLng},${midLat}|${midLng},${maxLat}|${minLng},${maxLat}`,
    `${midLng},${midLat}|${maxLng},${midLat}|${maxLng},${maxLat}|${midLng},${maxLat}`,
  ];
}

function getSamplingCenters(location: string, minDistance: number, radius: number): string[] {
  const [originLng, originLat] = location.split(',').map(Number);
  if (!Number.isFinite(originLng) || !Number.isFinite(originLat)) return [location];

  const latRad = (originLat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = Math.max(1, metersPerDegLat * Math.cos(latRad));
  const toPoint = (distMeters: number, bearingRad: number) => {
    const dLat = (distMeters * Math.cos(bearingRad)) / metersPerDegLat;
    const dLng = (distMeters * Math.sin(bearingRad)) / metersPerDegLng;
    return `${originLng + dLng},${originLat + dLat}`;
  };

  const centers = new Set<string>([location]);
  const bearings = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => (d * Math.PI) / 180);

  if (minDistance > 0) {
    const mid = minDistance + (radius - minDistance) * 0.5;
    const nearOuter = minDistance + (radius - minDistance) * 0.82;
    for (const bearing of bearings) {
      centers.add(toPoint(mid, bearing));
      centers.add(toPoint(nearOuter, bearing));
    }
    return Array.from(centers);
  }

  const inner = Math.min(Math.max(radius * 0.45, 800), radius);
  const outer = Math.min(Math.max(radius * 0.8, 1200), radius);
  for (const bearing of bearings) {
    centers.add(toPoint(inner, bearing));
    if (outer > inner) {
      centers.add(toPoint(outer, bearing));
    }
  }
  return Array.from(centers);
}

function buildSequentialPages(maxPage: number): number[] {
  return Array.from({ length: maxPage }, (_, index) => index + 1);
}

function getCategoryTargets(category: CategoryKey, radius: number, mode: SearchMode) {
  if (mode === 'complete') {
    return { ideal: Number.MAX_SAFE_INTEGER, minimum: Number.MAX_SAFE_INTEGER };
  }

  const scale = mode === 'fast' ? 0.45 : 1;

  if (category === 'play') {
    if (radius <= 1000) return { ideal: Math.ceil(48 * scale), minimum: Math.ceil(20 * scale) };
    if (radius <= 3000) return { ideal: Math.ceil(96 * scale), minimum: Math.ceil(36 * scale) };
    return { ideal: Math.ceil(160 * scale), minimum: Math.ceil(56 * scale) };
  }

  if (radius <= 1000) return { ideal: Math.ceil(36 * scale), minimum: Math.ceil(18 * scale) };
  if (radius <= 3000) return { ideal: Math.ceil(72 * scale), minimum: Math.ceil(30 * scale) };
  return { ideal: Math.ceil(120 * scale), minimum: Math.ceil(48 * scale) };
}

function getKeywordPriority(category: CategoryKey): { exact: string[]; broad: string[] } {
  if (category === 'play') {
    return {
      exact: [
        '台球厅', '台球馆', '足球场', '篮球场', '羽毛球馆', '网球场',
        '保龄球馆', '攀岩馆', '射箭馆', '卡丁车', '电竞馆', '游泳馆',
      ],
      broad: ['景点', '公园', '游乐场', 'KTV', '密室', '运动', '健身', '体育馆', '桌游', '电玩'],
    };
  }

  if (category === 'food') {
    return {
      exact: ['火锅', '烧烤', '面馆', '咖啡', '甜品'],
      broad: ['美食', '餐厅', '饭店', '小吃', '快餐'],
    };
  }

  return {
    exact: ['电影院', '书店', '茶馆', '酒吧', '博物馆'],
    broad: ['咖啡馆', '展览', 'SPA', '美甲', '花店'],
  };
}

export async function collectPoiCandidatesByCategory(params: {
  location: string;
  radius: number;
  minDistance?: number;
  category: AllCategoryKey;
  mode?: SearchMode;
}): Promise<POIItem[]> {
  const { location, radius, category, mode = 'fast' } = params;
  const minDistance = Math.max(0, Math.min(Math.floor(Number(params.minDistance) || 0), radius));

  if (category === 'all') {
    const categorized = await collectCategorizedPoiCandidates({ location, radius, minDistance, mode });
    const merged: POIItem[] = [];
    const seen = new Set<string>();

    for (const key of ['food', 'play', 'leisure'] as const) {
      for (const poi of categorized[key]) {
        if (!poi.id || seen.has(poi.id)) continue;
        seen.add(poi.id);
        merged.push(poi);
      }
    }

    return merged.sort((a, b) => {
      const da = typeof a.distance === 'number' ? a.distance : Number.MAX_SAFE_INTEGER;
      const db = typeof b.distance === 'number' ? b.distance : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
  }

  const rootTypes = getRootTypes(category);
  const keywordBatches = buildKeywordBatches(category);
  const keywordSingles = keywordBatches.flatMap((batch) => batch.split('|')).filter(Boolean);
  const keywordPriority = getKeywordPriority(category);
  const targets = getCategoryTargets(category, radius, mode);
  const seen = new Set<string>();
  const collected: POIItem[] = [];
  const pagePlan = {
    preciseKeywordDistance: mode === 'fast'
      ? [1]
      : mode === 'complete'
        ? (radius <= 1000 ? buildSequentialPages(3) : radius <= 3000 ? buildSequentialPages(4) : buildSequentialPages(5))
        : (radius <= 1000 ? buildSequentialPages(2) : buildSequentialPages(3)),
    preciseKeywordWeight: mode === 'complete' ? [1, 2] : [1],
    aroundDistance: mode === 'fast'
      ? (radius <= 1000 ? buildSequentialPages(2) : radius <= 3000 ? buildSequentialPages(3) : buildSequentialPages(4))
      : mode === 'complete'
        ? (radius <= 1000 ? buildSequentialPages(6) : radius <= 3000 ? buildSequentialPages(10) : buildSequentialPages(14))
        : (radius <= 1000 ? buildSequentialPages(4) : radius <= 3000 ? buildSequentialPages(6) : buildSequentialPages(8)),
    aroundWeight: mode === 'fast'
      ? [1]
      : mode === 'complete'
        ? (radius <= 1000 ? buildSequentialPages(3) : radius <= 3000 ? buildSequentialPages(5) : buildSequentialPages(7))
        : (radius <= 1000 ? buildSequentialPages(2) : radius <= 3000 ? buildSequentialPages(3) : buildSequentialPages(4)),
    keywordDistance: mode === 'fast'
      ? [1]
      : mode === 'complete'
        ? (radius <= 1000 ? buildSequentialPages(2) : radius <= 3000 ? buildSequentialPages(4) : buildSequentialPages(5))
        : (radius <= 1000 ? buildSequentialPages(1) : radius <= 3000 ? buildSequentialPages(2) : buildSequentialPages(3)),
    keywordWeight: mode === 'fast'
      ? [1]
      : mode === 'complete'
        ? [1, 2, 3]
        : (radius <= 1000 ? [1] : [1, 2]),
    bounds: mode === 'fast'
      ? []
      : mode === 'complete'
        ? (radius <= 1000 ? [1, 2] : radius <= 3000 ? [1, 2, 3] : [1, 2, 3, 4])
        : (radius <= 1000 ? [1] : radius <= 3000 ? [1, 2] : [1, 2]),
  };

  const addMany = (items: POIItem[]) => {
    for (const raw of items) {
      if (!raw?.id || seen.has(raw.id)) continue;
      const normalized = normalizePoi(location, raw);
      if (
        typeof normalized.distance === 'number' &&
        normalized.distance >= minDistance &&
        normalized.distance <= radius &&
        isPoiCompatibleWithCategory(normalized, category) &&
        detectCategoryKeyForPoi(normalized) === category
      ) {
        seen.add(normalized.id);
        collected.push(normalized);
      }
    }
  };

  const pullAround = async (params: { keywords?: string; types?: string; sortrule: 'distance' | 'weight'; pages: number[]; offset?: number }) => {
    for (const page of params.pages) {
      if (collected.length >= targets.ideal) break;
      const results = await searchPOIAround({
        location,
        radius,
        keywords: params.keywords,
        types: params.types,
        sortrule: params.sortrule,
        offset: params.offset || 25,
        page,
        extensions: 'all',
      });

      if (!results || results.length === 0) break;
      const before = collected.length;
      addMany(results);
      const added = collected.length - before;

      if (results.length < (params.offset || 25)) break;
      if (added === 0) break;
    }
  };

  for (const keyword of keywordPriority.exact) {
    if (collected.length >= targets.ideal) break;
    await pullAround({
      keywords: keyword,
      sortrule: 'distance',
      pages: pagePlan.preciseKeywordDistance,
      offset: 25,
    });
  }

  if (collected.length < targets.minimum) {
    for (const keyword of keywordPriority.exact) {
      if (collected.length >= targets.minimum) break;
      await pullAround({
        keywords: keyword,
        sortrule: 'weight',
        pages: pagePlan.preciseKeywordWeight,
        offset: 25,
      });
    }
  }

  if (collected.length < targets.ideal) {
    await pullAround({
      types: rootTypes,
      sortrule: 'distance',
      pages: pagePlan.aroundDistance,
      offset: 25,
    });
  }

  if (collected.length < targets.ideal) {
    for (const keywords of keywordBatches) {
      if (collected.length >= targets.ideal) break;
      await pullAround({
        keywords,
        sortrule: 'distance',
        pages: pagePlan.keywordDistance,
        offset: 25,
      });
    }
  }

  if (collected.length < targets.minimum) {
    await pullAround({
      types: rootTypes,
      sortrule: 'weight',
      pages: pagePlan.aroundWeight,
      offset: 25,
    });
  }

  if (collected.length < targets.minimum) {
    for (const keyword of Array.from(new Set([...keywordPriority.broad, ...keywordSingles]))) {
      if (collected.length >= targets.minimum) break;
      await pullAround({
        keywords: keyword,
        sortrule: 'weight',
        pages: pagePlan.keywordWeight,
        offset: 25,
      });
    }
  }

  if ((mode === 'full' || mode === 'complete') && collected.length < targets.minimum) {
    const rectangles = getRectangles(location, radius);
    for (const rect of rectangles) {
      if (collected.length >= targets.minimum) break;
      const boundKeywords = mode === 'complete'
        ? keywordPriority.exact.concat(keywordPriority.broad, keywordSingles)
        : keywordPriority.exact.concat(keywordPriority.broad).slice(0, 8);
      for (const keyword of boundKeywords) {
        if (collected.length >= targets.minimum) break;
        for (const page of pagePlan.bounds) {
          const results = await searchPOIByBounds({
            bounds: rect,
            keywords: keyword,
            offset: 25,
            page,
            extensions: 'all',
          });
          addMany(results);
          if (results.length < 25) break;
        }
      }
    }
  }

  if (mode === 'complete') {
    const samplingCenters = getSamplingCenters(location, minDistance, radius);
    const samplingKeywords = Array.from(
      new Set([
        ...keywordPriority.exact,
        ...keywordPriority.broad,
        ...keywordSingles,
      ])
    ).slice(0, 12);
    const ringThickness = Math.max(1, radius - minDistance);
    const localRadius = minDistance > 0
      ? Math.max(1000, Math.min(Math.floor(ringThickness / 2), 4000))
      : Math.max(1200, Math.min(Math.floor(radius / 2), 4000));

    for (const center of samplingCenters) {
      for (const keyword of samplingKeywords) {
        const results = await searchPOIAround({
          location: center,
          radius: localRadius,
          keywords: keyword,
          sortrule: 'weight',
          offset: 25,
          page: 1,
          extensions: 'all',
        });
        addMany(results);
      }
    }
  }

  // #region debug-point A:collector-final
  fetch('http://127.0.0.1:7777/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'preview-missing-results',
      runId: 'post-fix',
      hypothesisId: 'A',
      location: 'src/lib/poi-candidate-collector.ts',
      msg: '[DEBUG] collector final',
      data: {
        category,
        mode,
        radius,
        minDistance,
        rootTypes,
        keywordBatchCount: keywordBatches.length,
        samplingCenterCount: mode === 'complete' ? getSamplingCenters(location, minDistance, radius).length : 0,
        collected: collected.length,
      },
      ts: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return collected.sort((a, b) => {
    const da = typeof a.distance === 'number' ? a.distance : Number.MAX_SAFE_INTEGER;
    const db = typeof b.distance === 'number' ? b.distance : Number.MAX_SAFE_INTEGER;
    return da - db;
  });
}

export async function collectCategorizedPoiCandidates(params: {
  location: string;
  radius: number;
  minDistance?: number;
  mode?: SearchMode;
}): Promise<CategoryCollection> {
  const { location, radius, minDistance = 0, mode = 'fast' } = params;

  const [food, play, leisure] = await Promise.all([
    collectPoiCandidatesByCategory({ location, radius, minDistance, category: 'food', mode }),
    collectPoiCandidatesByCategory({ location, radius, minDistance, category: 'play', mode }),
    collectPoiCandidatesByCategory({ location, radius, minDistance, category: 'leisure', mode }),
  ]);

  return { food, play, leisure };
}

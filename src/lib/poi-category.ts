import { CATEGORY_TYPES } from '@/lib/amap-config';
import type { POIItem } from '@/lib/amap';

export type CategoryKey = 'food' | 'play' | 'leisure';
export type AllCategoryKey = CategoryKey | 'all';

type PoiLike = Pick<POIItem, 'type' | 'typecode' | 'name'>;

const CATEGORY_STRONG_TYPE_PATTERNS: Record<CategoryKey, RegExp[]> = {
  food: [
    /餐饮服务/i,
    /中餐厅|西餐厅|外国餐厅|火锅|烧烤|小吃|快餐|面馆|甜品|咖啡厅|茶餐厅|自助餐|日[韩]料理|海鲜/i,
  ],
  play: [
    /风景名胜|公园广场|体育休闲服务|运动场馆/i,
    /台球|足球场|篮球场|羽毛球|网球场|保龄球|攀岩|射箭|卡丁车|电竞|游泳馆|健身中心|ktv|密室|游乐场|景点|体育馆/i,
  ],
  leisure: [
    /影剧院|会展服务|博物馆|美术馆|图书馆|剧场|livehouse/i,
    /书店|茶馆|酒吧|spa|美甲|花店|展览馆|陶艺|手工diy/i,
  ],
};

const CATEGORY_STRONG_NAME_PATTERNS: Record<CategoryKey, RegExp[]> = {
  food: [
    /餐厅|饭店|火锅|烧烤|小吃|快餐|面馆|甜品|咖啡|奶茶|自助餐|料理|酒楼/i,
  ],
  play: [
    /台球|足球场|篮球场|羽毛球|网球场|保龄球|攀岩|射箭|卡丁车|电竞|游泳馆|健身|ktv|密室|公园|景区|景点|游乐场|体育馆/i,
  ],
  leisure: [
    /电影院|剧场|展览|博物馆|美术馆|图书馆|书店|书屋|书局|茶馆|酒吧|livehouse|spa|美甲|花店/i,
  ],
};

const CATEGORY_BLOCKED_TYPE_PATTERNS: Record<CategoryKey, RegExp[]> = {
  food: [
    /影剧院|博物馆|展览馆|图书馆|美术馆|公园广场|风景名胜|运动场馆|体育用品店|品牌服装店|写字楼|公司企业|传媒机构|售票处|医疗保健/i,
  ],
  play: [
    /购物服务|专卖店|专营店|品牌服装店|服装鞋帽|体育用品店|商务住宅|楼宇|公司企业|传媒机构|售票处|医疗保健|政府机构/i,
  ],
  leisure: [
    /公司企业|商务住宅|楼宇|传媒机构|售票处|政府机构|医疗保健/i,
    /购物相关场所|眼镜店|学习机|品牌服装店|体育用品店/i,
  ],
};

const CATEGORY_BLOCKED_NAME_PATTERNS: Record<CategoryKey, RegExp[]> = {
  food: [
    /博物馆|美术馆|图书馆|电影院|剧场|书店|书屋|球馆|足球场|篮球场|羽毛球|网球|公园|景区|景点|ktv|spa/i,
  ],
  play: [
    /眼镜店|学习机|专卖店|体验店|专柜|人事部|售票厅|售票处|写字楼|公司/i,
  ],
  leisure: [
    /眼镜店|学习机|专卖店|体验店|专柜|人事部|售票厅|售票处|写字楼|公司/i,
  ],
};

const CATEGORY_SIGNALS: Record<CategoryKey, string[]> = {
  food: [
    '餐饮服务', '餐厅', '饭店', '中餐厅', '西餐厅', '外国餐厅', '火锅', '烧烤', '小吃',
    '快餐', '面馆', '咖啡厅', '甜品', '糕饼', '奶茶', '自助餐', '海鲜', '日料', '韩料',
  ],
  play: [
    '体育休闲服务', '运动场馆', '台球', '足球场', '篮球场', '羽毛球', '网球场', '保龄球',
    '攀岩', '射箭', '卡丁车', '电竞', '公园', '景点', '游乐场', 'ktv', '密室', '健身', '游泳馆',
  ],
  leisure: [
    '电影院', '影剧院', '博物馆', '展览', '美术馆', '图书馆', '书店', '茶馆', '酒吧',
    'livehouse', 'spa', '美甲', '花店', '剧场', '咖啡馆',
  ],
};

function tokenize(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/[\|;,\s/()（）·\-]+/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

function getPoiTexts(poi: PoiLike) {
  return {
    typeText: String(poi?.type || '').toLowerCase(),
    typecode: String(poi?.typecode || '').toLowerCase(),
    nameText: String(poi?.name || '').toLowerCase(),
  };
}

export function getPoiCategoryScores(poi: PoiLike): Record<CategoryKey, number> {
  const { typeText, typecode, nameText } = getPoiTexts(poi);
  const scores: Record<CategoryKey, number> = {
    food: 0,
    play: 0,
    leisure: 0,
  };

  const addScore = (category: CategoryKey, value: number) => {
    scores[category] += value;
  };

  for (const category of ['food', 'play', 'leisure'] as const) {
    for (const typeString of CATEGORY_TYPES[category].types) {
      const tokens = tokenize(String(typeString || ''));
      for (const token of tokens) {
        if (!token) continue;
        if (/^\d+$/.test(token)) {
          if (typecode.startsWith(token)) {
            addScore(category, 10);
          }
          continue;
        }
        if (typeText.includes(token)) {
          addScore(category, 6);
        }
        if (nameText.includes(token)) {
          addScore(category, 2);
        }
      }
    }
  }

  for (const category of ['food', 'play', 'leisure'] as const) {
    for (const signal of CATEGORY_SIGNALS[category]) {
      const normalized = signal.toLowerCase();
      if (typeText.includes(normalized)) {
        addScore(category, 8);
      }
      if (nameText.includes(normalized)) {
        addScore(category, 3);
      }
    }
  }

  if (typeText.includes('酒吧') && !typeText.includes('西餐厅') && !typeText.includes('外国餐厅')) {
    addScore('leisure', 8);
  }
  if (typeText.includes('休闲场所') && typeText.includes('咖啡')) {
    addScore('leisure', 7);
  }
  if (typeText.includes('餐饮服务') && typeText.includes('咖啡')) {
    addScore('food', 7);
  }
  if (typeText.includes('观景点') || typeText.includes('旅游景点')) {
    addScore('play', 8);
  }
  if (typeText.includes('运动场所') || typeText.includes('运动场馆')) {
    addScore('play', 9);
  }
  if (typeText.includes('餐饮相关')) {
    addScore('food', 5);
  }

  return scores;
}

export function isPoiCompatibleWithCategory(poi: PoiLike, category: CategoryKey): boolean {
  const { typeText, nameText } = getPoiTexts(poi);
  const hasStrongTypeSignal = matchesAny(typeText, CATEGORY_STRONG_TYPE_PATTERNS[category]);
  const hasStrongNameSignal = matchesAny(nameText, CATEGORY_STRONG_NAME_PATTERNS[category]);
  const blockedByType = matchesAny(typeText, CATEGORY_BLOCKED_TYPE_PATTERNS[category]);
  const blockedByName = matchesAny(nameText, CATEGORY_BLOCKED_NAME_PATTERNS[category]);

  if (!hasStrongTypeSignal && !hasStrongNameSignal) {
    return false;
  }

  if (blockedByName) {
    return false;
  }

  if (blockedByType && !hasStrongTypeSignal) {
    return false;
  }

  if (category === 'leisure' && typeText.includes('餐饮服务') && !typeText.includes('酒吧') && !typeText.includes('茶馆')) {
    return false;
  }

  if (category === 'play' && typeText.includes('餐饮服务') && !hasStrongTypeSignal) {
    return false;
  }

  if (category === 'food' && !typeText.includes('餐饮服务') && blockedByType) {
    return false;
  }

  return true;
}

export function detectCategoryKeyForPoi(poi: PoiLike): AllCategoryKey {
  const scores = getPoiCategoryScores(poi);
  const ranked = (Object.entries(scores) as Array<[CategoryKey, number]>)
    .sort((a, b) => b[1] - a[1]);
  const [topCategory, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;

  if (!topCategory || topScore <= 0) {
    return 'all';
  }
  if (topScore === secondScore) {
    return 'all';
  }
  return topCategory;
}

export function resolvePoiCategoryForSources(
  poi: PoiLike,
  sourceCategories: CategoryKey[]
): CategoryKey {
  const detected = detectCategoryKeyForPoi(poi);
  if (detected !== 'all' && isPoiCompatibleWithCategory(poi, detected)) {
    return detected;
  }

  const compatibleSources = sourceCategories.filter((category) => isPoiCompatibleWithCategory(poi, category));
  if (compatibleSources.length === 1) {
    return compatibleSources[0];
  }
  if (compatibleSources.length > 1) {
    sourceCategories = compatibleSources;
  } else if (sourceCategories.length === 1) {
    return sourceCategories[0];
  }

  const scores = getPoiCategoryScores(poi);
  const rankedSources = sourceCategories
    .map((category) => [category, scores[category]] as const)
    .sort((a, b) => b[1] - a[1]);

  return rankedSources[0]?.[0] || sourceCategories[0] || 'food';
}

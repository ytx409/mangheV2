export type AiCategoryKey = 'food' | 'play' | 'leisure';
export type AiSelectableCategory = AiCategoryKey | 'all';

export interface AiIntentInput {
  categories?: string[];
  atmosphere?: string[];
  activityKeywords?: string[];
  healingMessage?: string;
  shouldFilter?: boolean;
}

export interface ResolvedAiIntent {
  categories: AiCategoryKey[];
  atmosphere: string[];
  activityKeywords: string[];
  healingMessage: string;
  shouldFilter: boolean;
  primaryCategory: AiSelectableCategory;
  selectedCategory: AiSelectableCategory;
  categoryConflict: boolean;
  source: 'deepseek' | 'heuristic';
}

const CATEGORY_SIGNALS: Record<AiCategoryKey, string[]> = {
  food: [
    '火锅', '烧烤', '烤肉', '串串', '麻辣烫', '中餐', '西餐', '日料', '韩料', '自助',
    '甜品', '咖啡', '奶茶', '面馆', '小吃', '快餐', '餐厅', '饭店', '吃饭', '吃点',
    '宵夜', '下午茶', 'brunch',
  ],
  play: [
    '台球', '桌游', '密室', 'ktv', '景点', '景区', '公园', '游乐场', '电玩城',
    '健身', '运动', '游泳', '羽毛球', '篮球', '足球', '网球', '攀岩', '卡丁车',
    '露营', '徒步', '爬山', '骑行', '滑冰', '保龄球',
  ],
  leisure: [
    '电影', '影院', '电影院', '书店', '书屋', '书局', '茶馆', '酒吧', '清吧',
    '博物馆', '展览', '美术馆', '图书馆', '剧场', 'livehouse', 'spa', '按摩',
    '足疗', '美甲', 'diy', '手工', '陶艺',
  ],
};

const DEFAULT_ACTIVITY_KEYWORDS: Record<AiCategoryKey, string[]> = {
  food: ['美食', '餐厅', '火锅', '咖啡', '甜品'],
  play: ['景点', '公园', '台球', '运动', 'KTV'],
  leisure: ['电影院', '书店', '茶馆', '酒吧', '博物馆'],
};

const ATMOSPHERE_SIGNALS: Record<string, string[]> = {
  quiet: ['安静', '清静', '静一点', '适合看书', '适合学习'],
  romantic: ['约会', '浪漫', '情侣', '纪念日'],
  photo: ['拍照', '出片', '打卡'],
  lively: ['热闹', '热烈', '热乎', '嗨', '放松一下'],
  pet: ['宠物', '带狗', '带猫'],
  parentChild: ['亲子', '带娃', '小朋友', '孩子'],
};

const HEALING_BY_CATEGORY: Record<AiCategoryKey | 'all', string> = {
  food: '先好好吃一顿，心情会慢慢变好',
  play: '去动一动玩一玩，今天会轻松很多',
  leisure: '找个地方慢下来，给自己一点松弛感',
  all: '跟着感觉走，也许会遇见惊喜',
};

function uniqueStrings(values: Array<string | undefined | null>) {
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

export function normalizeAiCategory(category?: string): AiSelectableCategory {
  const normalized = String(category || '').trim().toLowerCase();
  if (normalized === 'food' || normalized === 'play' || normalized === 'leisure') {
    return normalized;
  }
  return 'all';
}

function scoreCategories(query: string) {
  const normalized = query.toLowerCase();
  const scores: Record<AiCategoryKey, number> = {
    food: 0,
    play: 0,
    leisure: 0,
  };
  const matchedKeywords: string[] = [];

  for (const category of ['food', 'play', 'leisure'] as const) {
    for (const signal of CATEGORY_SIGNALS[category]) {
      if (normalized.includes(signal.toLowerCase())) {
        scores[category] += signal.length >= 3 ? 3 : 2;
        matchedKeywords.push(signal);
      }
    }
  }

  return {
    scores,
    matchedKeywords: uniqueStrings(matchedKeywords),
  };
}

function extractAtmosphere(query: string) {
  const normalized = query.toLowerCase();
  const matched: string[] = [];

  for (const signals of Object.values(ATMOSPHERE_SIGNALS)) {
    for (const signal of signals) {
      if (normalized.includes(signal.toLowerCase())) {
        matched.push(signal);
      }
    }
  }

  return uniqueStrings(matched).slice(0, 5);
}

function inferIntentFromQuery(query: string, selectedCategory?: string): ResolvedAiIntent {
  const selected = normalizeAiCategory(selectedCategory);
  const normalizedQuery = String(query || '').trim();
  const vagueQuery = /随便|都行|无所谓|看着来|都可以/.test(normalizedQuery);
  const { scores, matchedKeywords } = scoreCategories(normalizedQuery);
  const ranked = (Object.entries(scores) as Array<[AiCategoryKey, number]>)
    .sort((a, b) => b[1] - a[1]);
  const topScore = ranked[0]?.[1] ?? 0;

  let categories: AiCategoryKey[] = [];
  if (topScore > 0) {
    categories = ranked
      .filter(([, score]) => score > 0 && score >= topScore - 1)
      .map(([category]) => category)
      .slice(0, 2);
  } else if (selected !== 'all') {
    categories = [selected];
  }

  const rankedPrimary = categories[0];
  const primaryCategory: AiSelectableCategory = rankedPrimary || selected || 'all';
  const hasScopedCategory = Boolean(rankedPrimary) || selected !== 'all';
  const fallbackKeywords = hasScopedCategory
    ? DEFAULT_ACTIVITY_KEYWORDS[(rankedPrimary || selected) as AiCategoryKey].slice(0, 4)
    : ['美食', '景点', '电影院'];
  const activityKeywords = matchedKeywords.length > 0
    ? matchedKeywords.slice(0, 5)
    : fallbackKeywords;

  const atmosphere = extractAtmosphere(normalizedQuery);
  const effectivePrimary: AiSelectableCategory = categories[0] || (selected !== 'all' ? selected : 'all');

  return {
    categories: categories.length > 0 ? categories : ['food', 'play', 'leisure'],
    atmosphere,
    activityKeywords,
    healingMessage: HEALING_BY_CATEGORY[effectivePrimary],
    shouldFilter: !vagueQuery && activityKeywords.length > 0,
    primaryCategory: effectivePrimary,
    selectedCategory: selected,
    categoryConflict: selected !== 'all' && effectivePrimary !== selected,
    source: 'heuristic',
  };
}

export function resolveAiIntent(
  query: string,
  selectedCategory?: string,
  rawIntent?: AiIntentInput | null
): ResolvedAiIntent {
  const heuristic = inferIntentFromQuery(query, selectedCategory);
  const selected = normalizeAiCategory(selectedCategory);
  const categories = uniqueStrings(rawIntent?.categories || [])
    .map((category) => normalizeAiCategory(category))
    .filter((category): category is AiCategoryKey => category !== 'all');
  const activityKeywords = uniqueStrings(rawIntent?.activityKeywords || []);
  const atmosphere = uniqueStrings(rawIntent?.atmosphere || []);

  const mergedCategories = categories.length > 0 ? categories : heuristic.categories;
  const primaryCategory: AiSelectableCategory = mergedCategories[0] || heuristic.primaryCategory;
  const mergedKeywords = activityKeywords.length > 0
    ? activityKeywords.slice(0, 6)
    : heuristic.activityKeywords;
  const mergedAtmosphere = atmosphere.length > 0 ? atmosphere.slice(0, 6) : heuristic.atmosphere;
  const healingMessage = String(rawIntent?.healingMessage || '').trim() || HEALING_BY_CATEGORY[primaryCategory];
  const shouldFilter = typeof rawIntent?.shouldFilter === 'boolean'
    ? rawIntent.shouldFilter
    : heuristic.shouldFilter;

  return {
    categories: mergedCategories,
    atmosphere: mergedAtmosphere,
    activityKeywords: mergedKeywords,
    healingMessage,
    shouldFilter,
    primaryCategory,
    selectedCategory: selected,
    categoryConflict: selected !== 'all' && primaryCategory !== selected,
    source: rawIntent ? 'deepseek' : 'heuristic',
  };
}

export function getDefaultKeywordsForCategories(categories: AiCategoryKey[]) {
  return uniqueStrings(
    categories.flatMap((category) => DEFAULT_ACTIVITY_KEYWORDS[category] || [])
  );
}

import { NextRequest, NextResponse } from 'next/server';
import { searchPOIAround, getPOIDetailServer, getNavigationUrl, AMapError, AMapErrorType } from '@/lib/amap';
import { CATEGORY_TYPES, HEALING_MESSAGES } from '@/lib/amap-config';
import { analyzeUserIntent } from '@/lib/deepseek';
import { getDefaultKeywordsForCategories, normalizeAiCategory, resolveAiIntent, type AiCategoryKey } from '@/lib/ai-intent';
import { detectCategoryKeyForPoi, isPoiCompatibleWithCategory } from '@/lib/poi-category';

export const dynamic = 'force-dynamic';

const AI_FALLBACK_MESSAGE = 'AI 暂时无法精准分析，已为你随机挑选了一份惊喜~';

// 计算两个经纬度坐标之间的直线距离（米）
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface AIPOIRequest {
  query: string;
  category?: string;
  location: string;
  cityName: string;
  distance: number;
  minDistance?: number;
  excludeIds?: string[];
}

function buildAiMetadata(query: string, intent: ReturnType<typeof resolveAiIntent>) {
  return {
    aiRecommended: true,
    aiQuery: query,
    aiResolvedCategory: intent.primaryCategory === 'all' ? 'all' : intent.primaryCategory,
    aiIntentCategories: intent.categories,
    aiCategoryConflict: intent.categoryConflict,
    aiSource: intent.source,
  } as const;
}

export async function POST(request: NextRequest) {
  try {
    const body: AIPOIRequest = await request.json();
    const { query, category, location, cityName, distance = 5000, minDistance, excludeIds = [] } = body;

    // 1. 校验输入
    if (!query || !query.trim()) {
      return NextResponse.json({
        success: false,
        message: '请输入您的需求',
        error: 'EMPTY_QUERY',
      });
    }

    if (!location || !location.trim()) {
      return NextResponse.json({
        success: false,
        message: '请先选择位置',
        error: 'NO_LOCATION',
      });
    }

    // 2. 调用 DeepSeek 解析意图
    console.log('[AI Recommend] 解析用户意图:', query, '分类:', category);
    const analyzedIntent = await analyzeUserIntent(query.trim(), location, cityName, category);
    console.log('[AI Recommend] DeepSeek 返回:', JSON.stringify(analyzedIntent));
    const intent = resolveAiIntent(query.trim(), category, analyzedIntent || undefined);
    console.log('[AI Recommend] 归一化意图:', JSON.stringify(intent));

    // 即使 shouldFilter 为 false，只要 AI 给到了关键词，就尝试搜索
    const shouldTrySearch = intent.shouldFilter || intent.activityKeywords.length > 0;
    console.log(`[AI Recommend] shouldFilter=${intent.shouldFilter}, keywords=${intent.activityKeywords.join(',')}, shouldTrySearch=${shouldTrySearch}`);

    const excludeIdSet = new Set(excludeIds.filter(Boolean));

    // 4. 使用 AI 解析的关键词搜索 AMap POI
    const keywords = intent.activityKeywords.join('|');
    const categoryTypes = intent.categories
      .flatMap((cat) => CATEGORY_TYPES[cat]?.types || [])
      .join('|');

    console.log(
      `[AI Recommend] ?????: "${keywords}", ??: ${intent.categories.join(', ')}`,
    );
    // 并行搜索：一次按距离排序，一次按权重排序（提高多样性）
    const [distanceResults, weightResults] = await Promise.allSettled([
      searchPOIAround({
        location,
        radius: Math.min(distance, 50000),
        keywords: keywords || undefined,
        types: categoryTypes || undefined,
        sortrule: 'distance',
        offset: 50,
        page: 1,
        extensions: 'all',
      }),
      searchPOIAround({
        location,
        radius: Math.min(distance * 2, 50000),
        keywords: keywords || undefined,
        types: categoryTypes || undefined,
        sortrule: 'weight',
        offset: 50,
        page: 1,
        extensions: 'all',
      }),
    ]);

    // 合并去重
    const poiMap = new Map<string, any>();
    const addPOIs = (results: any[]) => {
      for (const poi of results) {
        if (poi?.id && !poiMap.has(poi.id)) {
          poiMap.set(poi.id, poi);
        }
      }
    };

    // 记录搜索失败原因用于调试
    const logRejected = (label: string, result: PromiseSettledResult<any>) => {
      if (result.status === 'rejected') {
        console.error(`[AI Recommend] ${label} 搜索失败:`, result.reason?.message || result.reason);
      }
    };
    logRejected('距离排序', distanceResults);
    logRejected('权重排序', weightResults);

    if (distanceResults.status === 'fulfilled' && Array.isArray(distanceResults.value)) {
      addPOIs(distanceResults.value);
    }
    if (weightResults.status === 'fulfilled' && Array.isArray(weightResults.value)) {
      addPOIs(weightResults.value);
    }

    let allPois = Array.from(poiMap.values());
    console.log(`[AI Recommend] 搜索到 ${allPois.length} 个 POI`);

    // 4.5 搜索容错：如果精确关键词无结果，逐步放宽条件
    // 默认高命中关键词（AI 关键词可能太抽象匹配不到 POI）
    const defaultKeywords: Record<AiCategoryKey, string[]> = {
      food: ['美食', '餐厅', '火锅', '烧烤', '小吃', '咖啡', '面馆', '快餐'],
      play: ['景点', '公园', 'KTV', '游乐场', '密室', '运动', '健身'],
      leisure: ['电影院', '书店', '茶馆', '酒吧', '展览', '博物馆', '咖啡'],
    };

    if (allPois.length === 0) {
      console.log('[AI Recommend] AI关键词搜索无结果，尝试仅按分类 types 搜索...');
      const [fallbackDist, fallbackWeight] = await Promise.allSettled([
        searchPOIAround({
          location,
          radius: Math.min(distance * 2, 50000),
          types: categoryTypes || undefined,
          sortrule: 'distance',
          offset: 50,
          page: 1,
          extensions: 'all',
        }),
        searchPOIAround({
          location,
          radius: Math.min(distance * 2, 50000),
          types: categoryTypes || undefined,
          sortrule: 'weight',
          offset: 50,
          page: 1,
          extensions: 'all',
        }),
      ]);
      logRejected('分类搜索(距离)', fallbackDist);
      logRejected('分类搜索(权重)', fallbackWeight);
      if (fallbackDist.status === 'fulfilled' && Array.isArray(fallbackDist.value)) {
        addPOIs(fallbackDist.value);
      }
      if (fallbackWeight.status === 'fulfilled' && Array.isArray(fallbackWeight.value)) {
        addPOIs(fallbackWeight.value);
      }
      allPois = Array.from(poiMap.values());
      console.log(`[AI Recommend] 分类搜索得到 ${allPois.length} 个 POI`);
    }

    // 第二层兜底：用分类默认高命中关键词搜索
    if (allPois.length === 0) {
      const fallbackKw = intent.categories
        .flatMap((cat) => defaultKeywords[cat] || [])
        .slice(0, 5)
        .join('|');
      if (fallbackKw) {
        console.log(`[AI Recommend] 分类搜索无结果，尝试默认关键词: "${fallbackKw}"`);
        const [kwDist, kwWeight] = await Promise.allSettled([
          searchPOIAround({
            location,
            radius: Math.min(distance * 2, 50000),
            keywords: fallbackKw,
            sortrule: 'distance',
            offset: 50,
            page: 1,
            extensions: 'all',
          }),
          searchPOIAround({
            location,
            radius: Math.min(distance * 2, 50000),
            keywords: fallbackKw,
            sortrule: 'weight',
            offset: 50,
            page: 1,
            extensions: 'all',
          }),
        ]);
        logRejected('默认关键词(距离)', kwDist);
        logRejected('默认关键词(权重)', kwWeight);
        if (kwDist.status === 'fulfilled' && Array.isArray(kwDist.value)) {
          addPOIs(kwDist.value);
        }
        if (kwWeight.status === 'fulfilled' && Array.isArray(kwWeight.value)) {
          addPOIs(kwWeight.value);
        }
        allPois = Array.from(poiMap.values());
        console.log(`[AI Recommend] 默认关键词搜索得到 ${allPois.length} 个 POI`);
      }
    }

    if (allPois.length === 0) {
      console.log('[AI Recommend] 默认关键词仍无结果，扩大到 50km + 默认关键词搜索...');
      // 合并所有默认关键词
      const allDefaultKw = Array.from(new Set(
        intent.categories.flatMap((cat) => defaultKeywords[cat] || ['美食', '景点', '电影院'])
      )).slice(0, 5).join('|');
      const [farDist, farWeight] = await Promise.allSettled([
        searchPOIAround({
          location,
          radius: 50000,
          keywords: allDefaultKw,
          types: categoryTypes || undefined,
          sortrule: 'distance',
          offset: 50,
          page: 1,
          extensions: 'all',
        }),
        searchPOIAround({
          location,
          radius: 50000,
          keywords: allDefaultKw,
          types: categoryTypes || undefined,
          sortrule: 'weight',
          offset: 50,
          page: 1,
          extensions: 'all',
        }),
      ]);
      logRejected('50km(距离)', farDist);
      logRejected('50km(权重)', farWeight);
      if (farDist.status === 'fulfilled' && Array.isArray(farDist.value)) {
        addPOIs(farDist.value);
      }
      if (farWeight.status === 'fulfilled' && Array.isArray(farWeight.value)) {
        addPOIs(farWeight.value);
      }
      allPois = Array.from(poiMap.values());
      console.log(`[AI Recommend] 50km 搜索得到 ${allPois.length} 个 POI`);
    }

    // 5. 解析用户位置坐标用于距离计算
    const [userLng, userLat] = location.split(',').map(Number);

    // 6. 过滤和打分
    const normalizedSelectedCategory = normalizeAiCategory(category);
    const scoredPois = allPois
      .filter((poi) => !excludeIdSet.has(String(poi.id)))
      .filter((poi) => {
        const detectedCategory = detectCategoryKeyForPoi(poi);
        if (detectedCategory === 'all') {
          return intent.primaryCategory === 'all'
            ? intent.categories.some((cat) => isPoiCompatibleWithCategory(poi, cat))
            : intent.categories.includes(normalizedSelectedCategory as AiCategoryKey);
        }
        return intent.categories.includes(detectedCategory as AiCategoryKey) &&
          isPoiCompatibleWithCategory(poi, detectedCategory as AiCategoryKey);
      })
      .map((poi) => {
        let score = 1.0;

        // 距离加分
        const poiDist =
          poi.distance ||
          (userLat && userLng && poi.location
            ? haversineDistance(
                userLat,
                userLng,
                parseFloat(poi.location.split(',')[1]),
                parseFloat(poi.location.split(',')[0]),
              )
            : 99999);

        if (poiDist < 1000) score += 0.5;
        else if (poiDist < 3000) score += 0.3;
        else if (poiDist < 5000) score += 0.1;

        // 评分加分
        if (typeof poi.rating === 'number') {
          score += (poi.rating / 5) * 0.3;
        }

        // 氛围关键词匹配加分
        const nameAndType = `${poi.name || ''} ${poi.type || ''}`.toLowerCase();
        const atmosphereMatches = intent.atmosphere.filter((keyword) =>
          nameAndType.includes(keyword.toLowerCase()),
        ).length;
        score += atmosphereMatches * 0.15;

        const detectedCategory = detectCategoryKeyForPoi(poi);
        if (detectedCategory !== 'all' && intent.categories.includes(detectedCategory as AiCategoryKey)) {
          score += 0.2;
        }
        if (intent.primaryCategory !== 'all' && detectedCategory === intent.primaryCategory) {
          score += 0.25;
        }

        return { ...poi, _score: score, _distance: poiDist };
      });

    // 按得分降序排列
    scoredPois.sort((a, b) => b._score - a._score);

    const minDistanceValue = Math.max(0, Math.floor(Number(minDistance) || 0));
    const maxDistanceValue = Math.max(distance, minDistanceValue || 0);

    // 过滤：至少得分 > 1.0（有一定匹配度），且距离在范围内
    let candidates = scoredPois.filter(
      (p) => p._score >= 1.1 && p._distance >= minDistanceValue && p._distance <= Math.max(maxDistanceValue, 50000),
    );

    // 如果精确匹配不够，放宽条件
    if (candidates.length === 0) {
      // 去掉预算限制
      console.log('[AI Recommend] 精确匹配为空，放宽预算和氛围条件');
      candidates = scoredPois.filter(
        (p) => p._distance >= minDistanceValue && p._distance <= Math.max(maxDistanceValue, 50000)
      );
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        success: false,
        message: '未找到完全匹配的地点，建议换个说法试试~',
        error: 'NO_MATCH',
        data: {
          id: '',
          name: '',
          location: '',
          address: '',
          city: '',
          district: '',
          type: '',
          photos: [],
          distance: '',
          category: '全能盲盒',
          categoryIcon: '🎁',
          healingMessage: intent.healingMessage || '换个说法试试，也许会有惊喜！',
          navigationUrl: '',
          ...buildAiMetadata(query, intent),
          // 把 AI 解析的关键词返回给前端用于客户端搜索
          _intent: {
            activityKeywords: intent.activityKeywords,
            categories: intent.categories,
            atmosphere: intent.atmosphere,
            healingMessage: intent.healingMessage,
            shouldFilter: intent.shouldFilter,
            primaryCategory: intent.primaryCategory,
            categoryConflict: intent.categoryConflict,
            source: intent.source,
          },
        },
      });
    }

    // 7. 从候选中随机带权重选取一个
    // 使用前 10 个最匹配的候选，以得分为权重
    const topCandidates = candidates.slice(0, 10);
    const totalScore = topCandidates.reduce((sum, p) => sum + p._score, 0);
    let random = Math.random() * totalScore;
    let selectedPoi = topCandidates[0];
    for (const candidate of topCandidates) {
      random -= candidate._score;
      if (random <= 0) {
        selectedPoi = candidate;
        break;
      }
    }

    console.log(
      `[AI Recommend] 选中: ${selectedPoi.name}, 得分: ${selectedPoi._score.toFixed(2)}`,
    );

    // 8. 尝试通过高德 POI 详情接口补全数据
    let enrichedPoi = selectedPoi;
    try {
      const detail = await getPOIDetailServer(selectedPoi.id);
      if (detail) {
        enrichedPoi = { ...selectedPoi, ...detail, _score: selectedPoi._score, _distance: selectedPoi._distance };
        if (!enrichedPoi.rating && detail.rating) enrichedPoi.rating = detail.rating;
        if (!enrichedPoi.cost && detail.cost) enrichedPoi.cost = detail.cost;
        if (!enrichedPoi.tel && detail.tel) enrichedPoi.tel = detail.tel;
        if (Array.isArray(detail.photos) && detail.photos.length > 0) {
          enrichedPoi.photos = detail.photos;
        }
      }
    } catch {
      // 忽略详情获取失败
    }

    // 9. 组装响应（与 /api/poi/recommend 返回格式一致）
    const numericDistance = enrichedPoi._distance || enrichedPoi.distance;
    const distanceText =
      typeof numericDistance === 'number'
        ? numericDistance < 1000
          ? `${Math.round(numericDistance)}m`
          : `${(numericDistance / 1000).toFixed(1)}km`
        : '';

    // 检测分类
    const detectedCategory = detectCategoryKeyForPoi(enrichedPoi);
    const responseCategory =
      detectedCategory !== 'all'
        ? detectedCategory
        : (intent.primaryCategory !== 'all' ? intent.primaryCategory : 'all');

    const result = {
      id: enrichedPoi.id,
      name: enrichedPoi.name,
      location: enrichedPoi.location,
      address: enrichedPoi.address || '地址未知',
      type: enrichedPoi.type || '',
      tel: enrichedPoi.tel || '',
      photos: Array.isArray(enrichedPoi.photos)
        ? enrichedPoi.photos.map((p: any) => ({
            url: (p && typeof p === 'object' && p.url) || p || '',
          }))
        : [],
      rating: typeof enrichedPoi.rating === 'number' ? enrichedPoi.rating : undefined,
      price: typeof enrichedPoi.cost === 'number' ? enrichedPoi.cost : undefined,
      distance: distanceText,
      distanceMeters: typeof numericDistance === 'number' ? Math.round(numericDistance) : undefined,
      category:
        (CATEGORY_TYPES as any)[responseCategory]?.name || (CATEGORY_TYPES as any).all.name,
      categoryIcon:
        (CATEGORY_TYPES as any)[responseCategory]?.icon || (CATEGORY_TYPES as any).all.icon,
      healingMessage: intent.healingMessage,
      navigationUrl: getNavigationUrl({
        name: enrichedPoi.name,
        location: enrichedPoi.location,
        from: location,
      }),
      city: enrichedPoi.city || '',
      district: enrichedPoi.district || '',
      ...buildAiMetadata(query, intent),
    };

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('/api/ai/recommend error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'AI 推荐服务暂时不可用',
        error: 'SERVER_ERROR',
      },
      { status: 500 },
    );
  }
}

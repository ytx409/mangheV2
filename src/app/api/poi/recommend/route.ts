import { NextResponse } from 'next/server';
import { searchPOI, geocodeAddressServer, getNavigationUrl, getPOIDetailServer, AMapError, AMapErrorType } from '@/lib/amap';
import { CATEGORY_TYPES, HEALING_MESSAGES } from '@/lib/amap-config';
import { collectPoiCandidatesByCategory, computeDistance, detectCategoryKeyForPoi, isPoiCompatibleWithCategory } from '@/lib/poi-candidate-collector';
import type { AllCategoryKey } from '@/lib/poi-candidate-collector';
import type { POIItem } from '@/lib/amap';

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      // 使用标准的 JSON 解析（fetch / browser 会发送正确的 JSON）
      body = await req.json();
    } catch (parseErr) {
      console.warn('/api/poi/recommend parse body warning, falling back to empty body:', parseErr);
      body = {};
    }

    const {
      category = 'all',
      cityName = '',
      city = '',
      location = '',
      distance = 5000,
      address = '',
      excludeIds = [],
      minDistance,
    } = body || {};

    // 规范化 category（容错 trim + 小写），避免传入带空白或大小写差异导致映射失败
    const catKey = String(category || 'all').trim().toLowerCase();

    // 组成 types 字符串（优先使用分类映射）
    const typesArr = catKey === 'all'
      ? [
          ...CATEGORY_TYPES.food.types,
          ...CATEGORY_TYPES.play.types,
          ...CATEGORY_TYPES.leisure.types,
        ]
      : (CATEGORY_TYPES[catKey as keyof typeof CATEGORY_TYPES]?.types || []);

    const types = typesArr.join('|');

    const cityNameStr = String(cityName || '').trim();
    const cityStr = String(city || '').trim();
    const isAdcode = (v: string) => /^\d{6}$/.test(v);

    const cityForQuery = (cityStr && isAdcode(cityStr))
      ? cityStr
      : (cityNameStr || cityStr || undefined);

    const radius = (() => {
      const n = Number(distance);
      if (!Number.isFinite(n) || n <= 0) return 5000;
      return Math.max(1, Math.min(Math.floor(n), 50000));
    })();

    const ringTable = [
      { max: 1000, min: 0 },
      { max: 3000, min: 1000 },
      { max: 5000, min: 3000 },
    ];

    const derivedMin = ringTable.find(r => r.max === radius)?.min ?? 0;
    const minRadiusDistance = (() => {
      if (minDistance === undefined || minDistance === null || minDistance === '') return derivedMin;
      const n = Number(minDistance);
      if (!Number.isFinite(n) || n < 0) return derivedMin;
      return Math.max(0, Math.min(Math.floor(n), radius));
    })();

    const excludedIdSet = new Set(
      Array.isArray(excludeIds)
        ? excludeIds.map((x: any) => String(x || '').trim()).filter(Boolean)
        : []
    );

    let resolvedLocation = String(location || '').trim();
    const addressStr = String(address || '').trim();
    const geocodeTarget = addressStr || cityNameStr;

    if (!resolvedLocation && geocodeTarget) {
      try {
        const geo = await geocodeAddressServer({
          address: geocodeTarget,
          city: cityStr || cityNameStr || undefined,
        });
        if (geo?.location) {
          resolvedLocation = geo.location;
        }
      } catch (e) {
        console.warn('地理编码失败:', e);
      }
    }

    let candidatesPool: POIItem[] = [];
    try {
      if (resolvedLocation) {
        candidatesPool = await collectPoiCandidatesByCategory({
          location: resolvedLocation,
          radius,
          minDistance: minRadiusDistance,
          category: (catKey === 'food' || catKey === 'play' || catKey === 'leisure' || catKey === 'all')
            ? (catKey as AllCategoryKey)
            : 'all',
          mode: 'complete',
        });
        console.log(`[poi/recommend] collector complete category=${catKey} range=${minRadiusDistance}-${radius} count=${candidatesPool.length}`);
        // #region debug-point D:recommend-collector
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'preview-missing-results',
            runId: 'post-fix',
            hypothesisId: 'D',
            location: 'src/app/api/poi/recommend/route.ts',
            msg: '[DEBUG] recommend collector result',
            data: { catKey, radius, minRadiusDistance, count: candidatesPool.length, location: resolvedLocation },
            ts: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      } else {
        const keywords = (() => {
          if (catKey === 'all') {
            return ['餐厅', '景点', '电影院', '书店', '咖啡'].join('|');
          }
          const configured = (CATEGORY_TYPES as any)[catKey]?.keywords;
          if (Array.isArray(configured) && configured.length > 0) {
            return configured.slice(0, 3).join('|');
          }
          return '';
        })();

        candidatesPool = await searchPOI({
          keywords,
          types,
          city: cityForQuery,
          citylimit: true,
          offset: 50,
          page: 1,
          extensions: 'all',
        });
        console.log(`[poi/recommend] city fallback category=${catKey} count=${candidatesPool.length}`);
      }
    } catch (error) {
      // 处理认证错误
      if (error instanceof AMapError && error.type === AMapErrorType.AUTHENTICATION) {
        console.error('高德API认证失败，请检查Server Key配置:', error);
        return NextResponse.json({
          success: false,
          message: '高德API认证失败，请检查 AMAP_SERVER_KEY（必须是 Web服务 Key）',
          error: { type: error.type, code: error.code, info: error.originalError?.info || error.message },
        }, { status: 500 });
      } else if (error instanceof AMapError && error.type === AMapErrorType.NETWORK) {
        return NextResponse.json({
          success: false,
          message: '高德服务请求失败，请稍后重试（可能是网络/限流）',
          error: { type: error.type, code: error.code, info: error.message },
        }, { status: 503 });
      } else if (error instanceof AMapError && error.code === 'NO_SERVER_KEY') {
        return NextResponse.json({
          success: false,
          message: '未配置高德地图服务端 Key，无法返回真实店铺数据',
          error: { type: error.type, code: error.code },
        }, { status: 500 });
      } else if (error instanceof AMapError) {
        // 其他高德API错误
        console.warn('高德API错误:', error);
        candidatesPool = []; // 返回空数组，让后续逻辑处理
      } else {
        // 未知错误，重新抛出
        throw error;
      }
    }

    // 如果请求了特定分类（非 all），必须严格筛选该分类
    if (catKey !== 'all') {
      const normalizedCategory = catKey as Exclude<AllCategoryKey, 'all'>;
      candidatesPool = (candidatesPool || []).filter((p: POIItem) =>
        isPoiCompatibleWithCategory(p, normalizedCategory) && detectCategoryKeyForPoi(p) === normalizedCategory
      );
    }

    // 如果按位置搜索无结果且未提供位置（或结果为空），回退为按城市搜索一次，提高命中率
    // 只有在没有认证错误的情况下才尝试回退搜索
    if ((!candidatesPool || candidatesPool.length === 0) && !resolvedLocation) {
      try {
        const keywords = (CATEGORY_TYPES as any)[catKey]?.keywords?.[0] || '';
        candidatesPool = await searchPOI({
          keywords,
          types,
          city: cityForQuery,
          citylimit: true,
          offset: 50,
          page: 1,
          extensions: 'all',
        });
      } catch (error) {
        // 忽略回退搜索的错误，保持当前pois状态
        console.warn('回退搜索失败:', error);
      }
    }

    const computeNumericDistance = (p: POIItem): number | undefined =>
      resolvedLocation ? computeDistance(resolvedLocation, p) : p.distance;

    let filteredPois = candidatesPool || [];
    if (resolvedLocation && radius > 0) {
      filteredPois = (candidatesPool || []).filter((p: POIItem) => {
        const d = computeNumericDistance(p);
        if (d === undefined) return false;
        return d <= radius;
      });

      if (minRadiusDistance > 0) {
        const ringPois = filteredPois.filter((p: POIItem) => {
          const d = computeNumericDistance(p);
          if (d === undefined) return false;
          return d >= minRadiusDistance;
        });
        filteredPois = ringPois;
      }

      console.log(`距离筛选: ${minRadiusDistance}m~${radius}m 结果 ${filteredPois.length}/${candidatesPool?.length || 0}`);
    }

    if (resolvedLocation && (!filteredPois || filteredPois.length === 0)) {
      return NextResponse.json({
        success: false,
        message: '该距离范围内未找到符合条件的店铺，请尝试扩大范围或切换类型',
        data: null,
      });
    }

    if (excludedIdSet.size > 0 && filteredPois.length > 0) {
      const afterExclude = filteredPois.filter((p: POIItem) => !excludedIdSet.has(String(p.id || '')));
      if (afterExclude.length > 0) {
        filteredPois = afterExclude;
      }
    }

    // 优先选择同时有评分和均价的店铺；若无则降级到有任意一项的店铺，再降级到任意结果
    let candidates = filteredPois.filter((p) => typeof p.rating === 'number' && typeof p.cost === 'number');
    if (!candidates || candidates.length === 0) {
      candidates = filteredPois.filter((p) => typeof p.rating === 'number' || typeof p.cost === 'number');
    }
    if (!candidates || candidates.length === 0) {
      candidates = filteredPois;
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ success: false, message: '没有找到符合条件的店铺', data: null });
    }

    const shuffleInPlace = <T,>(arr: T[]): T[] => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const shuffled = shuffleInPlace([...candidates]);
    const poi = shuffled[0];
    console.log(`[poi/recommend] final category=${catKey} range=${minRadiusDistance}-${radius} candidates=${candidates.length} picked=${poi?.id || ''}`);
    // #region debug-point D:recommend-final
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'preview-missing-results',
        runId: 'post-fix',
        hypothesisId: 'D',
        location: 'src/app/api/poi/recommend/route.ts',
        msg: '[DEBUG] recommend final selection',
        data: { catKey, radius, minRadiusDistance, candidateCount: candidates.length, pickedId: poi?.id || null },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    const detectedKey = detectCategoryKeyForPoi(poi);

    const numericDistance = computeNumericDistance(poi);

    const distanceText = typeof numericDistance === 'number'
      ? (numericDistance < 1000 ? `${Math.round(numericDistance)}m` : `${(numericDistance / 1000).toFixed(1)}km`)
      : '';

    const result = {
      id: poi.id,
      name: poi.name,
      location: poi.location,
      address: poi.address,
      type: poi.type,
      tel: poi.tel || '',
      photos: Array.isArray(poi.photos) ? poi.photos.map((p: any) => ({
        url: (p && typeof p === 'object' && p.url) || p || ''
      })) : [],
      rating: typeof poi.rating === 'number' ? poi.rating : undefined,
      price: typeof poi.cost === 'number' ? poi.cost : undefined,
      distance: distanceText,
      distanceMeters: typeof numericDistance === 'number' ? Math.round(numericDistance) : undefined,
      category: (CATEGORY_TYPES as any)[detectedKey]?.name || (CATEGORY_TYPES as any).all.name,
      categoryIcon: (CATEGORY_TYPES as any)[detectedKey]?.icon || (CATEGORY_TYPES as any).all.icon,
      healingMessage: HEALING_MESSAGES[Math.floor(Math.random() * HEALING_MESSAGES.length)],
      navigationUrl: getNavigationUrl({ name: poi.name, location: poi.location, from: resolvedLocation || undefined }),
      // 为了向后兼容，也包含城市和区域信息
      city: poi.city || '',
      district: poi.district || '',
    };

    // 尝试通过高德 POI 详情接口补全评分 / 图片 / 门票价（仅在未使用模拟数据时）
    try {
      const detail = await getPOIDetailServer(poi.id);
      if (detail) {
        if (Array.isArray(detail.photos) && detail.photos.length > 0) {
          result.photos = detail.photos.map((p: any) => ({ url: p.url || p }));
        }

        if (!result.tel && detail.tel) {
          result.tel = detail.tel;
        }
        if (!result.address && detail.address) {
          result.address = detail.address;
        }
        if (!result.type && detail.type) {
          result.type = detail.type;
        }
        if (!result.city && detail.city) {
          result.city = detail.city;
        }
        if (!result.district && detail.district) {
          result.district = detail.district;
        }

        if (typeof detail.rating === 'number') {
          result.rating = detail.rating;
        }

        if (typeof detail.cost === 'number') {
          result.price = detail.cost;
        }
      }
    } catch (detailErr) {
      console.warn('获取 POI 详情失败，使用已有数据:', detailErr);
    }

    // 构建响应对象
    const response: any = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('/api/poi/recommend error:', err);

    return NextResponse.json({
      success: false,
      message: '服务端错误',
      error: String(err)
    }, { status: 500 });
  }
}

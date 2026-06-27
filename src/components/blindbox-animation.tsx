'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { BlindboxResult, BlindboxSkin, getHistory } from '@/hooks/use-blindbox';
import { CATEGORY_TYPES, HEALING_MESSAGES } from '@/lib/amap-config';
import { getNavigationUrl } from '@/lib/amap';
import { getSkinConfig } from '@/lib/skin-config';
import { getCategoryColors, getCategoryName, getCategoryIcon } from '@/lib/category-config';
import { generateGradient, generateBoxShadow, generateGlow } from '@/lib/gradient-utils';
import { getDefaultKeywordsForCategories, resolveAiIntent, type AiCategoryKey } from '@/lib/ai-intent';
import { detectCategoryKeyForPoi, isPoiCompatibleWithCategory } from '@/lib/poi-category';

import type { POIItem } from '@/lib/amap';

function calculateStraightDistanceByText(origin: string, dest: string) {
  try {
    const [lng1, lat1] = origin.split(',').map(Number);
    const [lng2, lat2] = dest.split(',').map(Number);
    if (!Number.isFinite(lng1) || !Number.isFinite(lat1) || !Number.isFinite(lng2) || !Number.isFinite(lat2)) {
      return null;
    }
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  } catch {
    return null;
  }
}

interface BlindboxAnimationProps {
  isOpen: boolean;
  category: string;
  skin?: BlindboxSkin;
  location?: string;
  cityName?: string;
  distance?: number; // 距离（米）
  distanceKey?: string;
  /** AI 模式：自然语言查询 */
  aiQuery?: string;
  /** 是否为 AI 推荐模式 */
  isAiMode?: boolean;
  /** AI 失败时回退回调 */
  onAiFallback?: () => void;
  /** ??????????? */
  userOverriddenCategory?: boolean;
  onComplete: (result: BlindboxResult) => void;
}


export default function BlindboxAnimation({
  isOpen,
  category,
  skin = 'basic',
  location,
  cityName,
  distance = 5000, // 默认5公里
  distanceKey,
  aiQuery,
  isAiMode,
  userOverriddenCategory: userOverriddenCategoryProp = false,
  onAiFallback,
  onComplete
}: BlindboxAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'shake' | 'glow' | 'explode' | 'loading' | 'done'>('idle');
  const [boxShake, setBoxShake] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [stars, setStars] = useState<{ id: number; x: number; y: number; size: number; opacity: number }[]>([]);
  const [amapLoaded, setAmapLoaded] = useState(false);
  
  // 使用 useRef 来管理所有状态，避免闭包问题
  const isAnimatingRef = useRef(false);
  const prevIsOpenRef = useRef(false);
  const onCompleteCalledRef = useRef(false);
  
  // 保存最新的 prop/hook 值到 ref，确保 useEffect 闭包中使用的总是最新值
  const isAiModeRef = useRef(isAiMode);
  isAiModeRef.current = isAiMode;
  const aiQueryRef = useRef(aiQuery);
  aiQueryRef.current = aiQuery;
  const locationRef = useRef(location);
  locationRef.current = location;
  const onAiFallbackRef = useRef(onAiFallback);
  onAiFallbackRef.current = onAiFallback;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const lastResolvedAiCategoryRef = useRef<string | null>(null);

  // 重置所有状态的函数
  const resetState = useCallback(() => {
    console.log('[动画组件] 重置所有状态');
    setPhase('idle');
    setBoxShake(0);
    setLoadingText('');
    setStars([]);
    isAnimatingRef.current = false;
    prevIsOpenRef.current = false;
    onCompleteCalledRef.current = false;
  }, []);

  // 组件挂载/卸载时清理状态
  useEffect(() => {
    // 组件挂载时确保状态初始正确
    resetState();
    
    // 组件卸载时重置
    return () => {
      console.log('[动画组件] 组件卸载，重置状态');
      resetState();
    };
  }, [resetState]);

  // 等待AMap加载完成
  useEffect(() => {
    const checkAMap = () => {
      console.log('[动画组件] 检查高德地图加载状态...');
      if (window.AMap && window.AMap.AutoComplete && window.AMap.PlaceSearch && window.AMap.Geolocation) {
        console.log('[动画组件] 高德地图加载成功');
        setAmapLoaded(true);
      } else {
        console.log('[动画组件] 高德地图未加载，200ms后重试');
        setTimeout(checkAMap, 200);
      }
    };
    checkAMap();
  }, []);

  // 安全包装 onComplete，确保只调用一次，且引用稳定
  const safeOnComplete = useCallback((result: BlindboxResult) => {
    if (onCompleteCalledRef.current) {
      console.warn('[动画组件] onComplete 已被调用过，忽略重复调用');
      return;
    }
    onCompleteCalledRef.current = true;
    onCompleteRef.current(result);
  }, []);

  const currentSkin = getSkinConfig(skin);
  const colors = getCategoryColors(category);
  const icon = getCategoryIcon(category);
  const categoryName = getCategoryName(category);

  // 生成星星背景
  useEffect(() => {
    if (isOpen) {
      const newStars = Array.from({ length: 50 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 4 + 2,
        opacity: Math.random() * 0.5 + 0.3,
      }));
      setStars(newStars);
    }
  }, [isOpen]);

  // 调用独立推荐链路获取真实店铺
  const fetchRecommendation = useCallback(async (overrideCategory?: string) => {
    const effectiveCategory = overrideCategory || category;
    const effectiveCategoryName = getCategoryName(effectiveCategory);
    const effectiveIcon = getCategoryIcon(effectiveCategory);
    console.log('[动画组件] 开始获取推荐', { category: effectiveCategory, location });

    const getExcludeIds = () => {
      const history = getHistory();
      return history.map(h => h.id).filter(Boolean);
    };

    const getDistanceRange = () => {
      switch (distanceKey) {
        case 'within1':
          return { min: 0, max: 1000, searchRadius: 1000 };
        case '1to3':
          return { min: 1000, max: 3000, searchRadius: 3000 };
        case '3to5':
          return { min: 3000, max: 5000, searchRadius: 5000 };
        case 'any':
        default:
          return { min: 0, max: 5000, searchRadius: 5000 };
      }
    };

    const fetchFromServer = async (): Promise<
      { kind: 'success'; result: BlindboxResult } |
      { kind: 'empty' } |
      { kind: 'error' }
    > => {
      try {
        const excludeIds = getExcludeIds();
        const range = getDistanceRange();
        const resp = await Promise.race([
          fetch('/api/poi/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: effectiveCategory,
              cityName: cityName || '北京',
              location: location || '',
              distance: range.max,
              minDistance: range.min,
              excludeIds,
            })
          }),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 6000)),
        ]) as Response;

        const json = await resp.json().catch(() => null);
        if (!resp.ok) {
          return { kind: 'error' };
        }
        if (!json?.success) {
          return { kind: 'empty' };
        }
        const poiData = json?.data?.poi || json?.data || null;
        if (!poiData) return { kind: 'empty' };

        const poiLocation = poiData.location || '';
        const result_data: BlindboxResult = {
          id: poiData.id || String(Date.now()),
          name: poiData.name || '未知店铺',
          location: poiLocation,
          address: poiData.address || '',
          city: poiData.city || cityName || '北京',
          district: poiData.district || '',
          type: poiData.type || '',
          tel: poiData.tel || '',
          photos: poiData.photos || [],
          rating: poiData.rating && poiData.rating > 0 ? poiData.rating : undefined,
          price: poiData.price || poiData.cost || undefined,
          distance: poiData.distance || '',
          category: effectiveCategoryName,
          categoryIcon: effectiveIcon,
          healingMessage: poiData.healingMessage || HEALING_MESSAGES[Math.floor(Math.random() * HEALING_MESSAGES.length)] || '今天也要好好放松呀~',
          navigationUrl: poiLocation ? getNavigationUrl({ name: poiData.name || '目的地', location: poiLocation, from: location, mode: 'car' }) : '',
        };

        return { kind: 'success', result: result_data };
      } catch {
        return { kind: 'error' };
      }
    };

    const calculateStraightDistance = (origin: string, dest: string) => {
      try {
        const [lng1, lat1] = origin.split(',').map(Number);
        const [lng2, lat2] = dest.split(',').map(Number);
        if (!Number.isFinite(lng1) || !Number.isFinite(lat1) || !Number.isFinite(lng2) || !Number.isFinite(lat2)) return null;
        const R = 6371000;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
      } catch {
        return null;
      }
    };

    const getCategoryKeywordSeeds = (cat: string): string[] => {
      const safe = (arr: any) => Array.isArray(arr) ? arr.map((x: any) => String(x || '').trim()).filter(Boolean) : [];
      if (cat === 'all') {
        return Array.from(new Set([
          ...safe((CATEGORY_TYPES as any).food?.keywords),
          ...safe((CATEGORY_TYPES as any).play?.keywords),
          ...safe((CATEGORY_TYPES as any).leisure?.keywords),
          '热门',
        ])).slice(0, 10);
      }
      const base = safe((CATEGORY_TYPES as any)[cat]?.keywords);
      const extra = cat === 'food'
        ? ['美食', '餐厅', '饭店', '火锅', '小吃', '烧烤', '快餐']
        : cat === 'play'
          ? ['景点', '公园', '游乐场', 'KTV', '密室', '运动', '健身']
          : ['电影院', '书店', '茶馆', '咖啡', '酒吧', '展览', '博物馆'];
      return Array.from(new Set([...base, ...extra])).slice(0, 10);
    };

    const getDetailsById = async (id: string) => {
      if (!amapLoaded) return null;
      const AMap = (window as any).AMap;
      if (!AMap?.PlaceSearch) return null;

      return await new Promise<any | null>((resolve) => {
        const ps = new AMap.PlaceSearch({ extensions: 'all' });
        ps.getDetails(id, (status: string, result: any) => {
          if (status === 'complete' && result?.poiList?.pois?.length) {
            resolve(result.poiList.pois[0]);
            return;
          }
          resolve(null);
        });
      });
    };

    try {
      setLoadingText('🎯 正在搜索附近好店...');

      const serverResult = await fetchFromServer();
      if (serverResult.kind === 'success') {
        // #region debug-point D:animation-server-success
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'preview-missing-results',
            runId: 'post-fix',
            hypothesisId: 'D',
            location: 'src/components/blindbox-animation.tsx',
            msg: '[DEBUG] animation used server recommendation',
            data: { category: effectiveCategory, distanceKey, resultId: serverResult.result.id },
            ts: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setLoadingText('✨ 发现惊喜好店！');
        setTimeout(() => {
          safeOnComplete(serverResult.result);
        }, 300);
        return;
      }

      if (serverResult.kind === 'empty') {
        // #region debug-point D:animation-server-empty
        fetch('http://127.0.0.1:7777/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: 'preview-missing-results',
            runId: 'post-fix',
            hypothesisId: 'D',
            location: 'src/components/blindbox-animation.tsx',
            msg: '[DEBUG] animation server returned empty',
            data: { category, distanceKey },
            ts: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
        setLoadingText('🎲 该条件下暂无更多候选');
        await new Promise(resolve => setTimeout(resolve, 500));
        safeOnComplete(getDefaultResult(effectiveCategory));
        return;
      }

      const AMap = (window as any).AMap;
      if (!AMap || !AMap.PlaceSearch) {
        throw new Error('高德地图 PlaceSearch 未加载');
      }

      // #region debug-point D:animation-fallback-entered
      fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'preview-missing-results',
          runId: 'post-fix',
          hypothesisId: 'D',
          location: 'src/components/blindbox-animation.tsx',
          msg: '[DEBUG] animation entered client fallback',
          data: { category: effectiveCategory, distanceKey },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setLoadingText('📡 服务端搜索异常，尝试本地兜底...');
      await new Promise(resolve => setTimeout(resolve, 300));

      const keywordSeeds = getCategoryKeywordSeeds(effectiveCategory);

      // 如果没有指定位置，使用默认位置
      const searchLocation = location ? location.split(',').map(Number) : [116.39723, 39.9075];

      const originLocation = location ? location : `${searchLocation[0]},${searchLocation[1]}`;
      const range = getDistanceRange();

      const latRad = (searchLocation[1] * Math.PI) / 180;
      const metersPerDegLat = 111320;
      const metersPerDegLng = Math.max(1, metersPerDegLat * Math.cos(latRad));

      const toPoint = (distMeters: number, bearingRad: number) => {
        const dLat = (distMeters * Math.cos(bearingRad)) / metersPerDegLat;
        const dLng = (distMeters * Math.sin(bearingRad)) / metersPerDegLng;
        return [searchLocation[0] + dLng, searchLocation[1] + dLat] as const;
      };

      const collectByRingSampling = async () => {
        const placeSearch = new AMap.PlaceSearch({
          pageSize: 100,
          pageIndex: 1,
          extensions: 'all',
        });

        const seen = new Set<string>();
        const collected: any[] = [];

        const attempts = range.min > 0 ? 10 : 4;
        const localRadius = range.min > 0
          ? Math.max(1200, Math.min((range.max - range.min) / 2, 5000))
          : Math.max(2000, Math.min(range.max, 10000));

        const searchAt = async (lng: number, lat: number, kw: string) => {
          const pois = await new Promise<any[]>((resolve) => {
            placeSearch.searchNearBy(
              kw,
              new (AMap as any).LngLat(lng, lat),
              Math.floor(localRadius),
              (status: string, result: any) => {
                if (status === 'complete' && result?.poiList?.pois?.length) {
                  resolve(result.poiList.pois as any[]);
                  return;
                }
                resolve([]);
              }
            );
          });

          for (const p of pois) {
            const id = String(p?.id || '');
            if (!id || seen.has(id)) continue;
            if (effectiveCategory !== 'all') {
              const detectedCategory = detectCategoryKeyForPoi(p);
              const compatible = isPoiCompatibleWithCategory(p, effectiveCategory as AiCategoryKey);
              if (detectedCategory !== effectiveCategory && !compatible) continue;
            }
            const loc = p?.location ? `${p.location.lng},${p.location.lat}` : '';
            if (!loc) continue;
            const d = calculateStraightDistance(originLocation, loc);
            if (d === null) continue;
            if (d >= range.min && d <= range.max) {
              (p as any).__originDistance = d;
              collected.push(p);
              seen.add(id);
            }
          }
        };

        for (let i = 0; i < attempts; i++) {
          const bearing = Math.random() * Math.PI * 2;
          const dist = range.min > 0
            ? (range.min + Math.random() * (range.max - range.min))
            : (Math.random() * range.max);
          const [lng, lat] = toPoint(dist, bearing);

          for (const kw of keywordSeeds.slice(0, 6)) {
            await searchAt(lng, lat, kw);
            if (collected.length >= 60) return collected;
          }
        }

        return collected;
      };

      return new Promise<void>((resolve) => {
        (async () => {
          const finalPool = await collectByRingSampling();
          if (finalPool.length > 0) {
              // 获取历史记录，排除已推荐过的店铺
              const history = getHistory();
              const historyIds = new Set(history.map(h => h.id));
              const validPois = finalPool;


              console.log(`[动画组件] AMap 返回 ${validPois.length} 个有评分和价格的店铺`);

              // 排除已推荐过的店铺
              const freshPois = validPois.filter(p => !historyIds.has(p.id));
              console.log(`[动画组件] 排除已推荐店铺后，剩余 ${freshPois.length} 个新店铺`);

              // 如果没有新店铺，则使用所有候选店铺（允许重复）
              const finalCandidates = freshPois.length > 0 ? freshPois : validPois;

              if (finalCandidates.length === 0) {
                console.warn('[动画组件] 本地兜底也没有找到候选');
                safeOnComplete(getDefaultResult(effectiveCategory));
                resolve();
                return;
              }

              // 加权随机选择：基于评分、价格和距离
              let chosenPoi: any | null = null;
              if (finalCandidates.length === 1) {
                chosenPoi = finalCandidates[0];
              } else {
                // 转换POI数据为POIItem格式以便使用getWeightedRandomIndex函数
                const poiItems: POIItem[] = finalCandidates.map(p => ({
                  id: p.id,
                  name: p.name,
                  location: p.location ? `${p.location.lng},${p.location.lat}` : '',
                  address: p.address || '',
                  province: p.province || '',
                  city: p.city || '',
                  district: p.district || '',
                  type: p.type || '',
                  typecode: p.typecode || '',
                  tel: p.tel,
                  photos: p.photos || [],
                  rating: p.biz_ext?.rating ? Number(p.biz_ext.rating) : undefined,
                  cost: p.biz_ext?.cost ? Number(p.biz_ext.cost) : undefined,
                  distance: p.__originDistance ? Number(p.__originDistance) : (p.distance ? Number(p.distance) : undefined),
                  remark: p.remark || '',
                }));

                const weightedIndex = getWeightedRandomIndex(poiItems, location);
                chosenPoi = finalCandidates[weightedIndex];
              }

              const randomPoi = chosenPoi as any;

              setLoadingText('✨ 发现惊喜好店！');

              const poiLocation = randomPoi.location
                ? `${randomPoi.location.lng},${randomPoi.location.lat}`
                : '';

              // 计算距离
              let distanceStr = '';
              if (poiLocation && location) {
                const dist = randomPoi.__originDistance ? Number(randomPoi.__originDistance) : (randomPoi.distance ? Number(randomPoi.distance) : undefined);
                if (dist && dist > 0) {
                  distanceStr = dist < 1000 ? `${Math.round(dist)}m` : `${(dist / 1000).toFixed(1)}km`;
                }
              }

              (async () => {
                const detail = randomPoi.id ? await getDetailsById(randomPoi.id) : null;
                const mergedPhotos = Array.isArray(detail?.photos) && detail.photos.length > 0 ? detail.photos : (randomPoi.photos || []);
                const mergedRating = detail?.biz_ext?.rating ? Number(detail.biz_ext.rating) : (randomPoi.biz_ext?.rating ? Number(randomPoi.biz_ext.rating) : undefined);
                const mergedCost = detail?.biz_ext?.cost ? Number(detail.biz_ext.cost) : (randomPoi.biz_ext?.cost ? Number(randomPoi.biz_ext.cost) : undefined);
                const mergedAddress = detail?.address || randomPoi.address || '';
                const mergedCity = detail?.cityname || randomPoi.city || cityName || '北京';
                const mergedDistrict = detail?.adname || randomPoi.district || '';
                const mergedType = detail?.type || randomPoi.type || '';
                const mergedTel = detail?.tel || randomPoi.tel || '';

                const result_data: BlindboxResult = {
                  id: randomPoi.id || String(Date.now()),
                  name: randomPoi.name || '未知店铺',
                  location: poiLocation,
                  address: mergedAddress,
                  city: mergedCity,
                  district: mergedDistrict,
                  type: mergedType,
                  tel: mergedTel,
                  photos: mergedPhotos,
                  rating: mergedRating,
                  price: mergedCost,
                  distance: distanceStr,
                  category: effectiveCategoryName,
                  categoryIcon: effectiveIcon,
                  healingMessage: HEALING_MESSAGES[Math.floor(Math.random() * HEALING_MESSAGES.length)] || '今天也要好好放松呀~',
                  navigationUrl: poiLocation ?
                    getNavigationUrl({
                      name: randomPoi.name || '目的地',
                      location: poiLocation,
                      from: location,
                      mode: 'car'
                    }) : '',
                };

                setTimeout(() => {
                  safeOnComplete(result_data);
                  resolve();
                }, 600);
              })();
          return;
          }

          setLoadingText('本地兜底未找到合适店铺...');
          safeOnComplete(getDefaultResult(effectiveCategory));
          resolve();
        })();
      });
    } catch (error) {
      console.error('获取推荐失败:', error);
      setLoadingText('🎲 换个地方试试...');
      await new Promise(resolve => setTimeout(resolve, 800));

      safeOnComplete(getDefaultResult(effectiveCategory));
    }
  }, [category, location, cityName, distance, distanceKey, amapLoaded, safeOnComplete]);

  // AI 智能推荐获取
  const fetchAiRecommendation = useCallback(async (): Promise<BlindboxResult | null> => {
    const currentAiQuery = aiQueryRef.current;
    const currentLocation = locationRef.current;
    if (!currentAiQuery || !currentLocation) return null;

    const baseIntent = resolveAiIntent(currentAiQuery, category);
    lastResolvedAiCategoryRef.current = baseIntent.primaryCategory !== 'all' ? baseIntent.primaryCategory : null;

    const attachAiMeta = (result: BlindboxResult, intent = baseIntent): BlindboxResult => ({
      ...result,
      aiRecommended: true,
      aiQuery: currentAiQuery,
      aiResolvedCategory: intent.primaryCategory,
      aiIntentCategories: intent.categories,
      aiCategoryConflict: intent.categoryConflict,
      aiSource: intent.source,
    });

    const getDistanceRange = () => {
      switch (distanceKey) {
        case 'within1':
          return { min: 0, max: 1000 };
        case '1to3':
          return { min: 1000, max: 3000 };
        case '3to5':
          return { min: 3000, max: 5000 };
        default:
          return { min: 0, max: 5000 };
      }
    };

    setLoadingText('🤖 AI正在分析你的需求...');
    await new Promise((resolve) => setTimeout(resolve, 800));

    const tryFallbackSearch = async (
      originLocation: string,
      range: { min: number; max: number },
      excludeIds: string[],
      intent = baseIntent
    ): Promise<BlindboxResult | null> => {
      console.log('[动画组件] 开始 AI 兜底搜索...');
      const fallbackCategory = intent.primaryCategory !== 'all' ? intent.primaryCategory : category;
      const fallbackCategoryName = getCategoryName(fallbackCategory);
      const fallbackIcon = getCategoryIcon(fallbackCategory);
      const searchKeywords = [
        ...intent.activityKeywords,
        ...getDefaultKeywordsForCategories(intent.categories),
      ]
        .filter(Boolean)
        .slice(0, 4);
      const keyword = searchKeywords.join('|') || '美食|景点|书店';

      const [searchLng, searchLat] = originLocation.split(',').map(Number);
      if (!Number.isFinite(searchLng) || !Number.isFinite(searchLat)) {
        return null;
      }

      const buildClientResult = (pick: any, distanceMeters: number): BlindboxResult => {
        const pickLocation = typeof pick.location === 'string'
          ? pick.location
          : `${pick.location?.lng},${pick.location?.lat}`;
        return attachAiMeta({
          id: pick.id,
          name: pick.name,
          location: pickLocation,
          address: pick.address || '',
          city: pick.city || cityName || '',
          district: pick.district || '',
          type: pick.type || '',
          tel: pick.tel || '',
          photos: (pick.photos || []).map((photo: any) => ({ url: photo.url || photo })),
          rating: pick.biz_ext?.rating ? Number(pick.biz_ext.rating) : undefined,
          price: pick.biz_ext?.cost ? Number(pick.biz_ext.cost) : undefined,
          distance: distanceMeters < 1000 ? `${Math.round(distanceMeters)}m` : `${(distanceMeters / 1000).toFixed(1)}km`,
          distanceMeters: Math.round(distanceMeters),
          category: fallbackCategoryName,
          categoryIcon: fallbackIcon,
          healingMessage: intent.healingMessage,
          navigationUrl: `https://uri.amap.com/navigation?to=${pickLocation},${encodeURIComponent(pick.name)}&mode=car&callnative=1`,
        }, intent);
      };

      const clientSearchPromise = new Promise<BlindboxResult | null>((resolve) => {
        if (!window.AMap?.PlaceSearch) {
          resolve(null);
          return;
        }

        try {
          const AMap = window.AMap;
          const placeSearch = new AMap.PlaceSearch({
            pageSize: 10,
            pageIndex: 1,
            extensions: 'all',
          });
          const center = (AMap.LngLat && typeof AMap.LngLat === 'function')
            ? new AMap.LngLat(searchLng, searchLat)
            : [searchLng, searchLat] as any;
          let settled = false;
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(null);
            }
          }, 5000);

          placeSearch.searchNearBy(keyword, center, range.max, (status: string, result: any) => {
            if (settled) return;
            if (status === 'complete' && result?.poiList?.pois?.length) {
              const pois = (result.poiList.pois as any[])
                .filter((poi) => poi.id && !excludeIds.includes(String(poi.id)))
                .filter((poi) => {
                  const poiLocation = typeof poi.location === 'string'
                    ? poi.location
                    : `${poi.location?.lng},${poi.location?.lat}`;
                  const distanceMeters = calculateStraightDistanceByText(originLocation, poiLocation);
                  if (distanceMeters === null || distanceMeters < range.min || distanceMeters > range.max) {
                    return false;
                  }
                  if (fallbackCategory === 'all') {
                    return true;
                  }
                  const detectedCategory = detectCategoryKeyForPoi(poi);
                  return detectedCategory === fallbackCategory || isPoiCompatibleWithCategory(poi, fallbackCategory as AiCategoryKey);
                });

              if (pois.length > 0) {
                const pick = pois[Math.floor(Math.random() * Math.min(pois.length, 5))];
                const poiLocation = typeof pick.location === 'string'
                  ? pick.location
                  : `${pick.location?.lng},${pick.location?.lat}`;
                const distanceMeters = calculateStraightDistanceByText(originLocation, poiLocation);
                if (distanceMeters !== null) {
                  settled = true;
                  clearTimeout(timer);
                  resolve(buildClientResult(pick, distanceMeters));
                  return;
                }
              }
            }

            settled = true;
            clearTimeout(timer);
            resolve(null);
          });
        } catch {
          resolve(null);
        }
      });

      const serverFallbackPromise = (async (): Promise<BlindboxResult | null> => {
        try {
          const resp = await Promise.race([
            fetch('/api/poi/recommend', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                category: fallbackCategory,
                cityName: cityName || '北京',
                location: originLocation,
                distance: range.max,
                minDistance: range.min,
                excludeIds,
              }),
            }),
            new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
          ]);
          const json = resp ? await (resp as Response).json().catch(() => null) : null;
          if (resp && (resp as Response).ok && json?.success && json.data?.id) {
            return attachAiMeta(json.data as BlindboxResult, intent);
          }
        } catch {
          return null;
        }
        return null;
      })();

      const bestResult = await Promise.race([clientSearchPromise, serverFallbackPromise]);
      if (bestResult) {
        setLoadingText('✨ AI为你找到了一个好去处！');
        return bestResult;
      }

      const [clientResult, serverResult] = await Promise.all([clientSearchPromise, serverFallbackPromise]);
      return clientResult || serverResult;
    };

    try {
      setLoadingText('🔍 正在附近搜索匹配的地点...');
      const range = getDistanceRange();
      const history = getHistory();
      const excludeIds = history.map((item) => item.id).filter(Boolean);

      const AI_API_TIMEOUT = 8000;
      const aiApiPromise = fetch('/api/ai/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: currentAiQuery,
          category,
          location: currentLocation,
          cityName: cityName || '北京',
          distance: range.max,
          minDistance: range.min,
          excludeIds,
        }),
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), AI_API_TIMEOUT)
      );

      let resp: Response;
      try {
        resp = await Promise.race([aiApiPromise, timeoutPromise]) as Response;
      } catch {
        setLoadingText('🔍 AI响应慢，切换其他搜索...');
        return await tryFallbackSearch(currentLocation, range, excludeIds, baseIntent);
      }

      const json = await resp.json().catch(() => null);
      const data = json?.data;
      const resolvedIntent = resolveAiIntent(currentAiQuery, category, data?._intent);
      lastResolvedAiCategoryRef.current =
        resolvedIntent.primaryCategory !== 'all' ? resolvedIntent.primaryCategory : null;

      if (resp.ok && json?.success && data?.id) {
        setLoadingText('✨ AI为你找到了一个好去处！');
        return attachAiMeta(data as BlindboxResult, resolvedIntent);
      }

      const fallbackResult = await tryFallbackSearch(currentLocation, range, excludeIds, resolvedIntent);
      if (fallbackResult) {
        return fallbackResult;
      }

      setLoadingText('🎲 AI推荐不可用，随机推荐中...');
      return null;
    } catch (err) {
      console.error('[动画组件] AI推荐请求异常:', err);
      return null;
    }
  }, [cityName, distanceKey, category]);

  const getDefaultResult = (cat: string): BlindboxResult => {
    const base: BlindboxResult = {
      id: String(Date.now()),
      name: '未获取到真实店铺',
      location: '',
      address: '',
      city: cityName || '',
      district: '',
      type: '',
      tel: '',
      photos: [],
      rating: undefined,
      price: undefined,
      distance: '',
      category: getCategoryName(cat),
      categoryIcon: getCategoryIcon(cat),
      healingMessage: '未能从高德获取到真实数据，请检查网络与高德 Key 配置',
      navigationUrl: '',
    };
    return base;
  };

  // 加权随机选择算法
  const getWeightedRandomIndex = (pois: POIItem[], userLocation?: string): number => {
    if (pois.length === 0) return 0;
    if (pois.length === 1) return 0;

    // 计算每个POI的权重
    const weights = pois.map((poi) => {
      let weight = 1.0; // 基础权重

      // 1. 评分权重 (最高5分，权重: 0.1 * 评分)
      if (poi.rating && poi.rating > 0) {
        weight += poi.rating * 0.1; // 4.5分 => +0.45
      }

      // 2. 价格权重 (便宜优先，100元以下权重更高)
      if (poi.cost && poi.cost > 0) {
        if (poi.cost < 50) weight += 0.5; // 便宜
        else if (poi.cost < 100) weight += 0.3; // 中等
        else if (poi.cost < 200) weight += 0.1; // 较贵
        // 200元以上不额外加权
      }

      // 3. 距离权重 (如果用户位置已知)
      if (userLocation && poi.location) {
        try {
          const [lng1, lat1] = userLocation.split(',').map(Number);
          const [lng2, lat2] = poi.location.split(',').map(Number);
          const R = 6371000;
          const dLat = ((lat2 - lat1) * Math.PI) / 180;
          const dLng = ((lng2 - lng1) * Math.PI) / 180;
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          const dist = R * c;

          // 距离越近，权重越高
          if (dist < 1000) weight += 1.0; // 1公里内
          else if (dist < 3000) weight += 0.5; // 3公里内
          else if (dist < 5000) weight += 0.3; // 5公里内
        } catch (e) {
          // 距离计算失败，跳过
        }
      }

      // 4. 随机扰动，避免完全确定性
      weight += Math.random() * 0.2;

      return weight;
    });

    // 根据权重进行随机选择
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const random = Math.random() * totalWeight;

    let cumulativeWeight = 0;
    for (let i = 0; i < weights.length; i++) {
      cumulativeWeight += weights[i];
      if (random < cumulativeWeight) {
        return i;
      }
    }

    // 兜底：返回最后一个
    return weights.length - 1;
  };

  // 保存 fetch 函数到 ref，供 useEffect 使用最新版本
  const fetchAiRecommendationRef = useRef(fetchAiRecommendation);
  fetchAiRecommendationRef.current = fetchAiRecommendation;
  const fetchRecommendationRef = useRef(fetchRecommendation);
  fetchRecommendationRef.current = fetchRecommendation;

  // 主动画控制逻辑
  useEffect(() => {
    // 当 isOpen 变为 false 时，立即重置状态
    if (!isOpen) {
      console.log('[动画组件] isOpen 变为 false，重置状态');
      resetState();
      return;
    }

    // 只有当 isOpen 从 false 变为 true 时才开始动画
    if (prevIsOpenRef.current) {
      // 动画已经在运行中，忽略重复触发
      return;
    }

    prevIsOpenRef.current = true;

    // 防止严格模式下重复执行
    if (isAnimatingRef.current) return;
    isAnimatingRef.current = true;

    console.log('[动画组件] 开始动画流程');

    // 开始动画序列
    const runAnimation = async () => {
      try {
        // 抖动阶段
        setPhase('shake');
        setBoxShake(1);
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 检查是否还在运行（可能被用户取消）
        if (isAnimatingRef.current !== true) {
          console.log('[动画组件] 动画被中断');
          return;
        }

        // 发光阶段
        setPhase('glow');
        await new Promise(resolve => setTimeout(resolve, 800));

        if (isAnimatingRef.current !== true) return;

        // 爆炸阶段
        setPhase('explode');
        await new Promise(resolve => setTimeout(resolve, 500));

        if (isAnimatingRef.current !== true) return;

        // 加载阶段
        setPhase('loading');
        
        // AI 模式优先（通过 ref 读取最新值）
        if (isAiModeRef.current && aiQueryRef.current) {
          const aiResult = await fetchAiRecommendationRef.current();
          if (isAnimatingRef.current !== true) return;
          
          if (aiResult) {
            safeOnComplete(aiResult);
            setPhase('done');
            isAnimatingRef.current = false;
            return;
          }
          // AI 失败，内部回退到随机模式
          setLoadingText('🤖 AI暂时不可用，切换为随机模式...');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          // 清除 AI 模式标记，再按 AI 已解析出的主分类执行普通推荐
          onAiFallbackRef.current?.();
          await fetchRecommendationRef.current(lastResolvedAiCategoryRef.current || undefined);
        } else {
          await fetchRecommendationRef.current();
        }
      } catch (err) {
        if (isAnimatingRef.current !== true) return;
        console.error('[动画组件] fetchRecommendation 异常:', err);
        const defaultResult = getDefaultResult(category);
        try {
          safeOnComplete(defaultResult);
        } catch (e) {
          console.error('[动画组件] 无法完成回调:', e);
        }
        setPhase('done');
      } finally {
        if (isAnimatingRef.current) {
          isAnimatingRef.current = false;
        }
      }
    };

    runAnimation();
  }, [isOpen, resetState, category, safeOnComplete]);


  // 渲染盒子形状
  const renderBox = () => {
    const { shape, borderRadius, colors: skinColors } = currentSkin;
    
    const boxStyle = {
      width: shape === 'capsule' ? '100px' : shape === 'cylinder' ? '120px' : '110px',
      height: shape === 'capsule' ? '160px' : shape === 'cylinder' ? '140px' : '100px',
      borderRadius: borderRadius,
      background: generateGradient(currentSkin, 'body'),
      boxShadow: generateBoxShadow(currentSkin, 1),
      transform: phase === 'shake' ? `rotate(${(boxShake % 2 === 0 ? 1 : -1) * 8}deg)` : 
                  phase === 'explode' ? 'scale(1.3)' : 'scale(1)',
      opacity: phase === 'explode' ? 0 : 1,
      transition: 'all 0.3s ease',
    };

    const lidStyle = {
      position: 'absolute' as const,
      top: '-15px',
      left: '50%',
      transform: `translateX(-50%) ${phase === 'glow' ? 'translateY(-5px)' : ''}`,
      width: shape === 'capsule' ? '80px' : shape === 'cylinder' ? '100px' : '90px',
      height: '30px',
      borderRadius: borderRadius,
      background: generateGradient(currentSkin, 'top'),
      boxShadow: `0 -5px 20px ${currentSkin.colors.glow}33`,
    };

    switch (shape) {
      case 'cylinder':
        return (
          <div className="relative" style={boxStyle}>
            <div style={lidStyle} />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">{icon}</span>
            </div>
          </div>
        );

      case 'capsule':
        return (
          <div 
            className="relative"
            style={{
              width: '100px',
              height: '160px',
              borderRadius: '50px',
              background: generateGradient(currentSkin, 'body'),
              boxShadow: generateBoxShadow(currentSkin, 1),
              transform: phase === 'shake' ? `rotate(${(boxShake % 2 === 0 ? 1 : -1) * 8}deg)` : 
                          phase === 'explode' ? 'scale(1.3)' : 'scale(1)',
              opacity: phase === 'explode' ? 0 : 1,
              transition: 'all 0.3s ease',
            }}
          >
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-white/30" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">{icon}</span>
            </div>
          </div>
        );

      case 'gem':
        return (
          <div className="relative" style={{
            width: '120px',
            height: '140px',
            transform: phase === 'shake' ? `rotate(${(boxShake % 2 === 0 ? 1 : -1) * 8}deg)` : 
                        phase === 'explode' ? 'scale(1.3)' : 'scale(1)',
            opacity: phase === 'explode' ? 0 : 1,
            transition: 'all 0.3s ease',
          }}>
            <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-lg">
              <defs>
                <linearGradient id={`animGemGrad-${skin}`} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor={skinColors.secondary} />
                  <stop offset="50%" stopColor={skinColors.primary} />
                  <stop offset="100%" stopColor={skinColors.secondary} />
                </linearGradient>
              </defs>
              <polygon 
                points="50,0 100,30 100,90 50,120 0,90 0,30"
                fill={`url(#animGemGrad-${skin})`}
                stroke={skinColors.glow}
                strokeWidth="2"
              />
              <polygon points="50,10 85,35 85,75 50,100 15,75 15,35" fill="rgba(255,255,255,0.2)" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">{icon}</span>
            </div>
          </div>
        );

      case 'crystal':
        return (
          <div className="relative" style={{
            width: '100px',
            height: '120px',
            transform: phase === 'shake' ? `rotate(${(boxShake % 2 === 0 ? 1 : -1) * 8}deg)` : 
                        phase === 'explode' ? 'scale(1.3)' : 'scale(1)',
            opacity: phase === 'explode' ? 0 : 1,
            transition: 'all 0.3s ease',
          }}>
            <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-lg">
              <polygon
                points="50,0 100,30 100,90 50,120 0,90 0,30"
                fill={generateGradient(currentSkin, 'body')}
                stroke={skinColors.glow}
                strokeWidth="2"
              />
              <polygon points="50,10 85,35 85,75 50,100 15,75 15,35" fill="rgba(255,255,255,0.3)" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-4xl">{icon}</span>
            </div>
          </div>
        );

      default:
        return (
          <div className="relative">
            <div style={boxStyle}>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl">{icon}</span>
              </div>
            </div>
            <div style={lidStyle} />
          </div>
        );
    }
  };

  if (!isOpen && phase === 'idle') return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)' }}
    >
      {/* 星星背景 */}
      {stars.map((star) => (
        <div
          key={star.id}
          className="absolute rounded-full animate-pulse"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            background: colors.primary,
            opacity: star.opacity,
            animationDelay: `${star.id * 0.1}s`,
          }}
        />
      ))}

      {/* 内容区域 */}
      <div className="text-center">
        {/* 盒子 */}
        <div className="mb-8">
          {renderBox()}
        </div>

        {/* 发光效果 */}
        {phase === 'glow' && (
          <div 
            className="absolute inset-0 -m-20 rounded-full animate-pulse"
            style={{
              background: generateGlow(currentSkin, 0.5),
            }}
          />
        )}

        {/* 分类名称 */}
        <h2 className="text-2xl font-bold mb-4" style={{ color: colors.primary }}>
          {categoryName}
        </h2>

        {/* 加载文字 */}
        {phase === 'loading' && (
          <p className="text-lg animate-pulse" style={{ color: '#fff' }}>
            {loadingText}
          </p>
        )}

        {/* 爆炸粒子效果 */}
        {phase === 'explode' && (
          <div className="relative w-40 h-40 mx-auto">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute w-3 h-3 rounded-full animate-explode"
                style={{
                  left: '50%',
                  top: '50%',
                  background: [colors.primary, colors.secondary, colors.glow, currentSkin.colors.glow][i % 4],
                  transform: `rotate(${i * 30}deg) translateX(${i % 2 === 0 ? '80px' : '60px'})`,
                  animationDelay: `${i * 0.05}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 样式 */}
      <style jsx global>{`
        @keyframes explode {
          0% { transform: rotate(var(--angle)) translateX(0); opacity: 1; }
          100% { transform: rotate(var(--angle)) translateX(120px); opacity: 0; }
        }
        .animate-explode {
          animation: explode 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

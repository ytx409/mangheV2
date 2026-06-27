'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import {
  MapPin,
  Locate,
  X,
  Loader2,
  Sparkles,
  User,
} from 'lucide-react';
import type { CityInfo, Category, FilterOptions, BlindboxResult } from '@/hooks/use-blindbox';
import { useBlindboxSkin } from '@/hooks/use-blindbox';
import type { POIItem } from '@/lib/amap';
import { CATEGORY_TYPES } from '@/lib/amap-config';
import { isPoiCompatibleWithCategory, resolvePoiCategoryForSources, type CategoryKey as PoiCategoryKey } from '@/lib/poi-category';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import BlindboxAnimation from './blindbox-animation';
import BlindboxPreview from './blindbox-preview';

interface BlindboxHomeProps {
  currentCity: CityInfo;
  onCityChange: (city: CityInfo) => void;
  selectedCategory: Category;
  onCategoryChange: (category: Category) => void;
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  onOpenBlindbox: () => void;
  isOpening: boolean;
  onShowResult: (result: BlindboxResult) => void;
  result: BlindboxResult | null;
  onShowProfile: () => void;
}

const CATEGORIES: { key: Category; name: string; icon: string; desc: string; color: string }[] = [
  { key: 'food', name: '美食', icon: '🍜', desc: '餐厅、火锅、烧烤', color: '#FF6B6B' },
  { key: 'play', name: '游玩', icon: '🎮', desc: '景点、公园、KTV', color: '#4ECDC4' },
  { key: 'leisure', name: '休闲', icon: '🎬', desc: '影院、展览、书店', color: '#9B59B6' },
  { key: 'all', name: '全能', icon: '🎁', desc: '随机所有品类', color: '#FFB347' },
];

// 距离选项
const DISTANCE_OPTIONS = [
  { key: 'any', label: '不限', value: 5000 },
  { key: 'within1', label: '1公里以内', value: 1000 },
  { key: '1to3', label: '1~3公里', value: 3000 },
  { key: '3to5', label: '3~5公里', value: 5000 },
];

const DEFAULT_DISTANCE_KEY = 'any';


interface Suggestion {
  id: string;
  name: string;
  district: string;
  address: string;
  location: string;
  type: string;
}

interface ReverseLocationData {
  formattedAddress?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  location?: string;
  township?: string;
  neighborhood?: string;
  building?: string;
  nearestPoiName?: string;
}

const EMPTY_PLACES_BY_CATEGORY: Record<Category, POIItem[]> = {
  food: [],
  play: [],
  leisure: [],
  all: [],
};

function dedupeAndSortPois(items: POIItem[] = []) {
  const seen = new Set<string>();
  return items
    .filter((item) => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort((a, b) => {
      const da = typeof a.distance === 'number' ? a.distance : Number.MAX_SAFE_INTEGER;
      const db = typeof b.distance === 'number' ? b.distance : Number.MAX_SAFE_INTEGER;
      return da - db;
    });
}

function buildCategorizedPlaces(base: Partial<Record<Category, POIItem[]>>) {
  const categorized: Record<Category, POIItem[]> = {
    food: dedupeAndSortPois(base.food || []),
    play: dedupeAndSortPois(base.play || []),
    leisure: dedupeAndSortPois(base.leisure || []),
    all: [],
  };

  const seen = new Set<string>();
  for (const key of ['food', 'play', 'leisure'] as const) {
    for (const poi of categorized[key]) {
      if (!poi?.id || seen.has(poi.id)) continue;
      seen.add(poi.id);
      categorized.all.push(poi);
    }
  }

  return categorized;
}

function reconcileCategorizedPlaces(base: Partial<Record<Category, POIItem[]>>) {
  const merged = new Map<string, { item: POIItem; sources: Set<PoiCategoryKey> }>();

  for (const category of ['food', 'play', 'leisure'] as const) {
    for (const item of base[category] || []) {
      if (!item?.id) continue;
      const existing = merged.get(item.id);
      if (existing) {
        existing.sources.add(category);
        if (
          typeof item.distance === 'number' &&
          (!Number.isFinite(existing.item.distance) || Number(item.distance) < Number(existing.item.distance))
        ) {
          existing.item = item;
        }
      } else {
        merged.set(item.id, {
          item,
          sources: new Set([category]),
        });
      }
    }
  }

  const normalized: Record<Category, POIItem[]> = {
    food: [],
    play: [],
    leisure: [],
    all: [],
  };

  for (const { item, sources } of merged.values()) {
    const sourceList = Array.from(sources);
    const resolvedCategory = resolvePoiCategoryForSources(item, sourceList);
    if (!isPoiCompatibleWithCategory(item, resolvedCategory)) {
      continue;
    }
    normalized[resolvedCategory].push(item);
  }

  return buildCategorizedPlaces(normalized);
}

export default function BlindboxHome({
  currentCity,
  onCityChange,
  selectedCategory,
  onCategoryChange,
  filters,
  onFiltersChange,
  onOpenBlindbox,
  isOpening,
  onShowResult,
  result,
  onShowProfile,
}: BlindboxHomeProps) {
  const { skin, skinClass, changeSkin } = useBlindboxSkin();
  const [showFilters, setShowFilters] = useState(false);
  const [showSkinPicker, setShowSkinPicker] = useState(false);
  
  // 等待AMap加载完成
  const [amapLoaded, setAmapLoaded] = useState(false);

  // 等待AMap加载完成，带超时
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let retryCount = 0;
    const maxRetries = 10; // 2秒超时 (200ms * 10)

    const checkAMap = () => {
      console.log('检查高德地图加载状态...尝试', retryCount + 1);
      if (window.AMap && window.AMap.AutoComplete && window.AMap.PlaceSearch && window.AMap.Geolocation) {
        console.log('高德地图加载成功');
        setAmapLoaded(true);
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          console.log('高德地图未加载，200ms后重试');
          timeoutId = setTimeout(checkAMap, 200);
        } else {
          console.warn('高德地图加载超时，使用降级模式');
          // 降级模式：使用模拟数据
          setAmapLoaded(false);
        }
      }
    };

    checkAMap();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, []);
  const [selectedLocation, setSelectedLocation] = useState<{
    name: string;
    location: string;
    address: string;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const persistCityInfo = useCallback((city: CityInfo) => {
    onCityChange(city);
    try {
      localStorage.setItem(STORAGE_KEYS.currentCity, JSON.stringify(city));
    } catch {
      // ignore persistence failures
    }
  }, [onCityChange]);

  const updateCurrentCity = useCallback((cityName?: string, adcode?: string) => {
    const normalizedName = String(cityName || '').trim();
    const normalizedAdcode = String(adcode || '').trim();
    if (!normalizedName && !normalizedAdcode) return;

    const nextCity: CityInfo = {
      name: normalizedName || currentCity.name,
      adcode: normalizedAdcode || currentCity.adcode,
    };

    if (nextCity.name !== currentCity.name || nextCity.adcode !== currentCity.adcode) {
      persistCityInfo(nextCity);
    }
  }, [currentCity.adcode, currentCity.name, persistCityInfo]);

  const reverseLookupLocation = useCallback(async (location: string): Promise<ReverseLocationData | null> => {
    const loc = String(location || '').trim();
    if (!loc) return null;

    try {
      const url = new URL('/api/location/reverse', window.location.origin);
      url.searchParams.set('location', loc);

      const resp = await fetch(url.toString(), { cache: 'no-store' });
      const json = await resp.json().catch(() => null);
      if (resp.ok && json?.success && json?.data) {
        return json.data as ReverseLocationData;
      }
    } catch (error) {
      console.warn('[定位] 逆地理编码失败:', error);
    }

    return null;
  }, []);

  const applyResolvedLocation = useCallback(async (input: {
    location: string;
    name?: string;
    address?: string;
    cityName?: string;
    adcode?: string;
  }) => {
    const reverseData = await reverseLookupLocation(input.location);
    const isGenericLocationName = (value?: string) => {
      const normalized = String(value || '').trim();
      return !normalized || normalized === '当前位置' || normalized === '当前定位';
    };

    const fallbackName =
      reverseData?.nearestPoiName ||
      reverseData?.building ||
      reverseData?.neighborhood ||
      reverseData?.township ||
      reverseData?.district ||
      reverseData?.city ||
      reverseData?.province ||
      '当前位置';

    const cityName = input.cityName || reverseData?.city || reverseData?.province;
    const adcode = input.adcode || reverseData?.adcode;
    const address = isGenericLocationName(input.address)
      ? (reverseData?.formattedAddress || fallbackName)
      : (input.address || reverseData?.formattedAddress || input.name || '当前位置');
    const displayName = isGenericLocationName(input.name) ? fallbackName : String(input.name).trim();

    setSelectedLocation({
      name: displayName,
      location: input.location,
      address,
    });

    updateCurrentCity(cityName, adcode);
  }, [reverseLookupLocation, updateCurrentCity]);

  const resolveLocationFromText = useCallback(async (text: string) => {
    const q = String(text || '').trim();
    if (!q) return null;

    const url = new URL('/api/location/geocode', window.location.origin);
    url.searchParams.set('address', q);
    const isAdministrativeAreaQuery = /[省市县区自治区自治州地区盟]/.test(q);
    if (!isAdministrativeAreaQuery && currentCity?.name) {
      url.searchParams.set('city', currentCity.name);
    }

    try {
      const resp = await fetch(url.toString());
      const json = await resp.json().catch(() => null);
      if (resp.ok && json?.success && json?.data?.location) {
        return json.data as { location: string; formattedAddress?: string; province?: string; city?: string; district?: string; adcode?: string; level?: string };
      }
    } catch {
    }

    if (!amapLoaded) return null;
    const AMap = (window as any).AMap;
    if (!AMap?.PlaceSearch) return null;

    const loc = await new Promise<string | null>((resolve) => {
      const placeSearch = new AMap.PlaceSearch({
        pageSize: 1,
        pageIndex: 1,
        extensions: 'base',
      });
      placeSearch.search(q, (status: string, result: any) => {
        if (status === 'complete' && result?.poiList?.pois?.length) {
          const p = result.poiList.pois[0];
          const lng = p?.location?.lng;
          const lat = p?.location?.lat;
          if (typeof lng === 'number' && typeof lat === 'number') {
            resolve(`${lng},${lat}`);
            return;
          }
        }
        resolve(null);
      });
    });

    if (!loc) return null;
    return { location: loc, formattedAddress: q };
  }, [currentCity?.name, amapLoaded]);

  // 店铺数据 - 按分类分组，用于开盲盒
  const [placesByCategory, setPlacesByCategory] = useState<Record<Category, POIItem[]>>({
    food: [],
    play: [],
    leisure: [],
    all: [],
  });
  const [isLoadingPlaces, setIsLoadingPlaces] = useState(false);
  const [isHydratingPlaces, setIsHydratingPlaces] = useState(false);
  const [merchantCache, setMerchantCache] = useState<Record<Category, POIItem[]> | null>(null);

  // 盲盒动画状态
  const [showAnimation, setShowAnimation] = useState(false);
  const [animationCategory, setAnimationCategory] = useState<Category>('all');
  const [pendingOpenAnimation, setPendingOpenAnimation] = useState(false);

  // AI 智能推荐状态
  const [aiQuery, setAiQuery] = useState('');
  const [isAiMode, setIsAiMode] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  // 轮播 placeholder
  const placeholderExamples = [
    '我想找一个适合拍照的地方',
    '推荐附近适合跑步的公园',
    '预算50元以内适合约会的地点',
    '附近有没有安静的咖啡馆？',
    '想吃火锅，人均100左右',
  ];
  useEffect(() => {
    if (aiQuery) return; // 已输入文字时不轮播
    const timer = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholderExamples.length);
    }, 3000);
    return () => clearInterval(timer);
  }, [aiQuery]);
  
  const searchInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const searchTimerRef = useRef<number | null>(null);
  const openingRef = useRef(false); // 防止按钮重复点击
  const previewRequestIdRef = useRef(0);
  const previewPoolCacheRef = useRef<Map<string, Record<Category, POIItem[]>>>(new Map());
  const shortRangeHydratedKeysRef = useRef<Set<string>>(new Set());
  const [suggestionPortalPos, setSuggestionPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const fetchSuggestions = useCallback(async (keywords: string) => {
    if (!keywords.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      const serverFallback = async () => {
        const url = new URL('/api/location/suggest', window.location.origin);
        url.searchParams.set('keywords', keywords.trim());
        if (currentCity.name) {
          url.searchParams.set('city', currentCity.name);
        }

        const resp = await fetch(url.toString(), { cache: 'no-store' });
        const json = await resp.json().catch(() => null);
        const nextSuggestions = resp.ok && json?.success
          ? (json?.data?.suggestions || [])
          : [];

        setSuggestions(nextSuggestions);
        setShowSuggestions(nextSuggestions.length > 0);
        if (nextSuggestions.length === 0) {
          setSuggestionPortalPos(null);
        }
      };

      if (!amapLoaded) {
        await serverFallback();
        return;
      }

      const AMap = (window as any).AMap;
      if (!AMap || !AMap.AutoComplete) {
        console.warn('高德地图 AutoComplete 未加载，切换服务端搜索建议');
        await serverFallback();
        return;
      }

      // 创建AutoComplete实例
      const keywordTrimmed = keywords.trim();
      const isCityLevelQuery = /[省市县区自治区自治州地区盟]/.test(keywordTrimmed) && keywordTrimmed.length <= 20;
      const autoCompleteCity = isCityLevelQuery ? '' : (currentCity.name || '');
      const autoComplete = new AMap.AutoComplete({
        city: autoCompleteCity,
        citylimit: !isCityLevelQuery,
        datatype: 'poi'
      });

      // 使用Promise包装回调
      await new Promise<void>((resolve, reject) => {
        autoComplete.search(keywords.trim(), (status: string, result: any) => {
          try {
            console.log('AutoComplete search result:', status, result);
            
            if (status === 'complete' && result.tips && result.tips.length > 0) {
              const suggestions: Suggestion[] = result.tips
                .filter((tip: any) => tip.name && (tip.location || tip.address || tip.district))
                .map((tip: any) => ({
                  id: tip.id || tip.name,
                  name: tip.name,
                  district: tip.district || '',
                  address: tip.address || '',
                  location: tip.location ? `${tip.location.lng},${tip.location.lat}` : '',
                  type: tip.type || '',
                }));
              
              console.log('Filtered suggestions:', suggestions);
              setSuggestions(suggestions);
              setShowSuggestions(suggestions.length > 0);
              // update portal position immediately after suggestions are set
              setTimeout(() => {
                if (searchInputRef.current) {
                  const rect = searchInputRef.current.getBoundingClientRect();
                  setSuggestionPortalPos({ top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX, width: rect.width });
                }
              }, 0);
              resolve();
            } else {
              console.log('No suggestions found');
              setSuggestions([]);
              setShowSuggestions(false);
              setSuggestionPortalPos(null);
              resolve();
            }
          } catch (error) {
            console.error('处理搜索结果失败:', error);
            reject(error);
          }
        });
      });
    } catch (error) {
      console.error('获取地址建议失败:', error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  }, [currentCity.name, amapLoaded]);

  // 保持 portal 位置随窗口和滚动更新
  const updateSuggestionPortalPosition = useCallback(() => {
    if (!searchInputRef.current) return;
    const rect = searchInputRef.current.getBoundingClientRect();
    setSuggestionPortalPos({ top: rect.bottom + window.scrollY + 8, left: rect.left + window.scrollX, width: rect.width });
  }, []);

  useEffect(() => {
    if (!showSuggestions) return;
    updateSuggestionPortalPosition();
    const onResize = () => updateSuggestionPortalPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [showSuggestions, updateSuggestionPortalPosition, suggestions.length]);

  // 按位置预拉取并缓存完整候选池，切换距离时只做本地筛选
  const fetchAndCategorizeNearbyPlaces = useCallback(async (
    location: string
  ) => {
    const requestId = ++previewRequestIdRef.current;
    const normalizedLocation = location.trim();
    const cached = previewPoolCacheRef.current.get(normalizedLocation);
    if (cached) {
      setIsLoadingPlaces(false);
      setIsHydratingPlaces(false);
      setMerchantCache(cached);
      setPlacesByCategory(cached);
      return;
    }

    const searchRadius = 5000;
    setIsLoadingPlaces(true);
    setIsHydratingPlaces(false);
    setMerchantCache(null);
    setPlacesByCategory(EMPTY_PLACES_BY_CATEGORY);
    const commitClientSnapshot = (
      nextBase: Partial<Record<Category, POIItem[]>>,
      hydrating: boolean
    ) => {
      if (requestId !== previewRequestIdRef.current) {
        return buildCategorizedPlaces(nextBase);
      }

      const snapshot = reconcileCategorizedPlaces(nextBase);
      previewPoolCacheRef.current.set(normalizedLocation, snapshot);
      setMerchantCache(snapshot);
      setPlacesByCategory(snapshot);
      setIsHydratingPlaces(hydrating);
      return snapshot;
    };

    const fetchFromAMapClient = async (): Promise<Record<Category, POIItem[]>> => {
      if (!amapLoaded) {
        throw new Error('高德前端搜索不可用');
      }

        const AMap = (window as any).AMap;
        if (!AMap?.PlaceSearch) {
          throw new Error('高德地图 PlaceSearch 未加载');
        }

        const [lng, lat] = normalizedLocation.split(',').map(Number);
        const pageSize = 25;
        const toRadians = (deg: number) => (deg * Math.PI) / 180;
        const calculateDistance = (poiLocation?: string) => {
          if (!poiLocation || !poiLocation.includes(',')) return undefined;
          const [poiLng, poiLat] = poiLocation.split(',').map(Number);
          if (!Number.isFinite(poiLng) || !Number.isFinite(poiLat)) return undefined;
          const R = 6371000;
          const dLat = toRadians(poiLat - lat);
          const dLng = toRadians(poiLng - lng);
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat)) * Math.cos(toRadians(poiLat)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return R * c;
        };

        const metersPerDegLat = 111320;
        const metersPerDegLng = Math.max(1, metersPerDegLat * Math.cos((lat * Math.PI) / 180));
        const buildPoint = (distance: number, bearingDeg: number) => {
          const rad = (bearingDeg * Math.PI) / 180;
          return {
            lng: lng + (distance * Math.sin(rad)) / metersPerDegLng,
            lat: lat + (distance * Math.cos(rad)) / metersPerDegLat,
          };
        };

      const outerRingCenters = [0, 45, 90, 135, 180, 225, 270, 315].map((bearing) => {
        const point = buildPoint(3800, bearing);
        return { ...point, radius: 1800, pages: 1 };
      });
      const coarseCenters = [
        { lng, lat, radius: searchRadius, pages: 2 },
        ...outerRingCenters,
      ];
      const nearFocusedCenters = [
        { lng, lat, radius: 1000, pages: 4, stageLabel: 'core-1000' },
        { lng, lat, radius: 3000, pages: 4, stageLabel: 'core-3000' },
        ...[45, 135, 225, 315].map((bearing) => {
          const point = buildPoint(1200, bearing);
          return { ...point, radius: 1000, pages: 2, stageLabel: `inner-ring-${bearing}` };
        }),
      ];

        const buildKeywordPlan = (categoryKey: 'food' | 'play' | 'leisure') => {
          const defaults: Record<'food' | 'play' | 'leisure', string[]> = {
            food: ['餐厅', '美食', '饭店', '火锅', '烧烤', '小吃', '快餐', '面馆', '咖啡', '甜品', '自助餐', '海鲜'],
            play: ['台球厅', '台球馆', '足球场', '篮球场', '羽毛球馆', '网球场', '保龄球馆', '攀岩馆', '射箭馆', '卡丁车', '电竞馆', '景点', '公园', '游乐场', 'KTV'],
            leisure: ['电影院', '咖啡馆', '书店', '茶馆', '酒吧', '博物馆', '展览', 'SPA', '美甲', '花店', '剧院', '图书馆'],
          };

          const configured = Array.isArray(CATEGORY_TYPES[categoryKey].keywords)
            ? CATEGORY_TYPES[categoryKey].keywords.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          const exactDefaults: Record<'food' | 'play' | 'leisure', string[]> = {
            food: ['火锅', '烧烤', '面馆', '咖啡', '甜品', '自助餐', '海鲜', '小吃'],
            play: ['台球厅', '台球馆', '足球场', '篮球场', '羽毛球馆', '网球场', '保龄球馆', '攀岩馆', '射箭馆', '卡丁车', '电竞馆', '游泳馆', '乒乓球馆'],
            leisure: ['电影院', '咖啡馆', '书店', '茶馆', '酒吧', '博物馆', '展览', 'SPA', '美甲', '花店', '剧院', '图书馆'],
          };
          const broadDefaults: Record<'food' | 'play' | 'leisure', string[]> = {
            food: ['餐厅', '美食', '饭店', '快餐'],
            play: ['公园', '景点', '游乐场', '运动', '健身', '电玩', '桌游', '密室', 'KTV', '运动场馆', '体育馆', '球馆'],
            leisure: ['休闲', '咖啡', '展馆', '生活'],
          };

          const pool = Array.from(new Set([
            ...configured,
            ...CATEGORY_TYPES[categoryKey].keywords,
            ...defaults[categoryKey],
          ])).filter(Boolean);

          const exact = Array.from(new Set([
            ...exactDefaults[categoryKey],
            ...pool.slice(0, 8),
          ]));
          const broad = Array.from(new Set([
            ...broadDefaults[categoryKey],
            ...pool.filter((item) => !exact.includes(item)).slice(0, 8),
          ]));
          const batches: string[] = [];
          for (let i = 0; i < Math.min(pool.length, 15); i += 3) {
            const part = pool.slice(i, i + 3);
            if (part.length > 0) {
              batches.push(part.join('|'));
            }
          }

          return {
            exact,
            broad,
            batches,
            nearKeywords: Array.from(new Set([
              ...exact.slice(0, categoryKey === 'play' ? 8 : 5),
              ...broad.slice(0, categoryKey === 'play' ? 5 : 3),
            ])),
            quickKeywords: Array.from(new Set([
              ...broad.slice(0, 3),
              ...exact.slice(0, 2),
            ])),
            centerKeywords: Array.from(new Set([
              ...exact.slice(0, 5),
              ...broad.slice(0, 3),
            ])),
            gridKeywords: Array.from(new Set([
              ...exact.slice(0, 6),
              ...broad.slice(0, 2),
            ])),
            cityKeywords: Array.from(new Set([
              ...exact.slice(0, 4),
              ...broad.slice(0, 4),
            ])),
          };
        };

        const buildGridCenters = () => {
          const offsets = [-3200, -1600, 0, 1600, 3200];
          const centers: Array<{ lng: number; lat: number; radius: number; pages: number }> = [];
          const seen = new Set<string>();

          for (const offsetLat of offsets) {
            for (const offsetLng of offsets) {
              const distance = Math.sqrt(offsetLat * offsetLat + offsetLng * offsetLng);
              if (distance > searchRadius + 900) continue;

              const nextLng = lng + offsetLng / metersPerDegLng;
              const nextLat = lat + offsetLat / metersPerDegLat;
              const key = `${nextLng.toFixed(6)},${nextLat.toFixed(6)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              centers.push({
                lng: nextLng,
                lat: nextLat,
                radius: distance >= 2800 ? 1500 : 1800,
                pages: distance >= 2800 ? 1 : 2,
              });
            }
          }

          return centers.sort((a, b) => {
            const distA = Math.hypot((a.lng - lng) * metersPerDegLng, (a.lat - lat) * metersPerDegLat);
            const distB = Math.hypot((b.lng - lng) * metersPerDegLng, (b.lat - lat) * metersPerDegLat);
            return distB - distA;
          });
        };

        const gridCenters = buildGridCenters();
        const getDistanceBucket = (distance?: number) => {
          if (!Number.isFinite(distance)) return 'unknown';
          if ((distance as number) <= 1000) return 'within1';
          if ((distance as number) <= 3000) return '1to3';
          if ((distance as number) <= 5000) return '3to5';
          return 'out';
        };

        const searchByCategory = async (
          categoryKey: 'food' | 'play' | 'leisure',
          onProgress?: (items: POIItem[], hydrating: boolean) => void
        ): Promise<POIItem[]> => {
          const results: POIItem[] = [];
          const seen = new Set<string>();
          const keywordPlan = buildKeywordPlan(categoryKey);
          const cityName = currentCity?.name || '北京';
          let lastReportedCount = 0;
          const stageStats: Record<string, { total: number; within1: number; oneto3: number; threeto5: number }> = {};
          const suspiciousSamples: Array<{
            id: string;
            name: string;
            type: string;
            typecode?: string;
            distance?: number;
            assignedCategory: string;
            stage: string;
          }> = [];

          const addPois = (pois: any[], stageLabel: string) => {
            let added = 0;
            if (!stageStats[stageLabel]) {
              stageStats[stageLabel] = { total: 0, within1: 0, oneto3: 0, threeto5: 0 };
            }
            for (const poi of pois) {
              const poiLocation = poi.location
                ? typeof poi.location === 'string'
                  ? poi.location
                  : `${poi.location.lng},${poi.location.lat}`
                : '';
              const item: POIItem = {
                id: poi.id,
                name: poi.name,
                location: poiLocation,
                address: poi.address || '',
                province: poi.province || '',
                city: poi.city || '',
                district: poi.district || '',
                type: poi.type || '',
                typecode: poi.typecode || '',
                tel: poi.tel,
                photos: poi.photos || [],
                rating: poi.biz_ext?.rating ? Number(poi.biz_ext.rating) : undefined,
                cost: poi.biz_ext?.cost ? Number(poi.biz_ext.cost) : undefined,
                distance: calculateDistance(poiLocation),
                remark: poi.remark || '',
              };
              const resolvedCategory = resolvePoiCategoryForSources(item, [categoryKey]);
              if (
                item.id &&
                !seen.has(item.id) &&
                typeof item.distance === 'number' &&
                item.distance <= searchRadius &&
                isPoiCompatibleWithCategory(item, categoryKey) &&
                resolvedCategory === categoryKey
              ) {
                seen.add(item.id);
                results.push(item);
                added++;
                const bucket = getDistanceBucket(item.distance);
                stageStats[stageLabel].total += 1;
                if (bucket === 'within1') stageStats[stageLabel].within1 += 1;
                if (bucket === '1to3') stageStats[stageLabel].oneto3 += 1;
                if (bucket === '3to5') stageStats[stageLabel].threeto5 += 1;
                const normalizedType = String(item.type || '');
                const suspicious =
                  resolvedCategory !== categoryKey ||
                  (categoryKey === 'food' && /(电影院|书店|茶馆|酒吧|博物馆|展览|spa|美甲|花店|公园|景点|游乐|球馆|足球|篮球|健身|ktv)/i.test(normalizedType)) ||
                  (categoryKey === 'play' && /(中餐|西餐|餐饮|火锅|烧烤|面馆|甜品|咖啡厅|咖啡馆|书店|茶馆|酒吧|博物馆|展览|spa|美甲|花店)/i.test(normalizedType)) ||
                  (categoryKey === 'leisure' && /(中餐|西餐|餐饮|火锅|烧烤|面馆|甜品|球馆|足球|篮球|羽毛球|网球|保龄球|攀岩|卡丁车|射箭|ktv)/i.test(normalizedType));
                if (suspicious && suspiciousSamples.length < 15) {
                  suspiciousSamples.push({
                    id: item.id,
                    name: item.name,
                    type: item.type,
                    typecode: item.typecode,
                    distance: item.distance,
                    assignedCategory: categoryKey,
                    stage: stageLabel,
                  });
                }
              }
            }

            return added;
          };

          const reportProgress = (hydrating: boolean) => {
            if (!onProgress || results.length === 0 || results.length === lastReportedCount) {
              return;
            }

            lastReportedCount = results.length;
            onProgress(
              [...results].sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0)),
              hydrating
            );
          };

          const runNearbySearch = async (params: {
            keyword: string;
            center: { lng: number; lat: number; radius: number };
            pages: number;
            stageLabel: string;
          }) => {
            let totalAdded = 0;
            for (let page = 1; page <= params.pages; page++) {
              if (requestId !== previewRequestIdRef.current) return 0;

              const pageAdded = await new Promise<number>((resolve) => {
                const timer = setTimeout(() => resolve(0), 6000);
                const placeSearch = new AMap.PlaceSearch({
                  pageSize,
                  pageIndex: page,
                  extensions: 'all',
                });

                placeSearch.searchNearBy(
                  params.keyword,
                  new AMap.LngLat(params.center.lng, params.center.lat),
                  params.center.radius,
                  (status: string, result: any) => {
                    clearTimeout(timer);
                    if (status === 'complete' && result?.poiList?.pois?.length) {
                      resolve(addPois(result.poiList.pois as any[], `${params.stageLabel}:page${page}`));
                    } else {
                      resolve(0);
                    }
                  }
                );
              });

              totalAdded += pageAdded;
              if (pageAdded === 0) {
                break;
              }
            }

            return totalAdded;
          };

          const runCitySearch = async (keyword: string, pages: number) => {
            let totalAdded = 0;
            for (let page = 1; page <= pages; page++) {
              if (requestId !== previewRequestIdRef.current) return 0;

              const pageAdded = await new Promise<number>((resolve) => {
                const timer = setTimeout(() => resolve(0), 6000);
                const placeSearch = new AMap.PlaceSearch({
                  city: cityName,
                  citylimit: true,
                  pageSize,
                  pageIndex: page,
                  extensions: 'all',
                });

                placeSearch.search(keyword, (status: string, result: any) => {
                  clearTimeout(timer);
                  if (status === 'complete' && result?.poiList?.pois?.length) {
                    resolve(addPois(result.poiList.pois as any[], `city:${keyword}:page${page}`));
                  } else {
                    resolve(0);
                  }
                });
              });

              totalAdded += pageAdded;
              if (pageAdded === 0) {
                break;
              }
            }

            return totalAdded;
          };

          for (const center of nearFocusedCenters) {
            for (const keyword of keywordPlan.nearKeywords) {
              const added = await runNearbySearch({
                keyword,
                center,
                pages: categoryKey === 'play' ? Math.max(center.pages, 5) : center.pages,
                stageLabel: center.stageLabel,
              });
              if (added > 0) {
                reportProgress(true);
              }
            }
          }

          reportProgress(true);

          for (const center of coarseCenters) {
            const phaseKeywords = center.radius >= searchRadius
              ? keywordPlan.quickKeywords
              : keywordPlan.centerKeywords;
            for (const keyword of phaseKeywords) {
              const added = await runNearbySearch({
                keyword,
                center,
                pages: center.pages,
                stageLabel: `nearby:${keyword}:${center.radius}`,
              });
              if (added > 0) {
                reportProgress(true);
              }
            }
          }

          reportProgress(true);

          for (const center of gridCenters) {
            for (const keyword of keywordPlan.gridKeywords) {
              const added = await runNearbySearch({
                keyword,
                center,
                pages: center.pages,
                stageLabel: `grid:${keyword}:${center.radius}`,
              });
              if (added > 0) {
                reportProgress(true);
              }
            }
          }

          reportProgress(true);

          for (const keyword of keywordPlan.cityKeywords) {
            const added = await runCitySearch(keyword, 4);
            if (added > 0) {
              reportProgress(true);
            }
          }

          for (const keyword of keywordPlan.batches.slice(0, 4)) {
            const added = await runCitySearch(keyword, 2);
            if (added > 0) {
              reportProgress(true);
            }
          }

          reportProgress(false);
          // #region debug-point E:client-category-stage-summary
          fetch('http://127.0.0.1:7777/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId: 'preview-short-ranges',
              runId: 'post-fix',
              hypothesisId: 'E',
              location: 'src/components/blindbox-home.tsx',
              msg: '[DEBUG] client category stage summary',
              data: {
                categoryKey,
                total: results.length,
                within1: results.filter((item) => Number(item.distance) >= 0 && Number(item.distance) <= 1000).length,
                oneto3: results.filter((item) => Number(item.distance) > 1000 && Number(item.distance) <= 3000).length,
                threeto5: results.filter((item) => Number(item.distance) > 3000 && Number(item.distance) <= 5000).length,
                stageStats,
                suspiciousSamples,
                topSamples: results.slice(0, 12).map((item) => ({
                  id: item.id,
                  name: item.name,
                  type: item.type,
                  typecode: item.typecode,
                  distance: item.distance,
                })),
              },
              ts: Date.now(),
            }),
          }).catch(() => {});
          // #endregion
          return results.sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
        };

        const collectedByCategory: Partial<Record<Category, POIItem[]>> = {
          food: [],
          play: [],
          leisure: [],
        };

        const commitProgress = (categoryKey: 'food' | 'play' | 'leisure', items: POIItem[], hydrating: boolean) => {
          collectedByCategory[categoryKey] = [...items];
          commitClientSnapshot(collectedByCategory, hydrating);
        };

        for (const categoryKey of ['food', 'play', 'leisure'] as const) {
          const items = await searchByCategory(categoryKey, (partialItems, hydrating) => {
            commitProgress(categoryKey, partialItems, hydrating);
          });
          commitProgress(categoryKey, items, categoryKey !== 'leisure');
        }

      return {
        food: collectedByCategory.food || [],
        play: collectedByCategory.play || [],
        leisure: collectedByCategory.leisure || [],
        all: [],
      };
    };

    try {

      const resp = await fetch('/api/poi/batch-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: normalizedLocation,
          radius: searchRadius,
          mode: 'complete',
        }),
      });

      const json = await resp.json().catch(() => null);
      if (!resp.ok || !json?.success || !json?.data) {
        throw new Error(json?.error || json?.message || '批量搜索失败');
      }

      if (requestId !== previewRequestIdRef.current) {
        return;
      }

      let categorized = buildCategorizedPlaces({
        food: json.data.food || [],
        play: json.data.play || [],
        leisure: json.data.leisure || [],
      });
      // #region debug-point B:preview-server-payload
      fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'preview-missing-results',
          runId: 'post-fix',
          hypothesisId: 'B',
          location: 'src/components/blindbox-home.tsx',
          msg: '[DEBUG] preview received server payload',
          data: {
            location: normalizedLocation,
            serverFood: Array.isArray(json.data.food) ? json.data.food.length : -1,
            serverPlay: Array.isArray(json.data.play) ? json.data.play.length : -1,
            serverLeisure: Array.isArray(json.data.leisure) ? json.data.leisure.length : -1,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      const totalCount = categorized.food.length + categorized.play.length + categorized.leisure.length;
      if (totalCount === 0) {
        console.warn('[预览] 服务端批量搜索结果为空，回退到高德前端搜索');
        setIsHydratingPlaces(true);
        const clientCategorized = await fetchFromAMapClient();
        categorized = commitClientSnapshot(clientCategorized, false);
      }

      console.log('分类结果:', {
        food: categorized.food.length,
        play: categorized.play.length,
        leisure: categorized.leisure.length,
        all: categorized.all.length,
      });

      previewPoolCacheRef.current.set(normalizedLocation, categorized);
      setPlacesByCategory(categorized);
      setMerchantCache(categorized);
      setIsHydratingPlaces(false);

    } catch (error) {
      console.error('获取附近店铺失败，尝试高德前端兜底:', error);
      try {
        if (amapLoaded && requestId === previewRequestIdRef.current) {
          setIsHydratingPlaces(true);
          const fallbackCategorized = await fetchFromAMapClient();
          commitClientSnapshot(fallbackCategorized, false);
        } else if (requestId === previewRequestIdRef.current) {
          setMerchantCache(null);
          setPlacesByCategory(EMPTY_PLACES_BY_CATEGORY);
        }
      } catch (fallbackError) {
        console.error('高德前端兜底也失败:', fallbackError);
        if (requestId === previewRequestIdRef.current) {
          setIsHydratingPlaces(false);
          setMerchantCache(null);
          setPlacesByCategory(EMPTY_PLACES_BY_CATEGORY);
        }
      }
    } finally {
      if (requestId === previewRequestIdRef.current) {
        setIsLoadingPlaces(false);
      }
    }
  }, [amapLoaded]);

  // 当位置或距离变化时重新获取所有店铺并按分类
  useEffect(() => {
    if (selectedLocation?.location) {
      fetchAndCategorizeNearbyPlaces(selectedLocation.location);
    } else {
      setMerchantCache(null);
      setPlacesByCategory(EMPTY_PLACES_BY_CATEGORY);
    }
  }, [selectedLocation?.location, fetchAndCategorizeNearbyPlaces]);

  // ?????? → ???????????API
  useEffect(() => {
    if (!merchantCache) return;

    const distConfig: Record<string, { max: number; min: number }> = {
      within1:  { max: 1000,  min: 0    },
      "1to3":   { max: 3000,  min: 1000 },
      "3to5":   { max: 5000,  min: 3000 },
      any:      { max: 5000,  min: 0    },
    };
    const range = distConfig[filters.distance] || distConfig.any;

    const filterDist = (pois: POIItem[]) =>
      pois
        .filter((p) => {
          const d = Number(p.distance);
          return Number.isFinite(d) && d >= range.min && d <= range.max;
        })
        .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));

    const food = filterDist(merchantCache.food || []);
    const play = filterDist(merchantCache.play || []);
    const leisure = filterDist(merchantCache.leisure || []);
    const all = [...food, ...play, ...leisure].filter((item, index, list) => {
      return list.findIndex((candidate) => candidate.id === item.id) === index;
    });
    const overlapIds = Array.from(
      new Set([
        ...food.filter((item) => play.some((candidate) => candidate.id === item.id)).map((item) => item.id),
        ...food.filter((item) => leisure.some((candidate) => candidate.id === item.id)).map((item) => item.id),
        ...play.filter((item) => leisure.some((candidate) => candidate.id === item.id)).map((item) => item.id),
      ])
    );

    console.log(`[预览] 筛选(${filters.distance}): 美食${food.length} 游玩${play.length} 休闲${leisure.length}`);
    // #region debug-point C:preview-distance-filter
    fetch('http://127.0.0.1:7777/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'preview-short-ranges',
        runId: 'post-fix',
        hypothesisId: 'C',
        location: 'src/components/blindbox-home.tsx',
        msg: '[DEBUG] preview distance filter applied',
        data: {
          distanceKey: filters.distance,
          range,
          cacheFood: merchantCache.food?.length || 0,
          cachePlay: merchantCache.play?.length || 0,
          cacheLeisure: merchantCache.leisure?.length || 0,
          filteredFood: food.length,
          filteredPlay: play.length,
          filteredLeisure: leisure.length,
          filteredAll: all.length,
          overlapCount: overlapIds.length,
          overlapSamples: overlapIds.slice(0, 12).map((id) => {
            const item = food.find((candidate) => candidate.id === id)
              || play.find((candidate) => candidate.id === id)
              || leisure.find((candidate) => candidate.id === id);
            return {
              id,
              name: item?.name,
              type: item?.type,
              typecode: item?.typecode,
              distance: item?.distance,
              inFood: food.some((candidate) => candidate.id === id),
              inPlay: play.some((candidate) => candidate.id === id),
              inLeisure: leisure.some((candidate) => candidate.id === id),
            };
          }),
        },
        ts: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    setPlacesByCategory({ food, play, leisure, all });
  }, [merchantCache, filters.distance]);

  useEffect(() => {
    if (!merchantCache || !selectedLocation?.location || !amapLoaded) return;

    const hydrationKey = `${selectedLocation.location.trim()}::short-range-v1`;
    if (shortRangeHydratedKeysRef.current.has(hydrationKey)) {
      return;
    }
    shortRangeHydratedKeysRef.current.add(hydrationKey);

    let cancelled = false;

    const hydrateShortRanges = async () => {
      const AMap = (window as any).AMap;
      if (!AMap?.PlaceSearch) return;

      const [originLng, originLat] = selectedLocation.location.trim().split(',').map(Number);
      if (!Number.isFinite(originLng) || !Number.isFinite(originLat)) return;

      setIsHydratingPlaces(true);

      const toRadians = (deg: number) => (deg * Math.PI) / 180;
      const calculateDistance = (poiLocation?: string) => {
        if (!poiLocation || !poiLocation.includes(',')) return undefined;
        const [poiLng, poiLat] = poiLocation.split(',').map(Number);
        if (!Number.isFinite(poiLng) || !Number.isFinite(poiLat)) return undefined;
        const R = 6371000;
        const dLat = toRadians(poiLat - originLat);
        const dLng = toRadians(poiLng - originLng);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRadians(originLat)) * Math.cos(toRadians(poiLat)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const keywordPlan: Record<PoiCategoryKey, string[]> = {
        food: ['餐厅', '美食', '火锅', '烧烤', '咖啡', '甜品', '面馆'],
        play: ['台球', '健身', '公园', '景点', 'KTV', '运动', '足球场', '篮球场', '羽毛球馆', '游泳馆'],
        leisure: ['电影院', '书店', '茶馆', '酒吧', '咖啡馆', '博物馆', '展览', 'SPA'],
      };

      const collected: Record<Category, POIItem[]> = {
        food: [...(merchantCache.food || [])],
        play: [...(merchantCache.play || [])],
        leisure: [...(merchantCache.leisure || [])],
        all: [],
      };

      const seenByCategory = {
        food: new Set(collected.food.map((item) => item.id)),
        play: new Set(collected.play.map((item) => item.id)),
        leisure: new Set(collected.leisure.map((item) => item.id)),
      };

      const runNearSearch = async (
        categoryKey: PoiCategoryKey,
        keyword: string,
        radius: number,
        pages: number
      ) => {
        for (let page = 1; page <= pages; page++) {
          if (cancelled) return;
          const added = await new Promise<number>((resolve) => {
            const timer = setTimeout(() => resolve(0), 5000);
            const placeSearch = new AMap.PlaceSearch({
              pageSize: 25,
              pageIndex: page,
              extensions: 'all',
            });

            placeSearch.searchNearBy(
              keyword,
              new AMap.LngLat(originLng, originLat),
              radius,
              (status: string, result: any) => {
                clearTimeout(timer);
                if (status !== 'complete' || !result?.poiList?.pois?.length) {
                  resolve(0);
                  return;
                }

                let localAdded = 0;
                for (const poi of result.poiList.pois as any[]) {
                  const poiLocation = poi.location
                    ? typeof poi.location === 'string'
                      ? poi.location
                      : `${poi.location.lng},${poi.location.lat}`
                    : '';
                  const item: POIItem = {
                    id: poi.id,
                    name: poi.name,
                    location: poiLocation,
                    address: poi.address || '',
                    province: poi.province || '',
                    city: poi.city || '',
                    district: poi.district || '',
                    type: poi.type || '',
                    typecode: poi.typecode || '',
                    tel: poi.tel,
                    photos: poi.photos || [],
                    rating: poi.biz_ext?.rating ? Number(poi.biz_ext.rating) : undefined,
                    cost: poi.biz_ext?.cost ? Number(poi.biz_ext.cost) : undefined,
                    distance: calculateDistance(poiLocation),
                    remark: poi.remark || '',
                  };

                  if (!item.id || !Number.isFinite(item.distance) || Number(item.distance) > 5000) {
                    continue;
                  }
                  const resolvedCategory = resolvePoiCategoryForSources(item, [categoryKey]);
                  if (
                    resolvedCategory !== categoryKey ||
                    !isPoiCompatibleWithCategory(item, categoryKey) ||
                    seenByCategory[categoryKey].has(item.id)
                  ) {
                    continue;
                  }

                  seenByCategory[categoryKey].add(item.id);
                  collected[categoryKey].push(item);
                  localAdded++;
                }
                resolve(localAdded);
              }
            );
          });

          if (added === 0) {
            break;
          }
        }
      };

      for (const categoryKey of ['food', 'play', 'leisure'] as const) {
        for (const keyword of keywordPlan[categoryKey]) {
          await runNearSearch(categoryKey, keyword, 1000, categoryKey === 'play' ? 3 : 2);
          await runNearSearch(categoryKey, keyword, 3000, categoryKey === 'play' ? 4 : 3);
        }
      }

      if (cancelled) return;

      const nextSnapshot = reconcileCategorizedPlaces(collected);
      previewPoolCacheRef.current.set(selectedLocation.location.trim(), nextSnapshot);
      setMerchantCache(nextSnapshot);
      setPlacesByCategory(nextSnapshot);
      setIsHydratingPlaces(false);

      // #region debug-point F:short-range-hydration
      fetch('http://127.0.0.1:7777/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'preview-short-ranges',
          runId: 'post-fix',
          hypothesisId: 'F',
          location: 'src/components/blindbox-home.tsx',
          msg: '[DEBUG] short range hydration merged',
          data: {
            location: selectedLocation.location.trim(),
            food: nextSnapshot.food.length,
            play: nextSnapshot.play.length,
            leisure: nextSnapshot.leisure.length,
            within1Play: nextSnapshot.play.filter((item) => Number(item.distance) >= 0 && Number(item.distance) <= 1000).length,
            oneto3Play: nextSnapshot.play.filter((item) => Number(item.distance) > 1000 && Number(item.distance) <= 3000).length,
          },
          ts: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    };

    hydrateShortRanges().catch(() => {
      if (!cancelled) {
        setIsHydratingPlaces(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [amapLoaded, merchantCache, selectedLocation?.location]);

  useEffect(() => {
    if (!searchKeyword) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = window.setTimeout(() => {
      fetchSuggestions(searchKeyword);
    }, 300);

    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchKeyword, fetchSuggestions]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 切换分类动画
  const handleCategorySelect = (category: Category) => {
    onCategoryChange(category);
  };

  // 使用高德地图定位（用于获取精确地址描述）
  const handleAMapGeolocation = useCallback((): Promise<{location: string; address: string; name: string; accuracy: number; cityName?: string; adcode?: string} | null> => {
    return new Promise((resolve) => {
      try {
        const AMap = (window as any).AMap;
        if (!AMap?.Geolocation) {
          console.warn('[定位] 高德 Geolocation 插件未加载');
          resolve(null);
          return;
        }

        const geo = new AMap.Geolocation({
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
          extensions: 'all',
        });

        geo.getCurrentPosition((status: string, result: any) => {
          if (status === 'complete' && result?.position) {
            const { lng, lat } = result.position;
            const location = `${lng},${lat}`;
            const address = result.formattedAddress ||
              `${result.addressComponent?.province || ''}${result.addressComponent?.city || ''}${result.addressComponent?.district || ''}`;
            const accuracy = result.accuracy || 50; // 默认 50m
            console.log(`[定位] ✓ 高德定位成功, 精度: ${accuracy}m, 地址: ${address}`);
            resolve({
              location,
              address,
              name: result.formattedAddress || '当前位置',
              accuracy,
              cityName: result.addressComponent?.city || result.addressComponent?.province || undefined,
              adcode: result.addressComponent?.adcode || undefined,
            });
          } else {
            console.warn('[定位] 高德定位失败, status:', status);
            resolve(null);
          }
        });
      } catch (error) {
        console.error('[定位] 高德定位异常:', error);
        resolve(null);
      }
    });
  }, []);

  // 综合定位：仅使用高德定位，失败后再退回服务端 IP 定位
  const handleGetLocation = useCallback(() => {
    setIsLocating(true);

    (async () => {
      console.log('[定位] 开始获取位置...');
      const amapResult = await handleAMapGeolocation();
      
      if (amapResult) {
        console.log(`[定位] ✓ 高德定位成功, 精度: ${amapResult.accuracy}m`);
        await applyResolvedLocation(amapResult);
        setIsLocating(false);
        return;
      }

      // 2. 高德定位失败，IP 定位兜底
      console.warn('[定位] 高德定位失败，使用 IP 定位兜底...');
      try {
        const resp = await fetch('/api/location/ip', { cache: 'no-store' });
        const json = await resp.json().catch(() => null);
        const ipData = resp.ok && json?.success ? json.data : null;
        if (ipData?.location) {
          console.log(`[定位] IP 定位: ${ipData.city || ipData.province || '未知城市'}, 精度约城市级`);
          await applyResolvedLocation({
            name: ipData.city || ipData.province || '当前位置',
            location: ipData.location,
            address: ipData.city || ipData.province || '当前位置',
            cityName: ipData.city || ipData.province || undefined,
            adcode: ipData.adcode || undefined,
          });
          setIsLocating(false);
          return;
        }
      } catch {
        console.warn('[定位] IP 定位服务超时或失败');
      }

      // 3. 最终兜底
      console.warn('[定位] 最终兜底：使用默认位置');
      await applyResolvedLocation({
        name: currentCity.name || '当前位置',
        location: '116.39723,39.9075',
        address: `${currentCity.name || '北京市'}（定位失败，请手动搜索更精确的位置）`,
        cityName: currentCity.name,
        adcode: currentCity.adcode,
      });
      setIsLocating(false);
    })();
  }, [applyResolvedLocation, currentCity.adcode, currentCity.name, handleAMapGeolocation]);

  // 选择建议项
  const handleSelectSuggestion = async (suggestion: Suggestion) => {
    const baseAddress = (suggestion.district || '') + (suggestion.address ? ' ' + suggestion.address : '');
    let loc = suggestion.location;
    let geoCityName: string | undefined;
    let geoAdcode: string | undefined;

    if (!loc) {
      try {
        setIsResolvingLocation(true);
        const geo = await resolveLocationFromText(`${suggestion.district || ''}${suggestion.name}`);
        if (geo?.location) {
          loc = geo.location;
          geoCityName = geo.city || geo.province || undefined;
          geoAdcode = geo.adcode || undefined;
        }
      } finally {
        setIsResolvingLocation(false);
      }
    }
    if (loc) {
      await applyResolvedLocation({
        name: suggestion.name,
        location: loc,
        address: baseAddress || suggestion.name,
        cityName: geoCityName,
        adcode: geoAdcode,
      });
    }
    setSearchKeyword('');
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // 清除位置
  const handleClearLocation = () => {
    setSelectedLocation(null);
    setSearchKeyword('');
    setSuggestions([]);
  };

  const handleStartBlindbox = useCallback(async () => {
    if (isOpening || showAnimation || isResolvingLocation || isLocating || openingRef.current) return;
    openingRef.current = true;
    let started = false;

    try {
      onOpenBlindbox();

      let targetLocation = selectedLocation?.location;

      if (!targetLocation) {
        setIsResolvingLocation(true);
        try {
          const fallbackText = (searchKeyword && searchKeyword.trim()) ? searchKeyword.trim() : currentCity.name;
          const geo = await resolveLocationFromText(fallbackText);
          if (geo?.location) {
            targetLocation = geo.location;
            await applyResolvedLocation({
              name: fallbackText,
              location: geo.location,
              address: geo.formattedAddress || fallbackText,
              cityName: geo.city || geo.province || undefined,
              adcode: geo.adcode || undefined,
            });
          }
        } catch (error) {
          console.warn('[AI 开盒] 文本定位失败:', error);
        } finally {
          setIsResolvingLocation(false);
        }
      }

      if (!targetLocation) {
        setIsLocating(true);
        try {
          const amapLoc = await handleAMapGeolocation();
          if (amapLoc?.location) {
            targetLocation = amapLoc.location;
            await applyResolvedLocation(amapLoc);
          }
        } catch (error) {
          console.warn('[AI 开盒] 高德定位失败:', error);
        } finally {
          setIsLocating(false);
        }
      }

      if (!targetLocation) {
        targetLocation = '116.39723,39.9075';
        await applyResolvedLocation({
          name: currentCity.name,
          location: targetLocation,
          address: currentCity.name,
          cityName: currentCity.name,
          adcode: currentCity.adcode,
        });
      }

      if (aiQuery.trim()) {
        setIsAiMode(true);
      }
      setAnimationCategory(selectedCategory);
      setPendingOpenAnimation(true);
      started = true;
    } finally {
      if (!started) {
        openingRef.current = false;
      }
    }
  }, [isOpening, showAnimation, isResolvingLocation, isLocating, selectedLocation, searchKeyword, currentCity.adcode, currentCity.name, selectedCategory, resolveLocationFromText, handleAMapGeolocation, onOpenBlindbox, aiQuery, applyResolvedLocation]);

  // 当结果改变时，重置开盒状态
  useEffect(() => {
    if (!result) {
      // 结果被清空时，重置所有开盒相关状态
      setShowAnimation(false);
      setIsAiMode(false);
      setAiQuery('');
      openingRef.current = false;
    }
  }, [result]);

  const shouldDisableOpen =
    isOpening ||
    showAnimation ||
    isResolvingLocation ||
    isLocating;

  useEffect(() => {
    if (!pendingOpenAnimation || !selectedLocation?.location) {
      return;
    }

    setPendingOpenAnimation(false);
    setShowAnimation(true);
  }, [pendingOpenAnimation, selectedLocation?.location]);

  return (
    <div className="min-h-screen" style={{ 
      background: 'linear-gradient(180deg, #FFF8E7 0%, #FFF3D6 50%, #FFEFC7 100%)'
    }}>
      {/* 顶部装饰条 */}
      <div className="h-2 w-full" style={{ 
        background: 'linear-gradient(90deg, #FF6B6B, #FFB347, #4ECDC4, #9B59B6, #FF6B6B)',
        backgroundSize: '200% 100%',
        animation: 'gradientMove 3s ease infinite'
      }} />

      {/* 顶部导航 */}
      <div className="max-w-2xl mx-auto px-4 py-3 flex justify-end">
        <button
          onClick={onShowProfile}
          className="w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110 shadow-lg"
          style={{
            background: 'linear-gradient(135deg, #FF6B6B 0%, #FFB347 100%)',
            color: 'white',
            border: '3px solid white',
            boxShadow: '0 4px 20px rgba(255,107,107,0.5)',
          }}
        >
          <User className="w-6 h-6" />
        </button>
      </div>

      {/* 主内容 */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* 大标题区 */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black mb-2" style={{ 
            color: '#FF6B6B',
            textShadow: '3px 3px 0px #FFB347, 6px 6px 0px rgba(255,179,71,0.3)',
            letterSpacing: '2px'
          }}>
            <span className="inline-block animate-bounce" style={{ animationDuration: '2s' }}>🎲</span>
            {' '}盲盒去哪{' '}
            <span className="inline-block animate-bounce" style={{ animationDuration: '2s', animationDelay: '0.3s' }}>✨</span>
          </h1>
          <p className="text-base font-medium" style={{ color: '#888' }}>
            别纠结了，让命运决定去哪儿！
          </p>
        </div>

        {/* 位置搜索卡片 */}
        <Card className="p-4 mb-5 rounded-2xl shadow-lg" style={{ 
          background: 'white',
          border: '3px solid #FFE4B5',
          boxShadow: '0 8px 24px rgba(255,107,107,0.15)'
        }}>
          {/* 搜索框 */}
          <div className="relative mb-3">
            <div className="relative flex items-center">
              <MapPin className="absolute left-3 w-5 h-5" style={{ color: '#FF6B6B' }} />
              <Input
                ref={searchInputRef}
                placeholder="你在哪儿？（如：国贸、三里屯）"
                value={selectedLocation ? selectedLocation.name : searchKeyword}
                onChange={(e) => {
                  setSearchKeyword(e.target.value);
                  setShowSuggestions(Boolean(e.target.value.trim()));
                  setSelectedLocation(null);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) {
                    setShowSuggestions(true);
                  }
                }}
                className="pl-10 pr-10 h-12 text-base font-medium rounded-xl"
                style={{ 
                  background: '#FFF8E7',
                  border: '2px solid #FFE4B5',
                  color: '#333'
                }}
              />
              <div className="absolute right-3 flex items-center gap-1">
                {isLocating ? (
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#FFB347' }} />
                ) : (
                  <button 
                    onClick={handleGetLocation}
                    className="p-1 rounded-full transition-transform hover:scale-110 active:scale-95"
                    style={{ color: '#4ECDC4' }}
                  >
                    <Locate className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>

            {/* suggestions are rendered into a portal to avoid layout shifts */}
            {showSuggestions && suggestionPortalPos && createPortal(
              <div
                ref={suggestionsRef}
                className="max-h-72 overflow-y-auto rounded-3xl bg-white border border-slate-200 shadow-xl"
                style={{
                  position: 'absolute',
                  top: suggestionPortalPos.top,
                  left: suggestionPortalPos.left,
                  width: suggestionPortalPos.width,
                  zIndex: 40,
                }}
              >
                {isSearching && (
                  <div className="px-4 py-3 text-sm text-slate-500">正在搜索地址...</div>
                )}
                {!isSearching && suggestions.length === 0 && (
                  <div className="px-4 py-3 text-sm text-slate-500">暂无匹配地址，请换个关键词重试。</div>
                )}
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => handleSelectSuggestion(suggestion)}
                    className="w-full text-left px-4 py-3 border-b last:border-b-0 hover:bg-slate-50 transition-colors"
                  >
                    <div className="font-medium text-sm text-slate-900">{suggestion.name}</div>
                    <div className="text-xs text-slate-500">{suggestion.address || suggestion.district}</div>
                  </button>
                ))}
              </div>,
              document.body
            )}

            {/* 当前位置标签 */}
            {selectedLocation && (
              <div className="mt-2 flex items-center gap-2">
                <Badge className="px-3 py-1 rounded-full text-sm font-medium" style={{ 
                  background: '#4ECDC4', 
                  color: 'white'
                }}>
                  <MapPin className="w-3 h-3 mr-1" />
                  {selectedLocation.name}
                </Badge>
                <button 
                  onClick={handleClearLocation}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* 已选位置显示 */}
          {selectedLocation && (
            <div className="text-sm" style={{ color: '#888' }}>
              📍 {selectedLocation.address}
            </div>
          )}
        </Card>

        {/* 分类标签 */}
        <div className="mb-5">
          <div className="flex gap-3 justify-center">
            {CATEGORIES.map((category) => (
              <button
                key={category.key}
                onClick={() => handleCategorySelect(category.key)}
                className="relative px-5 py-3 rounded-2xl font-bold text-base transition-all duration-300 transform"
                style={{
                  background: selectedCategory === category.key 
                    ? category.color 
                    : 'white',
                  color: selectedCategory === category.key 
                    ? 'white' 
                    : '#666',
                  border: `3px solid ${selectedCategory === category.key ? category.color : '#FFE4B5'}`,
                  boxShadow: selectedCategory === category.key 
                    ? `0 6px 20px ${category.color}50` 
                    : '0 4px 12px rgba(0,0,0,0.08)',
                  transform: selectedCategory === category.key ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span className="mr-1">{category.icon}</span>
                {category.name}
                {selectedCategory === category.key && (
                  <span 
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full animate-ping"
                    style={{ background: category.color }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* AI 智能推荐输入 */}
        <div className="mb-5">
          <Card
            className="p-4 rounded-2xl transition-all"
            style={{
              background: aiQuery.trim() ? '#F8F0FF' : 'white',
              border: aiQuery.trim() ? '3px solid #9B59B6' : '3px solid #E8D5FF',
              boxShadow: aiQuery.trim()
                ? '0 8px 24px rgba(155,89,182,0.2)'
                : '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🤖</span>
              <Label
                className="text-sm font-bold"
                style={{ color: '#9B59B6' }}
              >
                AI 智能推荐
              </Label>
              <Badge
                className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: '#9B59B622', color: '#9B59B6' }}
              >
                新功能
              </Badge>
            </div>
            <Textarea
              placeholder={placeholderExamples[placeholderIndex]}
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              className="w-full h-14 p-3 rounded-xl text-sm resize-none transition-all"
              style={{
                background: '#FFF8E7',
                border: aiQuery ? '2px solid #9B59B6' : '2px solid #E8D5FF',
                color: '#333',
                outline: 'none',
              }}
              disabled={showAnimation || isResolvingLocation}
              rows={2}
            />
            {aiQuery.trim() ? (
              <p className="text-xs mt-2 flex items-center gap-1" style={{ color: '#9B59B6' }}>
                <span>✨</span> AI将根据你的需求智能推荐
              </p>
            ) : (
              <p className="text-xs mt-2" style={{ color: '#999' }}>
                输入你的需求，让AI帮你精准选店
              </p>
            )}
          </Card>
        </div>

        {/* 筛选按钮 */}
        <div className="mb-5">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="w-full py-3 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2"
            style={{
              background: showFilters ? '#FFB347' : 'white',
              color: showFilters ? 'white' : '#666',
              border: `3px solid ${showFilters ? '#FFB347' : '#FFE4B5'}`,
              boxShadow: showFilters ? '0 4px 16px rgba(255,179,71,0.4)' : '0 4px 12px rgba(0,0,0,0.08)',
            }}
          >
            <span className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}>▼</span>
            筛选条件
            {filters.distance !== DEFAULT_DISTANCE_KEY && (
              <Badge className="rounded-full px-2 py-0.5 text-xs" style={{ background: '#FF6B6B', color: 'white' }}>
                已筛选
              </Badge>
            )}
          </button>

          {/* 筛选面板 */}
          {showFilters && (
            <Card className="mt-3 p-4 rounded-2xl animate-bounce-in" style={{ 
              background: 'white',
              border: '3px solid #FFE4B5',
              boxShadow: '0 8px 24px rgba(255,179,71,0.2)'
            }}>
              {/* 距离 */}
              <div className="mb-4">
                <Label className="text-sm font-bold mb-2 block" style={{ color: '#FF6B6B' }}>
                  📍 距离范围
                </Label>
                <div className="flex flex-wrap gap-2">
                  {DISTANCE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      onClick={() => onFiltersChange({ ...filters, distance: option.key as any })}
                      className="px-4 py-2 rounded-full font-medium text-sm transition-all"
                      style={{
                        background: filters.distance === option.key ? '#4ECDC4' : '#FFF8E7',
                        color: filters.distance === option.key ? 'white' : '#666',
                        border: `2px solid ${filters.distance === option.key ? '#4ECDC4' : '#FFE4B5'}`,
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

            </Card>
          )}
        </div>

        {/* 常驻盲盒展示 */}
        <div className="flex justify-center py-6">
          <BlindboxPreview
            skin={skin as any}
            category={selectedCategory}
            onSkinChange={(newSkin) => changeSkin(newSkin as any)}
            showEditButton={true}
            showFilters={showFilters}
            showSuggestions={showSuggestions}
            isPreviewLoading={isLoadingPlaces}
            isPreviewHydrating={isHydratingPlaces}
            previewPlaces={placesByCategory[selectedCategory]}
          />
        </div>

        {/* 开盒按钮（已移至固定底部容器，不随搜索下拉位移） - 占位保留为空块以保持布局一致 */}
        <div style={{ height: 0 }} />

        {/* 底部装饰 */}
        <div className="mt-8 text-center">
          <p className="text-sm" style={{ color: '#CCC' }}>
            💡 重新启动即可更新
          </p>
        </div>

      {/* 固定开盒按钮容器：固定在视口底部，不随下拉建议位移；z-index 设置为 10，低于建议列表的 z-30 */}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 28, zIndex: 10, display: 'flex', justifyContent: 'center', padding: '0 16px' }}>
        <div style={{ width: '100%', maxWidth: '640px', pointerEvents: 'auto' }}>
          <button
            onClick={handleStartBlindbox}
            disabled={shouldDisableOpen}
            className="w-full py-5 rounded-3xl font-black text-2xl transition-all relative overflow-hidden group"
            style={{
              background: isOpening || showAnimation 
                ? 'linear-gradient(135deg, #FFB347 0%, #FF9F43 100%)' 
                : 'linear-gradient(135deg, #FF6B6B 0%, #FF5252 50%, #FF7043 100%)',
              color: 'white',
              boxShadow: isOpening || showAnimation 
                ? '0 8px 24px rgba(255,179,71,0.4)' 
                : '0 12px 40px rgba(255,107,107,0.5), inset 0 2px 0 rgba(255,255,255,0.2)',
              transform: 'scale(1)',
              opacity: isOpening || showAnimation ? 0.9 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isOpening && !showAnimation) {
                e.currentTarget.style.transform = 'scale(1.02)';
                e.currentTarget.style.boxShadow = '0 16px 50px rgba(255,107,107,0.6), inset 0 2px 0 rgba(255,255,255,0.2)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 12px 40px rgba(255,107,107,0.5), inset 0 2px 0 rgba(255,255,255,0.2)';
            }}
            onMouseDown={(e) => {
              if (!isOpening && !showAnimation) {
                e.currentTarget.style.transform = 'scale(0.98)';
              }
            }}
            onMouseUp={(e) => {
              if (!isOpening && !showAnimation) {
                e.currentTarget.style.transform = 'scale(1.02)';
              }
            }}
          >
            {/* 按钮光泽效果 */}
            <div 
              className="absolute inset-0 opacity-30"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
              }}
            />
            
            {isOpening || showAnimation || isResolvingLocation || isLocating ? (
              <>
                <span className="mr-2 animate-bounce inline-block">🎲</span>
                {isLocating || isResolvingLocation ? '定位中...' : '开启中...'}
              </>
            ) : (
              <>
                <span className="mr-2 animate-pulse inline-block">🎁</span>
                开一个盲盒！
                <Sparkles className="inline-block ml-2 w-6 h-6 animate-spin" style={{ animationDuration: '3s' }} />
              </>
            )}
          </button>
        </div>
      </div>

      </main>

      {/* 底部装饰条 */}
      <div className="h-2 w-full fixed bottom-0 left-0 right-0" style={{ 
        background: 'linear-gradient(90deg, #FF6B6B, #FFB347, #4ECDC4, #9B59B6, #FF6B6B)',
        backgroundSize: '200% 100%',
        animation: 'gradientMove 3s ease infinite'
      }} />

      {/* 皮肤选择弹窗 */}
      <Sheet open={showSkinPicker} onOpenChange={setShowSkinPicker}>
        <SheetContent side="bottom" className="rounded-t-3xl" style={{ background: '#FFF8E7' }}>
          <SheetHeader>
            <SheetTitle className="text-center text-xl font-black" style={{ color: '#FF6B6B' }}>
              选择盲盒皮肤
            </SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-4 mt-6">
            {[
              { key: 'basic', name: '基础款', icon: '💙', desc: '天蓝色经典圆角' },
              { key: 'cute', name: '可爱款', icon: '🌸', desc: '粉嫩云朵纹理' },
              { key: 'minimal', name: '简约款', icon: '🤍', desc: '透明线条风格' },
              { key: 'vibrant', name: '元气款', icon: '🌈', desc: '渐变彩虹色彩' },
            ].map((s) => (
              <Card
                key={s.key}
                className="p-4 cursor-pointer transition-all hover:scale-105"
                style={{
                  background: skin === s.key ? '#FFE4B5' : 'white',
                  border: `3px solid ${skin === s.key ? '#FFB347' : '#FFE4B5'}`,
                  boxShadow: skin === s.key ? '0 8px 24px rgba(255,179,71,0.3)' : '0 4px 12px rgba(0,0,0,0.08)',
                }}
                onClick={() => {
                  changeSkin(s.key as any);
                  setShowSkinPicker(false);
                }}
              >
                <div className="text-4xl mb-2">{s.icon}</div>
                <div className="font-bold text-base" style={{ color: '#333' }}>{s.name}</div>
                <div className="text-sm" style={{ color: '#888' }}>{s.desc}</div>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* 盲盒开启动画 */}
      <BlindboxAnimation
        isOpen={showAnimation}
        category={animationCategory}
        skin={skin}
        location={selectedLocation?.location}
        cityName={currentCity.name}
        distanceKey={filters.distance}
        distance={DISTANCE_OPTIONS.find(opt => opt.key === filters.distance)?.value || 5000}
        aiQuery={aiQuery.trim() || undefined}
        isAiMode={isAiMode}
        onAiFallback={() => {
          setAiQuery('');
          setIsAiMode(false);
        }}
        onComplete={(result) => {
          setShowAnimation(false);
          setIsAiMode(false);
          setAiQuery('');
          openingRef.current = false;
          // AI 模式下，将分类同步为 AI 解析结果
          if (result.aiRecommended) {
            const categoryMap: Record<string, Category> = {
              '美食盲盒': 'food',
              '游玩盲盒': 'play',
              '休闲盲盒': 'leisure',
              '全能盲盒': 'all',
            };
            const aiCategory = result.aiResolvedCategory || categoryMap[result.category] || 'all';
            onCategoryChange(aiCategory);
          }
          onShowResult(result);
        }}
      />

      {/* 全局动画样式 */}
      <style jsx global>{`
        @keyframes gradientMove {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        
        @keyframes bounceIn {
          0% { opacity: 0; transform: scale(0.8) translateY(20px); }
          50% { transform: scale(1.02) translateY(-5px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        
        :global(.animate-bounce-in) {
          animation: bounceIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

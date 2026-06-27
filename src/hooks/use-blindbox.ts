'use client';

import { useState, useEffect, useCallback } from 'react';
import { BlindboxSkin as NewBlindboxSkin } from '@/lib/skin-config';
import { Category as NewCategory } from '@/lib/category-config';
import { STORAGE_KEYS } from "@/lib/storage-keys";

// 盲盒分类 - 使用统一的分类配置类型
export type Category = NewCategory;

// 筛选条件
export interface FilterOptions {
  distance: 'any' | 'within1' | '1to3' | '3to5';
}

// 盲盒结果
export interface BlindboxResult {
  id: string;
  name: string;
  location: string;
  address: string;
  city: string;
  district: string;
  type: string;
  tel?: string;
  photos: { url: string }[];
  rating?: number;
  price?: number;
  distance: string;
  category: string;
  categoryIcon: string;
  healingMessage: string;
  navigationUrl: string;
  /** 是否为 AI 智能推荐 */
  aiRecommended?: boolean;
  /** 原始自然语言查询文本 */
  aiQuery?: string;
  /** AI 解析后的主分类 */
  aiResolvedCategory?: Category;
  /** AI 解析出的分类列表 */
  aiIntentCategories?: Category[];
  /** 是否与用户手选分类冲突 */
  aiCategoryConflict?: boolean;
  /** AI 解析来源 */
  aiSource?: 'deepseek' | 'heuristic';
  /** 计算后的数值距离 */
  distanceMeters?: number;
}

// 城市信息
export interface CityInfo {
  name: string;
  adcode: string;
}

// 盲盒皮肤 - 使用统一的皮肤配置类型
export type BlindboxSkin = NewBlindboxSkin;

// 标准化盲盒结果数据，处理旧格式（嵌套poi对象）和新格式（扁平对象）
function normalizeBlindboxResult(data: any): BlindboxResult {
  // 如果数据是null或undefined，返回默认对象
  if (!data) {
    return {
      id: '',
      name: '未知店铺',
      location: '',
      address: '',
      city: '',
      district: '',
      type: '',
      tel: undefined,
      photos: [],
      rating: undefined,
      price: undefined,
      distance: '',
      category: '全能盲盒',
      categoryIcon: '🎁',
      healingMessage: '今天也要好好放松呀~',
      navigationUrl: '',
    };
  }

  // 如果数据是嵌套格式（包含poi对象）
  if (data.poi && typeof data.poi === 'object') {
    return {
      id: data.poi.id || data.id || '',
      name: data.poi.name || data.name || '未知店铺',
      location: data.poi.location || data.location || '',
      address: data.poi.address || data.address || '',
      city: data.poi.city || data.city || '',
      district: data.poi.district || data.district || '',
      type: data.poi.type || data.type || '',
      tel: data.poi.tel || data.tel || undefined,
      photos: data.poi.photos || data.photos || [],
      rating: data.rating != null ? data.rating : (data.poi?.rating != null ? data.poi.rating : undefined),
      price: data.price != null ? data.price : (data.poi?.cost != null ? data.poi.cost : undefined),
      distance: data.distance || '',
      category: data.category || '全能盲盒',
      categoryIcon: data.categoryIcon || '🎁',
      healingMessage: data.healingMessage || '今天也要好好放松呀~',
      navigationUrl: data.navigationUrl || '',
      aiRecommended: data.aiRecommended,
      aiQuery: data.aiQuery,
      aiResolvedCategory: data.aiResolvedCategory,
      aiIntentCategories: data.aiIntentCategories,
      aiCategoryConflict: data.aiCategoryConflict,
      aiSource: data.aiSource,
      distanceMeters: data.distanceMeters,
    };
  }

  // 已经是扁平格式或默认格式
  return {
    id: data.id || '',
    name: data.name || '未知店铺',
    location: data.location || '',
    address: data.address || '',
    city: data.city || '',
    district: data.district || '',
    type: data.type || '',
    tel: data.tel || undefined,
    photos: data.photos || [],
    rating: data.rating != null ? data.rating : undefined,
    price: data.price != null ? data.price : undefined,
    distance: data.distance || '',
    category: data.category || '全能盲盒',
    categoryIcon: data.categoryIcon || '🎁',
    healingMessage: data.healingMessage || '今天也要好好放松呀~',
    navigationUrl: data.navigationUrl || '',
    aiRecommended: data.aiRecommended,
    aiQuery: data.aiQuery,
    aiResolvedCategory: data.aiResolvedCategory,
    aiIntentCategories: data.aiIntentCategories,
    aiCategoryConflict: data.aiCategoryConflict,
    aiSource: data.aiSource,
    distanceMeters: data.distanceMeters,
  };
}

export function useBlindbox() {
  const [currentCity, setCurrentCity] = useState<CityInfo>({ name: '北京', adcode: '110000' });
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [filters, setFilters] = useState<FilterOptions>({
    distance: '1to3',
  });
  const [userLocation, setUserLocation] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<BlindboxResult | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [isOpening, setIsOpening] = useState(false);

  // 加载保存的城市
  useEffect(() => {
    const savedCity = localStorage.getItem(STORAGE_KEYS.currentCity);
    if (savedCity) {
      try {
        setCurrentCity(JSON.parse(savedCity));
      } catch {
        // ignore
      }
    }
  }, []);

  // 获取用户位置
  const getUserLocation = useCallback(() => {
    return new Promise<string | null>((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = `${position.coords.longitude},${position.coords.latitude}`;
          setUserLocation(location);
          resolve(location);
        },
        () => {
          resolve(null);
        },
        { timeout: 5000 }
      );
    });
  }, []);

  // 开盲盒
  const openBlindbox = useCallback(async () => {
    setIsOpening(true);
    setResult(null);

    // 动画时间
    await new Promise((resolve) => setTimeout(resolve, 2000));

    try {
      const location = userLocation || (await getUserLocation());

      const getDistanceRange = (key: FilterOptions['distance']) => {
        switch (key) {
          case 'within1':
            return { min: 0, max: 1000 };
          case '1to3':
            return { min: 1000, max: 3000 };
          case '3to5':
            return { min: 3000, max: 5000 };
          case 'any':
          default:
            return { min: 0, max: 5000 };
        }
      };

      const range = getDistanceRange(filters.distance);

      const response = await fetch('/api/poi/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selectedCategory,
          cityName: currentCity.name,
          city: currentCity.adcode,
          location,
          distance: range.max,
          minDistance: range.min,
          excludeIds: getHistory().map(h => h.id).filter(Boolean),
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult(data.data);
        
        // 添加到历史记录
        const history = getHistory();
        const newHistory = [
          { ...data.data, timestamp: Date.now() },
          ...history.filter((h) => h.id !== data.data.id).slice(0, 9),
        ];
        localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(newHistory));
      }
    } catch (error) {
      console.error('开盲盒失败:', error);
    } finally {
      setIsOpening(false);
    }
  }, [selectedCategory, currentCity, userLocation, filters, getUserLocation]);

  // 切换城市
  const changeCity = useCallback((city: CityInfo) => {
    setCurrentCity(city);
    localStorage.setItem(STORAGE_KEYS.currentCity, JSON.stringify(city));
  }, []);

  return {
    currentCity,
    changeCity,
    selectedCategory,
    setSelectedCategory,
    filters,
    setFilters,
    userLocation,
    getUserLocation,
    isLoading,
    setIsLoading,
    result,
    setResult,
    showFilters,
    setShowFilters,
    isOpening,
    openBlindbox,
  };
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<BlindboxResult[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.favorites);
    if (saved) {
      try {
        const favoritesData = JSON.parse(saved);
        // 标准化收藏数据
        const normalizedFavorites = Array.isArray(favoritesData)
          ? favoritesData.map(normalizeBlindboxResult)
          : [];
        setFavorites(normalizedFavorites);
      } catch {
        // ignore
      }
    }
  }, []);

  const addFavorite = useCallback((item: BlindboxResult) => {
    setFavorites((prev) => {
      const normalizedItem = normalizeBlindboxResult(item);
      const exists = prev.some((f) => f.id === normalizedItem.id);
      if (exists) return prev;
      const newFavorites = [normalizedItem, ...prev];
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(newFavorites));
      return newFavorites;
    });
  }, []);

  const removeFavorite = useCallback((id: string) => {
    setFavorites((prev) => {
      const newFavorites = prev.filter((f) => f.id !== id);
      localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(newFavorites));
      return newFavorites;
    });
  }, []);

  const isFavorite = useCallback((id: string) => {
    return favorites.some((f) => f.id === id);
  }, [favorites]);

  return { favorites, addFavorite, removeFavorite, isFavorite };
}

export function getHistory(): BlindboxResult[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.history);
    const history = saved ? JSON.parse(saved) : [];
    // 标准化历史记录中的数据
    return Array.isArray(history) ? history.map(normalizeBlindboxResult) : [];
  } catch {
    return [];
  }
}

export function clearHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify([]));
}

export function useBlindboxSkin() {
  const [skin, setSkin] = useState<BlindboxSkin>('basic');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.skin);
    if (saved && ['basic', 'cute', 'minimal', 'vibrant', 'gradient', 'neon', 'retro', 'crystal'].includes(saved)) {
      setSkin(saved as BlindboxSkin);
    }
  }, []);

  const changeSkin = useCallback((newSkin: BlindboxSkin) => {
    setSkin(newSkin);
    localStorage.setItem(STORAGE_KEYS.skin, newSkin);
  }, []);

  const skinClass = {
    basic: 'blindbox-card',
    cute: 'blindbox-card-cute',
    minimal: 'blindbox-card-minimal',
    vibrant: 'blindbox-card-vibrant',
    gradient: 'blindbox-card-gradient',
    neon: 'blindbox-card-neon',
    retro: 'blindbox-card-retro',
    crystal: 'blindbox-card-crystal',
  }[skin];

  return { skin, changeSkin, skinClass };
}

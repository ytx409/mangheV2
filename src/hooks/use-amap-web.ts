'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  waitForAMap,
  getUserCurrentLocation,
  calculateDrivingDistance,
  calculateWalkingDistance,
  getPOIDetailsWeb,
  type DistanceInfo,
  type POIDetails
} from '@/lib/amap-web';

export interface UseAMapWebReturn {
  // 状态
  isLoaded: boolean;
  isLoading: boolean;
  userLocation: { lng: number; lat: number } | null;
  error: string | null;

  // 方法
  refreshUserLocation: () => Promise<{ lng: number; lat: number } | null>;
  calculateDrivingDistance: (destination: string, origin?: string | { lng: number; lat: number }) => Promise<DistanceInfo | null>;
  calculateWalkingDistance: (destination: string, origin?: string | { lng: number; lat: number }) => Promise<DistanceInfo | null>;
  getPOIDetails: (poiId: string) => Promise<POIDetails | null>;

  // 工具函数
  formatDistance: (distance: number) => string;
  formatDuration: (duration: number) => string;
}

export function useAMapWeb(): UseAMapWebReturn {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 初始化：等待AMap加载并获取用户位置
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setIsLoading(true);

        // 等待AMap加载
        await waitForAMap();
        if (!mounted) return;

        setIsLoaded(true);
        setError(null);

        // 尝试获取用户位置（可选）
        try {
          const location = await getUserCurrentLocation();
          if (mounted && location) {
            setUserLocation(location);
          }
        } catch (locationError) {
          // 位置获取失败是正常的（用户可能拒绝权限）
          console.log('用户位置获取失败（可能用户拒绝权限）:', locationError);
        }
      } catch (error) {
        if (mounted) {
          console.error('AMap初始化失败:', error);
          setError('高德地图加载失败，请检查网络连接');
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  // 刷新用户位置
  const refreshUserLocation = useCallback(async (): Promise<{ lng: number; lat: number } | null> => {
    try {
      setIsLoading(true);
      const location = await getUserCurrentLocation();
      if (location) {
        setUserLocation(location);
      }
      return location;
    } catch (error) {
      console.error('刷新用户位置失败:', error);
      setError('获取位置失败，请检查位置权限');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 计算驾车距离（包装函数）
  const calculateDrivingDistanceWrapper = useCallback(async (
    destination: string,
    origin?: string | { lng: number; lat: number }
  ): Promise<DistanceInfo | null> => {
    if (!isLoaded) {
      setError('高德地图未加载完成');
      return null;
    }

    try {
      setIsLoading(true);
      const result = await calculateDrivingDistance(destination, origin);
      if (!result) {
        setError('路线规划失败，请稍后重试');
      }
      return result;
    } catch (error) {
      console.error('计算驾车距离失败:', error);
      setError('路线规划失败，请稍后重试');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded]);

  // 计算步行距离（包装函数）
  const calculateWalkingDistanceWrapper = useCallback(async (
    destination: string,
    origin?: string | { lng: number; lat: number }
  ): Promise<DistanceInfo | null> => {
    if (!isLoaded) {
      setError('高德地图未加载完成');
      return null;
    }

    try {
      setIsLoading(true);
      const result = await calculateWalkingDistance(destination, origin);
      if (!result) {
        setError('路线规划失败，请稍后重试');
      }
      return result;
    } catch (error) {
      console.error('计算步行距离失败:', error);
      setError('路线规划失败，请稍后重试');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded]);

  // 获取POI详情（包装函数）
  const getPOIDetailsWrapper = useCallback(async (
    poiId: string
  ): Promise<POIDetails | null> => {
    if (!isLoaded) {
      setError('高德地图未加载完成');
      return null;
    }

    try {
      setIsLoading(true);
      const result = await getPOIDetailsWeb(poiId);
      if (!result) {
        setError('获取店铺信息失败');
      }
      return result;
    } catch (error) {
      console.error('获取POI详情失败:', error);
      setError('获取店铺信息失败，请稍后重试');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded]);

  // 格式化距离
  const formatDistance = useCallback((distance: number): string => {
    if (distance < 1000) {
      return `${Math.round(distance)}米`;
    } else {
      return `${(distance / 1000).toFixed(1)}公里`;
    }
  }, []);

  // 格式化时间
  const formatDuration = useCallback((duration: number): string => {
    if (duration < 60) {
      return `${Math.round(duration)}秒`;
    } else if (duration < 3600) {
      return `${Math.round(duration / 60)}分钟`;
    } else {
      const hours = Math.floor(duration / 3600);
      const minutes = Math.round((duration % 3600) / 60);
      return minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
    }
  }, []);

  return {
    // 状态
    isLoaded,
    isLoading,
    userLocation,
    error,

    // 方法
    refreshUserLocation,
    calculateDrivingDistance: calculateDrivingDistanceWrapper,
    calculateWalkingDistance: calculateWalkingDistanceWrapper,
    getPOIDetails: getPOIDetailsWrapper,

    // 工具函数
    formatDistance,
    formatDuration,
  };
}

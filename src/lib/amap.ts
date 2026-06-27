// 高德地图 POI 搜索工具函数

import { AMAP_CONFIG, CATEGORY_TYPES } from './amap-config';
import { createHash } from 'node:crypto';

export interface POIItem {
  id: string;
  name: string;
  location: string; // 经纬度，格式：lng,lat
  address: string;
  province: string;
  city: string;
  district: string;
  type: string;
  typecode?: string;
  tel?: string;
  rating?: number;
  cost?: number;
  photos?: POIPhoto[];
  distance?: number; // 距中心的距离（米）
  remark?: string;
}

export interface POIPhoto {
  url: string;
  title?: string;
}

export interface POISearchParams {
  keywords?: string;
  types?: string;
  city?: string;
  citylimit?: boolean;
  location?: string;
  cityradius?: number;
  offset?: number;
  page?: number;
  extensions?: 'all' | 'base';
}

export interface GeocodeItem {
  location: string;
  formattedAddress?: string;
  province?: string;
  city?: string;
  district?: string;
  adcode?: string;
  level?: string;
}

export interface POISearchResponse {
  status: string;
  info: string;
  infocode?: string;
  count: number;
  suggestion?: {
    keywords: string[];
    cities?: { name: string; citycode: string; adcode: string }[];
  };
  pois?: POIItem[];
}

// 高德地图错误类型
export enum AMapErrorType {
  AUTHENTICATION = 'AUTHENTICATION',  // 认证错误 (10009)
  NETWORK = 'NETWORK',                // 网络错误
  PARAMETER = 'PARAMETER',            // 参数错误
  RATE_LIMIT = 'RATE_LIMIT',          // 频率限制
  SERVER = 'SERVER',                  // 服务器错误
  UNKNOWN = 'UNKNOWN'                 // 未知错误
}

async function fetchJsonWithRetry(url: string, init: RequestInit & { timeoutMs?: number } = {}, retries = 2): Promise<any> {
  const timeoutMs = init.timeoutMs ?? 8000;
  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`HTTP error! status: ${resp.status}`);
      }

      return await resp.json();
    } catch (e) {
      lastError = e;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError;
}

// 高德地图自定义错误类
export class AMapError extends Error {
  constructor(
    public type: AMapErrorType,
    public code: string,
    public message: string,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AMapError';
  }
}

/**
 * 生成带安全密钥的签名参数
 */
function getSignedParams(params: Record<string, string>): string {
  if (!AMAP_CONFIG.webServicePrivateKey) {
    return '';
  }
  const sortedKeys = Object.keys(params).sort();
  let signStr = sortedKeys.map(key => `${key}${params[key]}`).join('');
  signStr += AMAP_CONFIG.webServicePrivateKey;
  
  // 简单的MD5签名
  const md5 = createHash('md5');
  const sig = md5.update(signStr).digest('hex');
  
  return sig;
}

/**
 * 搜索 POI 点
 */
export async function searchPOI(params: POISearchParams): Promise<POIItem[]> {
  const apiKey = AMAP_CONFIG.serverKey;
  
  if (!apiKey) {
    throw new AMapError(
      AMapErrorType.PARAMETER,
      'NO_SERVER_KEY',
      '高德地图 Server Key 未配置',
    );
  }

  const baseParams: Record<string, string> = {
    key: apiKey,
    keywords: params.keywords || '',
    types: params.types || '',
    city: params.city || '全国',
    citylimit: params.citylimit ? 'true' : 'false',
    offset: String(params.offset || 50),
    page: String(params.page || 1),
    extensions: params.extensions || 'all',
  };

  if (params.location) {
    baseParams.location = params.location;
  }
  if (typeof params.cityradius === 'number') {
    baseParams.cityradius = String(params.cityradius);
  }

  const sig = getSignedParams(baseParams);
  if (sig) {
    baseParams.sig = sig;
  }

  const queryParams = new URLSearchParams(baseParams);

  try {
    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/place/text?${queryParams.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
        timeoutMs: 8000,
      },
      2
    );

    if (data.status === '1' && data.pois) {
      return data.pois.map((poi: any) => ({
        id: poi.id,
        name: poi.name,
        location: poi.location,
        address: poi.address || '地址未知',
        province: poi.province || '',
        city: poi.city || '',
        district: poi.district || '',
        type: poi.type || '',
        typecode: poi.typecode || '',
        tel: poi.tel,
        photos: poi.photos,
        rating: poi.biz_ext?.rating ? Number(poi.biz_ext.rating) : undefined,
        cost: poi.biz_ext?.cost ? Number(poi.biz_ext.cost) : undefined,
        distance: poi.distance ? Number(poi.distance) : undefined,
      }));
    }

    // 处理高德API返回的错误
    const errorCode = data.infocode || data.status;
    const errorInfo = data.info || '未知错误';

    // 处理认证错误 (10009)
    if (errorCode === '10009' || errorInfo.includes('USERKEY_PLAT_NOMATCH')) {
      throw new AMapError(
        AMapErrorType.AUTHENTICATION,
        '10009',
        `高德API认证失败: ${errorInfo}`,
        data
      );
    }

    // 处理其他API错误
    throw new AMapError(
      AMapErrorType.SERVER,
      errorCode,
      `高德API错误: ${errorInfo}`,
      data
    );
  } catch (error) {
    console.error('高德地图 POI 搜索失败:', error);

    // 只对网络错误或服务不可用使用模拟数据
    if (error instanceof AMapError) {
      // 重新抛出认证错误，让上层处理
      if (error.type === AMapErrorType.AUTHENTICATION) {
        throw error;
      }
      // 其他API错误：返回空数组，不暴露内部错误
      return [];
    }

    throw new AMapError(
      AMapErrorType.NETWORK,
      'NETWORK_ERROR',
      '高德地图网络请求失败',
      error
    );
  }
}

export async function searchPOIAround(params: {
  location: string;
  radius: number;
  keywords?: string;
  types?: string;
  sortrule?: 'distance' | 'weight';
  offset?: number;
  page?: number;
  extensions?: 'all' | 'base';
}): Promise<POIItem[]> {
  const apiKey = AMAP_CONFIG.serverKey;
  if (!apiKey) {
    throw new AMapError(
      AMapErrorType.PARAMETER,
      'NO_SERVER_KEY',
      '高德地图 Server Key 未配置',
    );
  }

  const safeRadius = Math.max(1, Math.min(Math.floor(params.radius), 50000));

  const baseParams: Record<string, string> = {
    key: apiKey,
    location: params.location,
    radius: String(safeRadius),
    keywords: params.keywords || '',
    types: params.types || '',
    sortrule: params.sortrule || 'distance',
    offset: String(params.offset || 50),
    page: String(params.page || 1),
    extensions: params.extensions || 'all',
  };

  const sig = getSignedParams(baseParams);
  if (sig) {
    baseParams.sig = sig;
  }

  const queryParams = new URLSearchParams(baseParams);

  try {
    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/place/around?${queryParams.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
        timeoutMs: 8000,
      },
      2
    );

    if (data.status === '1' && Array.isArray(data.pois)) {
      return data.pois.map((poi: any) => ({
        id: poi.id,
        name: poi.name,
        location: poi.location,
        address: poi.address || '地址未知',
        province: poi.province || '',
        city: poi.city || '',
        district: poi.district || '',
        type: poi.type || '',
        typecode: poi.typecode || '',
        tel: poi.tel,
        photos: poi.photos,
        rating: poi.biz_ext?.rating ? Number(poi.biz_ext.rating) : undefined,
        cost: poi.biz_ext?.cost ? Number(poi.biz_ext.cost) : undefined,
        distance: poi.distance ? Number(poi.distance) : undefined,
      }));
    }

    const errorCode = data.infocode || data.status;
    const errorInfo = data.info || '未知错误';
    if (errorCode === '10009' || (typeof errorInfo === 'string' && errorInfo.includes('USERKEY_PLAT_NOMATCH'))) {
      throw new AMapError(
        AMapErrorType.AUTHENTICATION,
        '10009',
        `高德API认证失败: ${errorInfo}`,
        data
      );
    }

    throw new AMapError(
      AMapErrorType.SERVER,
      errorCode,
      `高德API错误: ${errorInfo}`,
      data
    );
  } catch (error) {
    console.error('高德地图 POI 周边搜索失败:', error);

    if (error instanceof AMapError) {
      if (error.type === AMapErrorType.AUTHENTICATION) {
        throw error;
      }
      return [];
    }

    throw new AMapError(
      AMapErrorType.NETWORK,
      'NETWORK_ERROR',
      '高德地图网络请求失败',
      error
    );
  }
}

export async function geocodeAddressServer(params: { address: string; city?: string }): Promise<GeocodeItem | null> {
  const apiKey = AMAP_CONFIG.serverKey;
  if (!apiKey) {
    throw new AMapError(
      AMapErrorType.PARAMETER,
      'NO_SERVER_KEY',
      '高德地图 Server Key 未配置',
    );
  }

  const address = String(params.address || '').trim();
  if (!address) {
    return null;
  }

  const baseParams: Record<string, string> = {
    key: apiKey,
    address,
  };

  if (params.city && String(params.city).trim()) {
    baseParams.city = String(params.city).trim();
  }

  const sig = getSignedParams(baseParams);
  if (sig) {
    baseParams.sig = sig;
  }

  const queryParams = new URLSearchParams(baseParams);

  try {
    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/geocode/geo?${queryParams.toString()}`,
      {
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
        timeoutMs: 8000,
      },
      2
    );

    if (data.status === '1' && Array.isArray(data.geocodes) && data.geocodes.length > 0) {
      const g = data.geocodes[0];
      const item: GeocodeItem = {
        location: g.location,
        formattedAddress: g.formatted_address,
        province: g.province,
        city: typeof g.city === 'string' ? g.city : '',
        district: g.district,
        adcode: g.adcode,
        level: g.level,
      };
      return item;
    }

    const errorCode = data.infocode || data.status;
    const errorInfo = data.info || '未知错误';
    if (errorCode === '10009' || (typeof errorInfo === 'string' && errorInfo.includes('USERKEY_PLAT_NOMATCH'))) {
      throw new AMapError(
        AMapErrorType.AUTHENTICATION,
        '10009',
        `高德API认证失败: ${errorInfo}`,
        data
      );
    }

    return null;
  } catch (error) {
    console.error('高德地图地理编码失败:', error);
    if (error instanceof AMapError) {
      if (error.type === AMapErrorType.AUTHENTICATION) {
        throw error;
      }
      return null;
    }
    throw new AMapError(
      AMapErrorType.NETWORK,
      'NETWORK_ERROR',
      '高德地图网络请求失败',
      error
    );
  }
}

/**
 * 根据坐标范围搜索 POI（矩形区域）
 */
export async function searchPOIByBounds(
  params: POISearchParams & {
    bounds: string; // 左下角经纬度,右上角经纬度
  }
): Promise<POIItem[]> {
  const apiKey = AMAP_CONFIG.serverKey;

  if (!apiKey) {
    throw new AMapError(
      AMapErrorType.PARAMETER,
      'NO_SERVER_KEY',
      '高德地图 Server Key 未配置',
    );
  }

  const baseParams: Record<string, string> = {
    key: apiKey,
    keywords: params.keywords || '',
    types: params.types || '',
    polygon: params.bounds,
    offset: String(Math.min(params.offset || 25, 25)),
    page: String(params.page || 1),
    extensions: params.extensions || 'all',
  };

  const sig = getSignedParams(baseParams);
  if (sig) {
    baseParams.sig = sig;
  }

  const queryParams = new URLSearchParams(baseParams);

  try {
    const data: POISearchResponse = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/place/polygon?${queryParams.toString()}`,
      {
        cache: 'no-store',
        timeoutMs: 8000,
      },
      2
    );

    if (data.status === '1' && data.pois) {
      return data.pois.map((poi) => ({
        id: poi.id,
        name: poi.name,
        location: poi.location,
        address: poi.address || '地址未知',
        province: poi.province || '',
        city: poi.city || '',
        district: poi.district || '',
        type: poi.type || '',
        typecode: poi.typecode || '',
        tel: poi.tel,
        photos: poi.photos,
      }));
    }

    // 处理高德API返回的错误
    const errorCode = data.infocode || data.status;
    const errorInfo = data.info || '未知错误';

    // 处理认证错误 (10009)
    if (errorCode === '10009' || errorInfo.includes('USERKEY_PLAT_NOMATCH')) {
      throw new AMapError(
        AMapErrorType.AUTHENTICATION,
        '10009',
        `高德API认证失败: ${errorInfo}`,
        data
      );
    }

    // 其他API错误：返回空数组
    console.warn(`高德地图区域搜索API错误: ${errorInfo} (${errorCode})`);
    return [];
  } catch (error) {
    console.error('高德地图 POI 区域搜索失败:', error);

    // 只对网络错误使用模拟数据
    if (error instanceof AMapError) {
      // 重新抛出认证错误
      if (error.type === AMapErrorType.AUTHENTICATION) {
        throw error;
      }
      // 其他API错误：返回空数组
      return [];
    }

    throw new AMapError(
      AMapErrorType.NETWORK,
      'NETWORK_ERROR',
      '高德地图网络请求失败',
      error
    );
  }
}

/**
 * 计算两点之间的距离
 */
export async function calculateDistance(
  origin: string, // lng,lat
  destination: string // lng,lat
): Promise<number> {
  const apiKey = AMAP_CONFIG.serverKey;

  if (!apiKey) {
    throw new AMapError(
      AMapErrorType.PARAMETER,
      'NO_SERVER_KEY',
      '高德地图 Server Key 未配置',
    );
  }

  const queryParams = new URLSearchParams({
    key: apiKey,
    origins: origin,
    destinations: destination,
    type: '1', // 直线距离
  });

  try {
    const response = await fetch(
      `${AMAP_CONFIG.baseUrl}/distance?${queryParams.toString()}`,
      { cache: 'no-store' }
    );

    const data = await response.json();

    if (data.status === '1' && data.results && data.results.length > 0) {
      return data.results[0].distance;
    }

    return 0;
  } catch (error) {
    console.error('距离计算失败:', error);
    return 0;
  }
}

/**
 * 获取高德地图静态图
 */
export function getStaticMapUrl(params: {
  location: string;
  zoom: number;
  size?: string;
  markers?: string;
}): string {
  const apiKey = AMAP_CONFIG.webKey;
  const queryParams = new URLSearchParams({
    key: apiKey,
    location: params.location,
    zoom: String(params.zoom),
    size: params.size || '400*300',
    markers: params.markers || `mid,,:${params.location}`,
  });

  return `https://restapi.amap.com/v3/staticmap?${queryParams.toString()}`;
}

/**
 * 生成导航链接
 */
export function getNavigationUrl(params: {
  name: string;
  location: string; // 终点坐标
  from?: string; // 可选起点位置，如果不提供则使用设备当前位置
  mode?: 'car' | 'bus' | 'walk' | 'bike'; // 可选导航模式，默认驾车
}): string {
  const [lng, lat] = params.location.split(',');
  const mode = params.mode || 'car';

  let url = `https://uri.amap.com/navigation?to=${lng},${lat},${encodeURIComponent(params.name)}&mode=${mode}&callnative=1`;

  if (params.from) {
    const [fromLng, fromLat] = params.from.split(',');
    url += `&from=${fromLng},${fromLat}`;
  }

  return url;
}

/**
 * 获取分类的 POI 类型字符串
 */
export function getCategoryTypes(category: string): string[] {
  const categoryConfig = CATEGORY_TYPES[category as keyof typeof CATEGORY_TYPES];
  
  if (!categoryConfig) {
    return [];
  }

  if (category === 'all') {
    // 全能盲盒：合并所有类型
    return [
      ...CATEGORY_TYPES.food.types,
      ...CATEGORY_TYPES.play.types,
      ...CATEGORY_TYPES.leisure.types,
    ];
  }

  return categoryConfig.types;
}

/**
 * 模拟数据 - 真实的北京店铺
 */

/**
 * 获取 POI 详情（使用高德 place/detail），以便获取更完整的评分 / 价格 / 图片信息
 */
export async function getPOIDetailServer(id: string): Promise<POIItem | null> {
  const apiKey = AMAP_CONFIG.serverKey;

  if (!apiKey) {
    throw new AMapError(
      AMapErrorType.PARAMETER,
      'NO_SERVER_KEY',
      '高德地图 Server Key 未配置',
    );
  }

  const baseParams: Record<string, string> = {
    key: apiKey,
    id: id,
    extensions: 'all',
  };

  try {
    const sig = getSignedParams(baseParams);
    if (sig) {
      baseParams.sig = sig;
    }

    const queryParams = new URLSearchParams(baseParams);

    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/place/detail?${queryParams.toString()}`,
      {
        cache: 'no-store',
        timeoutMs: 8000,
      },
      2
    );

    if (data.status === '1' && data.pois && data.pois.length > 0) {
      const poi = data.pois[0];

      const photos: POIPhoto[] = Array.isArray(poi.photos)
        ? poi.photos.map((p: any) => ({ url: p.url || p.photo || p.picture || '' }))
        : [];

      const rating = poi.biz_ext?.rating ? Number(poi.biz_ext.rating) : undefined;

      let cost: number | undefined = undefined;
      if (poi.biz_ext) {
        if (poi.biz_ext.cost) cost = Number(poi.biz_ext.cost);
        else if (poi.biz_ext.price) cost = Number(poi.biz_ext.price);
      }
      // 有些景区或票务信息可能放在 ticket 等字段
      if (!cost && poi.ticket) {
        const n = Number(poi.ticket);
        if (!Number.isNaN(n)) cost = n;
      }

      const result: POIItem = {
        id: poi.id,
        name: poi.name,
        location: poi.location,
        address: poi.address || '',
        province: poi.province || '',
        city: poi.city || '',
        district: poi.district || '',
        type: poi.type || '',
        typecode: poi.typecode || '',
        tel: poi.tel,
        photos,
        rating,
        cost,
      };

      return result;
    }

    const errorCode = data.infocode || data.status;
    const errorInfo = data.info || '未知错误';
    if (errorCode === '10009' || (typeof errorInfo === 'string' && errorInfo.includes('USERKEY_PLAT_NOMATCH'))) {
      throw new AMapError(
        AMapErrorType.AUTHENTICATION,
        '10009',
        `高德API认证失败: ${errorInfo}`,
        data
      );
    }

    return null;
  } catch (error) {
    console.error('高德地图 POI 详情获取失败:', error);

    if (error instanceof AMapError) {
      if (error.type === AMapErrorType.AUTHENTICATION) {
        throw error;
      }
      return null;
    }

    if (error instanceof AMapError) {
      if (error.type === AMapErrorType.AUTHENTICATION) {
        throw error;
      }
      return null;
    }

    throw new AMapError(
      AMapErrorType.NETWORK,
      'NETWORK_ERROR',
      '高德地图网络请求失败',
      error
    );
  }
}
function getMockPOIData(types?: string): POIItem[] {
  // 美食类店铺
  const foodPlaces: POIItem[] = [
    {
      id: 'food_1',
      name: '东来顺饭庄（王府井店）',
      location: '116.417063,39.916275',
      address: '北京市东城区王府井大街138号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '餐饮服务|火锅店',
      typecode: '050108',
      tel: '010-65139612',
      photos: [
        { url: 'https://picsum.photos/seed/hotpot1/400/300', title: '店铺外观' },
        { url: 'https://picsum.photos/seed/hotpot2/400/300', title: '火锅美食' },
      ],
    },
    {
      id: 'food_2',
      name: '全聚德烤鸭店（和平门店）',
      location: '116.407499,39.928722',
      address: '北京市东城区和平门北滨河路1号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-65122218',
      photos: [
        { url: 'https://picsum.photos/seed/duck1/400/300', title: '烤鸭' },
        { url: 'https://picsum.photos/seed/duck2/400/300', title: '店面' },
      ],
    },
    {
      id: 'food_3',
      name: '护国寺小吃（西单店）',
      location: '116.374355,39.912345',
      address: '北京市西城区西单北大街87号',
      province: '北京市',
      city: '北京市',
      district: '西城区',
      type: '餐饮服务|小吃店',
      typecode: '050103',
      tel: '010-66025774',
      photos: [
        { url: 'https://picsum.photos/seed/snack1/400/300', title: '小吃' },
      ],
    },
    {
      id: 'food_4',
      name: '鼎泰丰（国贸店）',
      location: '116.457925,39.909248',
      address: '北京市朝阳区国贸商城B1层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-65056688',
      photos: [
        { url: 'https://picsum.photos/seed/dimsum1/400/300', title: '小笼包' },
        { url: 'https://picsum.photos/seed/dimsum2/400/300', title: '店内' },
      ],
    },
    {
      id: 'food_5',
      name: '绿茶餐厅（三里屯店）',
      location: '116.447735,39.938423',
      address: '北京市朝阳区三里屯路19号院',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-64178888',
      photos: [
        { url: 'https://picsum.photos/seed/green1/400/300', title: '菜品' },
      ],
    },
    {
      id: 'food_6',
      name: '海底捞火锅（望京店）',
      location: '116.473234,39.996789',
      address: '北京市朝阳区望京SOHO T2 3层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '餐饮服务|火锅店',
      typecode: '050108',
      tel: '010-84704466',
      photos: [
        { url: 'https://picsum.photos/seed/haidilao1/400/300', title: '火锅' },
      ],
    },
    {
      id: 'food_7',
      name: '羲和雅苑烤鸭坊',
      location: '116.407394,39.904211',
      address: '北京市东城区前门大街36号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-67028888',
      photos: [
        { url: 'https://picsum.photos/seed/xihe1/400/300', title: '烤鸭' },
      ],
    },
    {
      id: 'food_8',
      name: '便宜坊烤鸭店（崇文门店）',
      location: '116.412244,39.902182',
      address: '北京市东城区崇文门外大街16号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-67021818',
      photos: [
        { url: 'https://picsum.photos/seed/bianyi1/400/300', title: '烤鸭' },
      ],
    },
    {
      id: 'food_9',
      name: '金鼎轩（方庄店）',
      location: '116.437234,39.872234',
      address: '北京市丰台区方庄芳城园一区',
      province: '北京市',
      city: '北京市',
      district: '丰台区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-67668866',
      photos: [
        { url: 'https://picsum.photos/seed/jinding1/400/300', title: '粤菜' },
      ],
    },
    {
      id: 'food_10',
      name: '西贝莜面村（朝阳大悦城店）',
      location: '116.456789,39.912345',
      address: '北京市朝阳区朝阳大悦城6层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '餐饮服务|中餐厅',
      typecode: '050100',
      tel: '010-85528866',
      photos: [
        { url: 'https://picsum.photos/seed/xibei1/400/300', title: '莜面' },
      ],
    },
  ];

  // 游玩类店铺
  const playPlaces: POIItem[] = [
    {
      id: 'play_1',
      name: '北京欢乐谷',
      location: '116.507234,39.867234',
      address: '北京市朝阳区东四环小武基北路',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '游乐场',
      typecode: '080700',
      tel: '010-67389898',
      photos: [
        { url: 'https://picsum.photos/seed/happy1/400/300', title: '欢乐谷' },
        { url: 'https://picsum.photos/seed/happy2/400/300', title: '游乐设施' },
      ],
    },
    {
      id: 'play_2',
      name: '北京海洋馆',
      location: '116.395678,39.944567',
      address: '北京市海淀区高梁桥斜街乙18号',
      province: '北京市',
      city: '北京市',
      district: '海淀区',
      type: '动物园',
      typecode: '090200',
      tel: '010-62176655',
      photos: [
        { url: 'https://picsum.photos/seed/ocean1/400/300', title: '海洋馆' },
      ],
    },
    {
      id: 'play_3',
      name: '北京天文馆',
      location: '116.397567,39.944567',
      address: '北京市西城区西直门外大街138号',
      province: '北京市',
      city: '北京市',
      district: '西城区',
      type: '科技馆',
      typecode: '140400',
      tel: '010-68312517',
      photos: [
        { url: 'https://picsum.photos/seed/astro1/400/300', title: '天文馆' },
      ],
    },
    {
      id: 'play_4',
      name: '北京动物园',
      location: '116.337567,39.947567',
      address: '北京市西城区西直门外大街137号',
      province: '北京市',
      city: '北京市',
      district: '西城区',
      type: '动物园',
      typecode: '090200',
      tel: '010-68390274',
      photos: [
        { url: 'https://picsum.photos/seed/zoo1/400/300', title: '动物园' },
      ],
    },
    {
      id: 'play_5',
      name: '逃脱反斗城密室逃脱',
      location: '116.473234,39.996789',
      address: '北京市朝阳区望京SOHO T2 B1层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '娱乐场所|游戏厅',
      typecode: '080804',
      tel: '010-84708866',
      photos: [
        { url: 'https://picsum.photos/seed/escape1/400/300', title: '密室' },
      ],
    },
    {
      id: 'play_6',
      name: 'Mega Fun 密室',
      location: '116.447735,39.938423',
      address: '北京市朝阳区三里屯SOHO 5层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '娱乐场所|游戏厅',
      typecode: '080804',
      tel: '010-65088899',
      photos: [
        { url: 'https://picsum.photos/seed/mega1/400/300', title: '密室逃脱' },
      ],
    },
    {
      id: 'play_7',
      name: '北京奥林匹克公园',
      location: '116.395467,39.992808',
      address: '北京市朝阳区奥林匹克公园',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '公园广场',
      typecode: '010100',
      tel: '010-64529000',
      photos: [
        { url: 'https://picsum.photos/seed/park1/400/300', title: '鸟巢' },
        { url: 'https://picsum.photos/seed/park2/400/300', title: '水立方' },
      ],
    },
    {
      id: 'play_8',
      name: '北京世界公园',
      location: '116.307234,39.807234',
      address: '北京市丰台区花乡丰葆路158号',
      province: '北京市',
      city: '北京市',
      district: '丰台区',
      type: '公园广场',
      typecode: '010100',
      tel: '010-83613688',
      photos: [
        { url: 'https://picsum.photos/seed/world1/400/300', title: '世界公园' },
      ],
    },
  ];

  // 休闲类店铺
  const leisurePlaces: POIItem[] = [
    {
      id: 'leisure_1',
      name: 'CGV影城（颐堤港店）',
      location: '116.487234,39.957234',
      address: '北京市朝阳区酒仙桥路18号颐堤港4层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '影剧院',
      typecode: '140700',
      tel: '010-84288866',
      photos: [
        { url: 'https://picsum.photos/seed/cgv1/400/300', title: '影城' },
      ],
    },
    {
      id: 'leisure_2',
      name: '百老汇影城（apm店）',
      location: '116.397499,39.908722',
      address: '北京市东城区东直门南大街apm 6层',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '影剧院',
      typecode: '140700',
      tel: '010-58106666',
      photos: [
        { url: 'https://picsum.photos/seed/broadway1/400/300', title: '影院' },
      ],
    },
    {
      id: 'leisure_3',
      name: 'PAGEONE书店（前门店）',
      location: '116.395678,39.904567',
      address: '北京市东城区前门大街62号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '书店',
      typecode: '150200',
      tel: '010-67028877',
      photos: [
        { url: 'https://picsum.photos/seed/page1/400/300', title: '书店' },
      ],
    },
    {
      id: 'leisure_4',
      name: '单向空间（爱琴海店）',
      location: '116.457234,39.882234',
      address: '北京市朝阳区太阳宫中路爱琴海购物中心3层',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '书店',
      typecode: '150200',
      tel: '010-84428899',
      photos: [
        { url: 'https://picsum.photos/seed/oneway1/400/300', title: '单向空间' },
      ],
    },
    {
      id: 'leisure_5',
      name: '老舍茶馆',
      location: '116.407394,39.904211',
      address: '北京市西城区前门西大街正阳市场3号楼',
      province: '北京市',
      city: '北京市',
      district: '西城区',
      type: '茶馆',
      typecode: '150100',
      tel: '010-63036830',
      photos: [
        { url: 'https://picsum.photos/seed/tea1/400/300', title: '茶馆' },
      ],
    },
    {
      id: 'leisure_6',
      name: 'Mao Livehouse',
      location: '116.407234,39.924234',
      address: '北京市东城区鼓楼东大街111号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '娱乐场所|歌舞厅',
      typecode: '080800',
      tel: '010-64028811',
      photos: [
        { url: 'https://picsum.photos/seed/mao1/400/300', title: 'Livehouse' },
      ],
    },
    {
      id: 'leisure_7',
      name: '国家博物馆',
      location: '116.397499,39.908722',
      address: '北京市东城区东长安街16号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '展览馆',
      typecode: '140200',
      tel: '010-65116400',
      photos: [
        { url: 'https://picsum.photos/seed/museum1/400/300', title: '国家博物馆' },
      ],
    },
    {
      id: 'leisure_8',
      name: '今日美术馆',
      location: '116.447735,39.938423',
      address: '北京市朝阳区百子湾路32号',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '展览馆',
      typecode: '140200',
      tel: '010-58760666',
      photos: [
        { url: 'https://picsum.photos/seed/today1/400/300', title: '美术馆' },
      ],
    },
    {
      id: 'leisure_9',
      name: '英皇电影城（寿康宫店）',
      location: '116.407499,39.916275',
      address: '北京市东城区王府井大街99号',
      province: '北京市',
      city: '北京市',
      district: '东城区',
      type: '影剧院',
      typecode: '140700',
      tel: '010-65289666',
      photos: [
        { url: 'https://picsum.photos/seed/emperor1/400/300', title: '影城' },
      ],
    },
    {
      id: 'leisure_10',
      name: '雕刻时光咖啡馆（三里屯店）',
      location: '116.447735,39.938423',
      address: '北京市朝阳区三里屯南街甲15号',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      type: '餐饮服务|咖啡厅',
      typecode: '050600',
      tel: '010-64176655',
      photos: [
        { url: 'https://picsum.photos/seed/carve1/400/300', title: '咖啡馆' },
      ],
    },
  ];

  // 根据类型筛选
  if (types) {
    const allPlaces = [...foodPlaces, ...playPlaces, ...leisurePlaces];
    // 类型可能包含多个值，用 | 分隔
    const typeKeywords = types.split('|').map(t => t.toLowerCase());
    return allPlaces.filter((item) =>
      typeKeywords.some(keyword =>
        item.type.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword)
      )
    );
  }

  // 默认返回所有店铺
  return [...foodPlaces, ...playPlaces, ...leisurePlaces];
}

export interface SuggestionItem {
  id: string;
  name: string;
  district: string;
  address: string;
  location: string;
  type: string;
}

export interface ReverseGeocodeItem {
  formattedAddress: string;
  province: string;
  city: string;
  district: string;
  adcode: string;
  location: string;
  township?: string;
  neighborhood?: string;
  building?: string;
  nearestPoiName?: string;
}

/**
 * 地址搜索建议（输入提示）
 */
export async function searchSuggestion(keywords: string, city: string): Promise<SuggestionItem[]> {
  const apiKey = AMAP_CONFIG.serverKey;
  if (!apiKey) {
    console.warn('高德地图 Server Key 未配置，返回空建议列表');
    return [];
  }

  const baseParams: Record<string, string> = {
    key: apiKey,
    keywords: String(keywords || '').trim(),
    city: String(city || '').trim() || '全国',
    output: 'JSON',
  };

  const sig = getSignedParams(baseParams);
  if (sig) baseParams.sig = sig;

  const queryParams = new URLSearchParams(baseParams);

  try {
    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/assistant/inputtips?${queryParams.toString()}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', timeoutMs: 5000 },
      1
    );

    if (data.status === '1' && Array.isArray(data.tips)) {
      return data.tips
        .filter((tip: any) => tip.location && tip.location !== '0,0')
        .map((tip: any) => ({
          id: tip.id || '',
          name: tip.name || '',
          district: tip.district || '',
          address: tip.address || '',
          location: tip.location || '',
          type: tip.typecode || '',
        }));
    }
    return [];
  } catch (error) {
    console.error('地址搜索建议失败:', error);
    return [];
  }
}

/**
 * 逆地理编码（根据经纬度获取地址）
 */
export async function reverseGeocodeServer(location: string): Promise<ReverseGeocodeItem | null> {
  const apiKey = AMAP_CONFIG.serverKey;
  if (!apiKey) {
    throw new AMapError(AMapErrorType.PARAMETER, 'NO_SERVER_KEY', '高德地图 Server Key 未配置');
  }

  const loc = String(location || '').trim();
  if (!loc) return null;

  const baseParams: Record<string, string> = {
    key: apiKey,
    location: loc,
    extensions: 'all',
  };

  const sig = getSignedParams(baseParams);
  if (sig) baseParams.sig = sig;

  const queryParams = new URLSearchParams(baseParams);

  try {
    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/geocode/regeo?${queryParams.toString()}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', timeoutMs: 8000 },
      2
    );

    if (data.status === '1' && data.regeocode) {
      const addr = data.regeocode.formatted_address || '';
      const comp = data.regeocode.addressComponent || {};
      const nearestPoiName = Array.isArray(data.regeocode.pois) && data.regeocode.pois.length > 0
        ? (data.regeocode.pois[0]?.name || '')
        : '';
      return {
        formattedAddress: addr,
        province: comp.province || '',
        city: typeof comp.city === 'string' ? comp.city : '',
        district: comp.district || '',
        adcode: comp.adcode || '',
        location: loc,
        township: comp.township || '',
        neighborhood: comp.neighborhood?.name || '',
        building: comp.building?.name || '',
        nearestPoiName,
      };
    }
    return null;
  } catch (error) {
    console.error('逆地理编码失败:', error);
    if (error instanceof AMapError) throw error;
    throw new AMapError(AMapErrorType.NETWORK, 'NETWORK_ERROR', '逆地理编码请求失败', error);
  }
}

export interface IPLocationResult {
  province: string;
  city: string;
  adcode: string;
  rectangle: string; // ??????
  location: string; // ???(????)
}

/**
 * ??? IP ????? IP ?? API?
 * ?????????? GPS ???
 */
export async function ipLocationServer(): Promise<IPLocationResult | null> {
  const apiKey = AMAP_CONFIG.serverKey;
  if (!apiKey) {
    console.warn('???? Server Key ???????? IP ??');
    return null;
  }

  const params = new URLSearchParams({ key: apiKey });
  const sig = getSignedParams(Object.fromEntries(params));
  if (sig) params.set('sig', sig);

  try {
    const data: any = await fetchJsonWithRetry(
      `${AMAP_CONFIG.baseUrl}/ip?${params.toString()}`,
      { headers: { 'Accept': 'application/json' }, cache: 'no-store', timeoutMs: 5000 },
      1
    );

    if (data.status === '1' && data.province) {
      const rectParts = (data.rectangle || '').split(';');
      let centerLocation = '';
      if (rectParts.length >= 2) {
        const [lng1, lat1] = rectParts[0].split(',').map(Number);
        const [lng2, lat2] = rectParts[1].split(',').map(Number);
        if (!isNaN(lng1) && !isNaN(lat1) && !isNaN(lng2) && !isNaN(lat2)) {
          centerLocation = `${((lng1 + lng2) / 2).toFixed(6)},${((lat1 + lat2) / 2).toFixed(6)}`;
        }
      }
      return {
        province: data.province || '',
        city: data.city || '',
        adcode: data.adcode || '',
        rectangle: data.rectangle || '',
        location: centerLocation,
      };
    }
    return null;
  } catch (error) {
    console.error('IP ????:', error);
    return null;
  }
}
export { CATEGORY_TYPES, getMockPOIData };

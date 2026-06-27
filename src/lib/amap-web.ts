// 高德地图 Web JS API 工具函数
// 用于前端计算导航距离和获取POI详细信息

export interface DistanceInfo {
  distance: string; // 格式化距离，如 "2.5公里"
  duration: string; // 格式化时间，如 "15分钟"
  rawDistance: number; // 原始距离（米）
  rawDuration: number; // 原始时间（秒）
  path: Array<{ lng: number; lat: number }>; // 导航路径点
}

export interface POIDetails {
  id: string;
  name: string;
  location: string; // "lng,lat" 格式
  address: string;
  tel: string;
  photos: { url: string; title?: string }[];
  rating: number;
  price: number;
  businessHours: string;
  // 其他高德地图POI详情字段
}

// 等待AMap加载完成的工具函数
export function waitForAMap(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.AMap) {
      resolve(window.AMap);
      return;
    }

    const checkInterval = setInterval(() => {
      if (typeof window !== 'undefined' && window.AMap) {
        clearInterval(checkInterval);
        resolve(window.AMap);
      }
    }, 100);

    // 10秒超时
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('AMap加载超时'));
    }, 10000);
  });
}

// 定位结果类型（包含精度和地址信息）
export interface LocationResult {
  lng: number;
  lat: number;
  accuracy?: number;      // 精度（米）
  formattedAddress?: string;  // 格式化地址
  nearbyPoi?: string;     // 附近POI名称
}

// 获取用户当前位置（使用高德地图Geolocation插件）
export async function getUserCurrentLocation(): Promise<LocationResult | null> {
  try {
    const AMap = await waitForAMap();

    return new Promise((resolve) => {
      if (!AMap.Geolocation) {
        console.warn('AMap.Geolocation插件未加载');
        resolve(null);
        return;
      }

      const geolocation = new AMap.Geolocation({
        enableHighAccuracy: true,
        timeout: 10000,  // 10秒超时（原5秒）
        maximumAge: 0,
      });

      geolocation.getCurrentPosition((status: string, result: any) => {
        if (status === 'complete' && result.position) {
          const accuracy = result.accuracy;
          const formattedAddress = result.formattedAddress;
          // 提取附近POI信息
          const nearbyPoi = result.pois?.[0]?.name || result.poiList?.[0]?.name;

          // 精度验证：检查是否 <= 100米
          if (accuracy !== undefined && accuracy > 100) {
            console.warn(`[定位] 精度不足: ${accuracy}米（阈值: 100米），尝试IP定位...`);
            // 精度不足时返回部分数据，让调用方决定是否使用IP定位
            resolve({
              lng: result.position.lng,
              lat: result.position.lat,
              accuracy,
              formattedAddress,
              nearbyPoi,
            });
            return;
          }

          console.log(`[定位] 高德定位成功, 精度: ${accuracy || '未知'}m, 地址: ${formattedAddress || '未知'}`);
          resolve({
            lng: result.position.lng,
            lat: result.position.lat,
            accuracy,
            formattedAddress,
            nearbyPoi,
          });
        } else {
          console.warn('获取用户位置失败:', result?.message || '未知错误');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('获取用户位置出错:', error);
    return null;
  }
}

// 计算驾车距离
export async function calculateDrivingDistance(
  destination: string, // "lng,lat" 格式
  origin?: string | { lng: number; lat: number }
): Promise<DistanceInfo | null> {
  try {
    const AMap = await waitForAMap();

    if (!AMap.Driving) {
      console.warn('AMap.Driving插件未加载');
      return null;
    }

    // 解析目的地坐标
    const [destLngStr, destLatStr] = destination.split(',');
    const destLng = parseFloat(destLngStr);
    const destLat = parseFloat(destLatStr);

    if (isNaN(destLng) || isNaN(destLat)) {
      console.error('目的地坐标格式错误:', destination);
      return null;
    }

    // 获取起点坐标
    let startPoint: { lng: number; lat: number };
    if (origin) {
      if (typeof origin === 'string') {
        const [lngStr, latStr] = origin.split(',');
        startPoint = { lng: parseFloat(lngStr), lat: parseFloat(latStr) };
      } else {
        startPoint = origin;
      }
    } else {
      // 获取用户当前位置
      const userLocation = await getUserCurrentLocation();
      if (!userLocation) {
        console.warn('无法获取用户位置，使用默认起点');
        return null;
      }
      startPoint = userLocation;
    }

    return new Promise((resolve) => {
      const driving = new AMap.Driving({
        policy: AMap.DrivingPolicy.LEAST_TIME, // 最快路线
        ferry: 0, // 不乘坐轮渡
      });

      driving.search(startPoint, [destLng, destLat], (status: string, result: any) => {
        if (status === 'complete' && result.routes && result.routes.length > 0) {
          const route = result.routes[0];
          const distance = route.distance; // 米
          const duration = route.time; // 秒

          // 格式化距离
          let formattedDistance: string;
          if (distance < 1000) {
            formattedDistance = `${Math.round(distance)}米`;
          } else {
            formattedDistance = `${(distance / 1000).toFixed(1)}公里`;
          }

          // 格式化时间
          let formattedDuration: string;
          if (duration < 60) {
            formattedDuration = `${Math.round(duration)}秒`;
          } else if (duration < 3600) {
            formattedDuration = `${Math.round(duration / 60)}分钟`;
          } else {
            const hours = Math.floor(duration / 3600);
            const minutes = Math.round((duration % 3600) / 60);
            formattedDuration = minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
          }

          // 提取路径点
          const path: Array<{ lng: number; lat: number }> = [];
          if (route.steps && route.steps.length > 0) {
            route.steps.forEach((step: any) => {
              if (step.path && Array.isArray(step.path)) {
                step.path.forEach((point: any) => {
                  path.push({ lng: point.lng, lat: point.lat });
                });
              }
            });
          }

          resolve({
            distance: formattedDistance,
            duration: formattedDuration,
            rawDistance: distance,
            rawDuration: duration,
            path,
          });
        } else {
          console.warn('驾车路线规划失败:', result?.info || '未知错误');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('计算驾车距离出错:', error);
    return null;
  }
}

// 计算步行距离
export async function calculateWalkingDistance(
  destination: string, // "lng,lat" 格式
  origin?: string | { lng: number; lat: number }
): Promise<DistanceInfo | null> {
  try {
    const AMap = await waitForAMap();

    if (!AMap.Walking) {
      console.warn('AMap.Walking插件未加载');
      return null;
    }

    // 解析目的地坐标
    const [destLngStr, destLatStr] = destination.split(',');
    const destLng = parseFloat(destLngStr);
    const destLat = parseFloat(destLatStr);

    if (isNaN(destLng) || isNaN(destLat)) {
      console.error('目的地坐标格式错误:', destination);
      return null;
    }

    // 获取起点坐标
    let startPoint: { lng: number; lat: number };
    if (origin) {
      if (typeof origin === 'string') {
        const [lngStr, latStr] = origin.split(',');
        startPoint = { lng: parseFloat(lngStr), lat: parseFloat(latStr) };
      } else {
        startPoint = origin;
      }
    } else {
      // 获取用户当前位置
      const userLocation = await getUserCurrentLocation();
      if (!userLocation) {
        console.warn('无法获取用户位置，使用默认起点');
        return null;
      }
      startPoint = userLocation;
    }

    return new Promise((resolve) => {
      const walking = new AMap.Walking({
        policy: AMap.WalkingPolicy.LEAST_TIME, // 最快路线
      });

      walking.search(startPoint, [destLng, destLat], (status: string, result: any) => {
        if (status === 'complete' && result.routes && result.routes.length > 0) {
          const route = result.routes[0];
          const distance = route.distance; // 米
          const duration = route.time; // 秒

          // 格式化距离
          let formattedDistance: string;
          if (distance < 1000) {
            formattedDistance = `${Math.round(distance)}米`;
          } else {
            formattedDistance = `${(distance / 1000).toFixed(1)}公里`;
          }

          // 格式化时间
          let formattedDuration: string;
          if (duration < 60) {
            formattedDuration = `${Math.round(duration)}秒`;
          } else if (duration < 3600) {
            formattedDuration = `${Math.round(duration / 60)}分钟`;
          } else {
            const hours = Math.floor(duration / 3600);
            const minutes = Math.round((duration % 3600) / 60);
            formattedDuration = minutes > 0 ? `${hours}小时${minutes}分钟` : `${hours}小时`;
          }

          // 提取路径点
          const path: Array<{ lng: number; lat: number }> = [];
          if (route.steps && route.steps.length > 0) {
            route.steps.forEach((step: any) => {
              if (step.path && Array.isArray(step.path)) {
                step.path.forEach((point: any) => {
                  path.push({ lng: point.lng, lat: point.lat });
                });
              }
            });
          }

          resolve({
            distance: formattedDistance,
            duration: formattedDuration,
            rawDistance: distance,
            rawDuration: duration,
            path,
          });
        } else {
          console.warn('步行路线规划失败:', result?.info || '未知错误');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('计算步行距离出错:', error);
    return null;
  }
}

// 获取POI详细信息（包括图片）
export async function getPOIDetailsWeb(poiId: string): Promise<POIDetails | null> {
  try {
    const AMap = await waitForAMap();

    if (!AMap.PlaceSearch) {
      console.warn('AMap.PlaceSearch插件未加载');
      return null;
    }

    return new Promise((resolve) => {
      const placeSearch = new AMap.PlaceSearch({
        pageSize: 1,
        pageIndex: 1,
      });

      placeSearch.getDetails(poiId, (status: string, result: any) => {
        if (status === 'complete' && result.poiList && result.poiList.length > 0) {
          const poi = result.poiList[0];

          // 处理图片
          const photos: { url: string; title?: string }[] = [];
          if (poi.photos && Array.isArray(poi.photos)) {
            poi.photos.forEach((photo: any) => {
              if (photo.url) {
                photos.push({
                  url: photo.url,
                  title: photo.title,
                });
              }
            });
          }

          const details: POIDetails = {
            id: poi.id || poiId,
            name: poi.name || '',
            location: poi.location?.toString() || '',
            address: poi.address || '',
            tel: poi.tel || '',
            photos,
            rating: poi.rating || 0,
            price: poi.cost || 0,
            businessHours: poi.businessHours || '',
          };

          resolve(details);
        } else {
          console.warn('获取POI详情失败:', result?.info || '未知错误');
          resolve(null);
        }
      });
    });
  } catch (error) {
    console.error('获取POI详情出错:', error);
    return null;
  }
}

// 搜索POI（通过Web API）
export async function searchPOIWeb(
  keyword: string,
  city: string = '北京'
): Promise<any[]> {
  try {
    const AMap = await waitForAMap();

    if (!AMap.PlaceSearch) {
      console.warn('AMap.PlaceSearch插件未加载');
      return [];
    }

    return new Promise((resolve) => {
      const placeSearch = new AMap.PlaceSearch({
        city,
        pageSize: 20,
        pageIndex: 1,
      });

      placeSearch.search(keyword, (status: string, result: any) => {
        if (status === 'complete' && result.poiList && result.poiList.length > 0) {
          resolve(result.poiList);
        } else {
          console.warn('搜索POI失败:', result?.info || '未知错误');
          resolve([]);
        }
      });
    });
  } catch (error) {
    console.error('搜索POI出错:', error);
    return [];
  }
}

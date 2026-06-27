// 高德地图全局类型声明
interface AMapStatic {
  AutoComplete: any;
  PlaceSearch: any;
  Geolocation: any;
  LngLat: any;
  Driving: any;
  DrivingPolicy: {
    LEAST_TIME: number;
    LEAST_FEE: number;
    LEAST_DISTANCE: number;
    REAL_TRAFFIC: number;
  };
  Walking: any;
  WalkingPolicy: {
    LEAST_TIME: number;
    LEAST_DISTANCE: number;
  };
}

interface Window {
  AMap: AMapStatic;
  _AMapSecurityConfig?: {
    securityJsCode: string;
  };
  checkAMapLoaded?: () => boolean;
}
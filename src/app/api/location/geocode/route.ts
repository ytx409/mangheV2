import { NextResponse } from 'next/server';
import { geocodeAddressServer, AMapError, AMapErrorType } from '@/lib/amap';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const address = url.searchParams.get('address') || '';
    const city = url.searchParams.get('city') || '';

    if (!address.trim()) {
      return NextResponse.json({ success: false, message: '缺少 address 参数' }, { status: 400 });
    }

    let geo = null;
    try {
      geo = await geocodeAddressServer({ address, city: city.trim() ? city : undefined });
    } catch (error) {
      if (error instanceof AMapError && error.type === AMapErrorType.AUTHENTICATION) {
        return NextResponse.json({
          success: false,
          message: '高德API认证失败，请检查 AMAP_SERVER_KEY',
          error: { code: error.code, type: error.type, info: error.originalError?.info || error.message },
        }, { status: 500 });
      }
      if (error instanceof AMapError && error.type === AMapErrorType.NETWORK) {
        return NextResponse.json({
          success: false,
          message: '高德服务请求失败，请稍后重试',
          error: { code: error.code, type: error.type, info: error.message },
        }, { status: 503 });
      }
      if (error instanceof AMapError && error.code === 'NO_SERVER_KEY') {
        return NextResponse.json({
          success: false,
          message: '未配置高德地图服务端 Key，无法进行地理编码',
          error: { code: error.code, type: error.type },
        }, { status: 500 });
      }
      throw error;
    }

    if (!geo?.location) {
      return NextResponse.json({ success: false, message: '未找到该地址的坐标' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: geo,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: '服务端错误',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

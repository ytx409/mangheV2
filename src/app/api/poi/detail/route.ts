import { NextResponse } from 'next/server';
import { getPOIDetailServer, AMapError, AMapErrorType } from '@/lib/amap';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';

    if (!id.trim()) {
      return NextResponse.json({ success: false, message: '缺少 id 参数' }, { status: 400 });
    }

    const detail = await getPOIDetailServer(id.trim());
    if (!detail) {
      return NextResponse.json({ success: false, message: '未找到该 POI 详情' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: detail,
    });
  } catch (error) {
    if (error instanceof AMapError) {
      if (error.type === AMapErrorType.AUTHENTICATION) {
        return NextResponse.json({
          success: false,
          message: '高德API认证失败，请检查 AMAP_SERVER_KEY',
          error: { type: error.type, code: error.code, info: error.originalError?.info || error.message },
        }, { status: 500 });
      }
      if (error.type === AMapErrorType.NETWORK) {
        return NextResponse.json({
          success: false,
          message: '高德服务请求失败，请稍后重试',
          error: { type: error.type, code: error.code, info: error.message },
        }, { status: 503 });
      }
      if (error.code === 'NO_SERVER_KEY') {
        return NextResponse.json({
          success: false,
          message: '未配置高德地图服务端 Key，无法获取 POI 详情',
          error: { type: error.type, code: error.code },
        }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: false,
      message: '服务端错误',
      error: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}

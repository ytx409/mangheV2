import { NextResponse } from 'next/server';
import { diagnoseAMapAPI, formatDiagnosisResult } from '@/lib/amap-diagnostic';

export const dynamic = 'force-dynamic'; // 禁用缓存，确保获取最新状态

/**
 * GET /api/admin/amap-status
 * 返回高德地图API的配置状态和诊断信息
 */
export async function GET() {
  try {
    console.log('高德地图API状态检查请求');

    // 运行诊断
    const diagnosis = await diagnoseAMapAPI();

    // 记录诊断结果
    console.log('诊断结果:', {
      success: diagnosis.success,
      errors: diagnosis.errors.length,
      warnings: diagnosis.warnings.length,
    });

    // 格式化结果用于控制台
    const formattedResult = formatDiagnosisResult(diagnosis);
    console.log('诊断详情:\n' + formattedResult);

    // 返回JSON响应
    return NextResponse.json({
      success: true,
      data: diagnosis,
      formatted: formattedResult,
      timestamp: new Date().toISOString(),
      note: '如需修复配置，请按照suggestions中的建议操作',
    });

  } catch (error) {
    console.error('高德地图API状态检查失败:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error && process.env.NODE_ENV === 'development' ? error.stack : undefined;

    return NextResponse.json({
      success: false,
      error: {
        message: errorMessage,
        stack: errorStack,
      },
      timestamp: new Date().toISOString(),
      suggestion: '检查诊断工具实现或服务器配置',
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/amap-status/test
 * 执行特定的API测试
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { testType = 'basic', params = {} } = body;

    console.log(`执行API测试: ${testType}`, params);

    let result;
    if (testType === 'basic') {
      // 基本连接测试
      const diagnosis = await diagnoseAMapAPI();
      result = {
        testType,
        success: diagnosis.success,
        config: diagnosis.config,
        apiTests: diagnosis.apiTests,
      };
    } else {
      result = {
        testType,
        success: false,
        error: `未知的测试类型: ${testType}`,
      };
    }

    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('API测试失败:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

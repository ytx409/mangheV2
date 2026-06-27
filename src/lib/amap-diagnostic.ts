// 高德地图API诊断工具
import { AMAP_CONFIG } from './amap-config';

export interface DiagnosisResult {
  success: boolean;
  timestamp: string;
  config: {
    webKey: {
      configured: boolean;
      isDefault: boolean;
      valid: boolean;
    };
    serverKey: {
      configured: boolean;
      isDefault: boolean;
      valid: boolean;
    };
    securityCode: {
      configured: boolean;
      isDefault: boolean;
    };
  };
  apiTests: {
    webApi?: ApiTestResult;
    serverApi?: ApiTestResult;
  };
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface ApiTestResult {
  success: boolean;
  status: string;
  info: string;
  infocode: string;
  responseTime: number;
  data?: any;
}

// 默认Key值（用于检测是否使用默认配置）
const DEFAULT_WEB_KEY = '727340e4952ce76d0e89b2ffe48927f1';
const DEFAULT_SERVER_KEY = '727340e4952ce76d0e89b2ffe48927f1';
const DEFAULT_SECURITY_CODE = '14492cac8a07efffe968a02e8a0db256';

/**
 * 诊断高德地图API配置和连接状态
 */
export async function diagnoseAMapAPI(): Promise<DiagnosisResult> {
  const result: DiagnosisResult = {
    success: false,
    timestamp: new Date().toISOString(),
    config: {
      webKey: {
        configured: false,
        isDefault: false,
        valid: false,
      },
      serverKey: {
        configured: false,
        isDefault: false,
        valid: false,
      },
      securityCode: {
        configured: false,
        isDefault: false,
      },
    },
    apiTests: {},
    errors: [],
    warnings: [],
    suggestions: [],
  };

  try {
    // 检查配置
    await checkConfiguration(result);

    // 测试API连接
    await testAPIConnections(result);

    // 生成建议
    generateSuggestions(result);

    // 确定总体成功状态
    result.success = result.config.serverKey.valid &&
                    (result.apiTests.serverApi?.success === true);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.errors.push(`诊断过程出错: ${errorMessage}`);
    return result;
  }
}

/**
 * 检查配置
 */
async function checkConfiguration(result: DiagnosisResult): Promise<void> {
  // 检查Web Key
  const webKey = AMAP_CONFIG.webKey;
  result.config.webKey.configured = !!webKey;
  result.config.webKey.isDefault = webKey === DEFAULT_WEB_KEY;

  // 检查Server Key
  const serverKey = AMAP_CONFIG.serverKey;
  result.config.serverKey.configured = !!serverKey;
  result.config.serverKey.isDefault = serverKey === DEFAULT_SERVER_KEY;

  // 检查安全代码
  const securityCode = AMAP_CONFIG.securityJsCode;
  result.config.securityCode.configured = !!securityCode;
  result.config.securityCode.isDefault = securityCode === DEFAULT_SECURITY_CODE;

  // 添加警告
  if (result.config.serverKey.isDefault) {
    result.warnings.push('Server Key 使用默认值，这会导致API认证失败 (10009)');
  }

  if (result.config.webKey.isDefault) {
    result.warnings.push('Web Key 使用默认值，可能无法正常使用');
  }

  if (!result.config.serverKey.configured) {
    result.errors.push('Server Key 未配置，这是服务端API调用的必需项');
  }
}

/**
 * 测试API连接
 */
async function testAPIConnections(result: DiagnosisResult): Promise<void> {
  // 测试Server API（使用服务端Key）
  if (result.config.serverKey.configured) {
    result.apiTests.serverApi = await testServerAPI(AMAP_CONFIG.serverKey);
    result.config.serverKey.valid = result.apiTests.serverApi?.success === true;

    if (!result.config.serverKey.valid) {
      result.errors.push(`Server API测试失败: ${result.apiTests.serverApi?.info || '未知错误'}`);
    }
  }

  // 测试Web API（使用Web Key）
  if (result.config.webKey.configured) {
    result.apiTests.webApi = await testWebAPI(AMAP_CONFIG.webKey);
    result.config.webKey.valid = result.apiTests.webApi?.success === true;

    if (!result.config.webKey.valid) {
      result.warnings.push(`Web API测试失败: ${result.apiTests.webApi?.info || '未知错误'}`);
    }
  }
}

/**
 * 测试服务端API
 */
async function testServerAPI(apiKey: string): Promise<ApiTestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(
      `https://restapi.amap.com/v3/place/text?key=${apiKey}&keywords=测试&city=北京&offset=1`,
      {
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }
    );

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    return {
      success: data.status === '1',
      status: data.status,
      info: data.info,
      infocode: data.infocode,
      responseTime,
      data: data.pois ? data.pois.slice(0, 2) : undefined, // 只包含前2个结果用于验证
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: 'error',
      info: `网络请求失败: ${errorMessage}`,
      infocode: 'NETWORK_ERROR',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * 测试Web API（简单测试）
 */
async function testWebAPI(apiKey: string): Promise<ApiTestResult> {
  const startTime = Date.now();

  try {
    // Web API测试可以使用不同的端点或参数
    const response = await fetch(
      `https://restapi.amap.com/v3/place/text?key=${apiKey}&keywords=北京&city=北京&offset=1`,
      {
        headers: {
          'Accept': 'application/json',
        },
        cache: 'no-store',
      }
    );

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    return {
      success: data.status === '1',
      status: data.status,
      info: data.info,
      infocode: data.infocode,
      responseTime,
      data: data.pois ? data.pois.slice(0, 1) : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      status: 'error',
      info: `网络请求失败: ${errorMessage}`,
      infocode: 'NETWORK_ERROR',
      responseTime: Date.now() - startTime,
    };
  }
}

/**
 * 生成修复建议
 */
function generateSuggestions(result: DiagnosisResult): void {
  // 如果Server Key使用默认值或无效
  if (result.config.serverKey.isDefault || !result.config.serverKey.valid) {
    result.suggestions.push(
      '1. 申请高德地图Server Key: ' +
      '登录高德开发者平台 (https://lbs.amap.com/) → 应用管理 → 创建新应用或修改现有应用 → 获取Server Key'
    );

    result.suggestions.push(
      '2. 更新环境变量: 在 .env.local 文件中设置 AMAP_SERVER_KEY=你的ServerKey'
    );
  }

  // 如果Web Key使用默认值
  if (result.config.webKey.isDefault) {
    result.suggestions.push(
      '3. 更新Web Key: 在 .env.local 文件中设置 NEXT_PUBLIC_AMAP_WEB_KEY=你的WebKey'
    );
  }

  // 如果安全代码使用默认值
  if (result.config.securityCode.isDefault) {
    result.suggestions.push(
      '4. 更新安全代码: 在 .env.local 文件中设置 AMAP_SECURITY_CODE=你的安全代码'
    );
  }

  // 如果Server API测试失败但配置了Key
  if (result.config.serverKey.configured && !result.config.serverKey.valid) {
    const errorCode = result.apiTests.serverApi?.infocode;
    if (errorCode === '10009') {
      result.suggestions.push(
        '5. 检查高德开发者平台权限: 确保已启用"服务端API"权限，特别是"地点搜索"功能'
      );
    }
  }

  // 通用建议
  result.suggestions.push(
    '6. 验证修复: 运行诊断工具检查配置是否生效'
  );
}

/**
 * 格式化诊断结果，用于控制台输出
 */
export function formatDiagnosisResult(result: DiagnosisResult): string {
  let output = `\n=== 高德地图API诊断报告 ===\n`;
  output += `时间: ${result.timestamp}\n`;
  output += `总体状态: ${result.success ? '✅ 正常' : '❌ 有问题'}\n\n`;

  output += `=== 配置检查 ===\n`;
  output += `Web Key: ${result.config.webKey.configured ? '✅ 已配置' : '❌ 未配置'} `;
  output += `${result.config.webKey.isDefault ? '(默认值)' : ''}\n`;

  output += `Server Key: ${result.config.serverKey.configured ? '✅ 已配置' : '❌ 未配置'} `;
  output += `${result.config.serverKey.isDefault ? '(默认值)' : ''}\n`;

  output += `安全代码: ${result.config.securityCode.configured ? '✅ 已配置' : '❌ 未配置'} `;
  output += `${result.config.securityCode.isDefault ? '(默认值)' : ''}\n\n`;

  output += `=== API测试结果 ===\n`;
  if (result.apiTests.serverApi) {
    const test = result.apiTests.serverApi;
    output += `Server API: ${test.success ? '✅ 成功' : '❌ 失败'}\n`;
    output += `  状态: ${test.status}, 代码: ${test.infocode}\n`;
    output += `  信息: ${test.info}\n`;
    output += `  响应时间: ${test.responseTime}ms\n`;
  }

  if (result.apiTests.webApi) {
    const test = result.apiTests.webApi;
    output += `Web API: ${test.success ? '✅ 成功' : '❌ 失败'}\n`;
    output += `  状态: ${test.status}, 代码: ${test.infocode}\n`;
    output += `  信息: ${test.info}\n`;
    output += `  响应时间: ${test.responseTime}ms\n`;
  }

  if (result.warnings.length > 0) {
    output += `\n=== 警告 ===\n`;
    result.warnings.forEach(warning => {
      output += `⚠️  ${warning}\n`;
    });
  }

  if (result.errors.length > 0) {
    output += `\n=== 错误 ===\n`;
    result.errors.forEach(error => {
      output += `❌ ${error}\n`;
    });
  }

  if (result.suggestions.length > 0) {
    output += `\n=== 修复建议 ===\n`;
    result.suggestions.forEach((suggestion, index) => {
      output += `${index + 1}. ${suggestion}\n`;
    });
  }

  output += `\n=== 详细说明 ===\n`;
  output += `错误码10009 (USERKEY_PLAT_NOMATCH) 表示Key与服务平台不匹配。\n`;
  output += `通常是因为使用了Web Key调用服务端API，或未启用服务端API权限。\n`;
  output += `请按照上述建议在高德开发者平台获取正确的Server Key。\n`;

  return output;
}

/**
 * 快速检查API状态（简化版）
 */
export async function quickCheck(): Promise<{ ok: boolean; message: string }> {
  try {
    const result = await diagnoseAMapAPI();
    return {
      ok: result.success,
      message: formatDiagnosisResult(result),
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      message: `诊断失败: ${errorMessage}`,
    };
  }
}

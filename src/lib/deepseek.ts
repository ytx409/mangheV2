/**
 * DeepSeek API 客户端
 * 封装 DeepSeek API 调用，用于解析用户的自然语言推荐需求
 */

export interface AnalyzedIntent {
  /** 推荐分类数组 */
  categories: Array<'food' | 'play' | 'leisure'>;
  /** 氛围关键词数组 */
  atmosphere: string[];
  /** 用于 POI 搜索的具体关键词 */
  activityKeywords: string[];
  /** 个性化治愈文案（20字以内） */
  healingMessage: string;
  /** 请求是否足够具体可用于筛选 */
  shouldFilter: boolean;
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_TIMEOUT = 12000;

const SYSTEM_PROMPT = `你是一个"盲盒去哪"App的推荐意图解析器。用户会用自然的中文描述想去哪里。你的唯一任务是将用户描述解析为结构化JSON。永远只输出JSON，不要加任何解释、markdown标记或额外文字。`;

function buildUserPrompt(query: string, location: string, cityName: string, category?: string): string {
  return `当前用户输入：「${query}」
用户所在位置坐标：${location}
所在城市：${cityName}
用户手选分类：${category || '未选择'}

可用分类：
- 美食 (food): 餐厅、火锅、烧烤、咖啡厅、甜品店、快餐、日料、韩料、西餐、小吃、面馆
- 游玩 (play): 景点、公园、游乐场、KTV、密室逃脱、运动、健身、体育馆、桌游、露营地
- 休闲 (leisure): 电影院、展览馆、博物馆、书店、茶馆、咖啡馆、酒吧、清吧、DIY手工

请分析用户意图并输出JSON：
{
  "categories": ["food"|"play"|"leisure"的数组, 可多选],
  "atmosphere": ["氛围关键词"的数组, 如"安静""浪漫""适合拍照""适合约会""热闹""亲子""文艺""小资""宠物友好"],
  "activityKeywords": ["具体搜索关键词"的数组, 如"火锅""书店""密室逃脱""露营"],
  "healingMessage": "个性化的治愈文案(20字以内)，呼应TA的需求，用温暖鼓励的语气",
  "shouldFilter": true或false(请求是否足够具体可用于筛选POI)
}

注意事项：
1. 如果用户说"随便""什么都行""无所谓"等模糊表述，shouldFilter为false
2. activityKeywords要具体、可用于高德地图POI搜索
3. healingMessage用简体中文，温暖自然，不要emoji
5. 如果用户提到距离(如"附近的""走路能到的")，在activityKeywords中体现但不要单独输出距离
5. **重要：用户手选分类仅作参考，以自然语言描述为第一优先级。当两者冲突时，以NL描述为准。categories字段必须反映NL意图而非手选分类。**`;
}

/**
 * 从 DeepSeek 响应文本中提取 JSON 对象
 */
function parseIntentResponse(raw: string): AnalyzedIntent | null {
  let cleaned = raw.trim();

  // 去除 markdown 代码块标记
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/, '');

  // 尝试直接解析
  try {
    return JSON.parse(cleaned) as AnalyzedIntent;
  } catch {
    // 尝试提取 JSON 对象
  }

  // 尝试从文本中提取 JSON 对象
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]) as AnalyzedIntent;
    } catch {
      // 解析失败
    }
  }

  return null;
}

/**
 * 调用 DeepSeek API 解析用户自然语言意图
 * @param query 用户自然语言查询
 * @param location 坐标 "lng,lat"
 * @param cityName 城市名
 * @returns 解析后的意图对象，失败返回 null
 */
export async function analyzeUserIntent(
  query: string,
  location: string,
  cityName: string,
  category?: string,
): Promise<AnalyzedIntent | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    console.warn('[DeepSeek] DEEPSEEK_API_KEY 未配置');
    return null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(query, location, cityName, category) },
        ],
        max_tokens: 600,
        temperature: 0.7,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(`[DeepSeek] API 请求失败: ${response.status} ${response.statusText}`);

      // 处理限流
      if (response.status === 429) {
        console.warn('[DeepSeek] 触发限流');
        return null;
      }

      return null;
    }

    const json = await response.json();
    const content = json?.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('[DeepSeek] 响应中无有效内容');
      return null;
    }

    const intent = parseIntentResponse(content);

    if (!intent) {
      console.warn('[DeepSeek] 无法解析意图 JSON, 原始响应:', content.slice(0, 200));
      return null;
    }

    return intent;
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      console.warn('[DeepSeek] 请求超时');
    } else {
      console.error('[DeepSeek] 请求异常:', error);
    }
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

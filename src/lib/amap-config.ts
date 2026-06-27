// 高德地图 API 配置
// API Key 已配置（用户提供的 Key）

export const AMAP_CONFIG = {
  // Web API Key
  webKey: process.env.NEXT_PUBLIC_AMAP_WEB_KEY || '',
  // 服务端 API Key
  serverKey: process.env.AMAP_SERVER_KEY || '',
  webServicePrivateKey: process.env.AMAP_WEB_SERVICE_PRIVATE_KEY || '',
  // 安全密钥
  securityJsCode: process.env.AMAP_SECURITY_CODE || '',
  // 高德地图 Web API 基础地址
  baseUrl: 'https://restapi.amap.com/v3',
};

// 盲盒分类与高德地图 POI 类型映射
export const CATEGORY_TYPES = {
  // 美食盲盒
  food: {
    name: '美食盲盒',
    icon: '🍜',
    keywords: ['餐厅', '火锅', '小吃', '烧烤', '川菜', '粤菜', '快餐', '西餐', '日料', '自助餐', '海鲜', '面馆'],
    types: [
      '餐饮服务|中餐厅|正餐',
      '餐饮服务|火锅店',
      '餐饮服务|小吃店',
      '餐饮服务|咖啡厅',
      '餐饮服务|甜品店',
      '餐饮服务|快餐店',
      '餐饮服务|烧烤店',
      '餐饮服务|日本料理',
      '餐饮服务|韩国料理',
      '餐饮服务|西餐厅',
      '餐饮服务|面包甜点',
      '餐饮服务|海鲜酒楼',
      '餐饮服务|茶餐厅',
      '餐饮服务|自助餐',
      '餐饮服务|冷饮店',
    ],
  },
  // 游玩盲盒
  play: {
    name: '游玩盲盒',
    icon: '🎮',
    keywords: [
      'KTV', '密室', '桌游', '台球', '台球厅', '台球馆',
      '健身', '游泳', '足球场', '篮球场', '羽毛球馆', '网球场',
      '网吧', '电竞馆', '公园', '景点', '游乐园', '体育馆',
      '电玩', '卡丁车', '保龄球馆', '攀岩馆', '射箭馆',
    ],
    types: [
      '风景名胜',
      '公园广场',
      '娱乐服务|KTV',
      '娱乐服务|歌舞厅',
      '娱乐场所|游戏厅',
      '娱乐场所|棋牌室',
      '体育休闲服务|健身中心',
      '体育休闲服务|游泳馆',
      '体育休闲服务|篮球场',
      '体育休闲服务|足球场',
      '体育休闲服务|台球馆',
      '体育休闲服务|羽毛球场',
      '体育休闲服务|乒乓球馆',
      '体育休闲服务|溜冰场',
      '体育休闲服务|滑雪场',
      '体育休闲服务|保龄球馆',
      '体育休闲服务|网球场',
      '体育休闲服务|攀岩馆',
      '体育休闲服务|卡丁车',
      '体育休闲服务|射箭馆',
    ],
  },
  // 休闲盲盒
  leisure: {
    name: '休闲盲盒',
    icon: '🎬',
    keywords: ['电影院', '咖啡馆', '书店', '茶馆', '酒吧', '美甲', '花店', '博物馆', '剧院', '洗浴', '足疗', '甜品店'],
    types: [
      '影剧院|电影院',
      '会展服务|展览馆',
      '会展服务|博物馆',
      '娱乐服务|酒吧',
      '娱乐场所|网吧',
      '生活服务|陶艺',
      '生活服务|手工DIY',
      '休闲场所|书店',
      '休闲场所|茶馆',
      '风景名胜|博物馆',
      '影剧院|剧场',
      '娱乐服务|LiveHouse',
      '休闲场所|咖啡厅',
      '生活服务|SPA',
      '生活服务|美甲',
      '科教文化服务|美术馆',
      '科教文化服务|图书馆',
      '生活服务|花店',
    ],
  },
  // 全能盲盒 - 随机所有类型
  all: {
    name: '全能盲盒',
    icon: '🎁',
    keywords: ['美食', '游玩', '休闲', '娱乐'],
    types: [] as string[], // 全能盲盒会合并所有类型
  },
};

// 城市列表（热门城市）
export const HOT_CITIES = [
  { name: '北京', adcode: '110000' },
  { name: '上海', adcode: '310000' },
  { name: '广州', adcode: '440100' },
  { name: '深圳', adcode: '440300' },
  { name: '杭州', adcode: '330100' },
  { name: '成都', adcode: '510100' },
  { name: '重庆', adcode: '500000' },
  { name: '武汉', adcode: '420100' },
  { name: '西安', adcode: '610100' },
  { name: '南京', adcode: '320100' },
  { name: '天津', adcode: '120000' },
  { name: '苏州', adcode: '320500' },
  { name: '长沙', adcode: '430100' },
  { name: '郑州', adcode: '410100' },
  { name: '青岛', adcode: '370200' },
  { name: '沈阳', adcode: '210100' },
  { name: '大连', adcode: '210200' },
  { name: '厦门', adcode: '350200' },
  { name: '宁波', adcode: '330200' },
  { name: '昆明', adcode: '530100' },
];


// 氛围筛选
export const ATMOSPHERE_FILTERS = {
  quiet: { keywords: ['安静', '清静', '私密', '雅致'], label: '安静' },
  lively: { keywords: ['热闹', '人气', '嗨', '狂欢'], label: '热闹' },
  any: { label: '随便' },
};

// AI 推荐配置
export const AI_CONFIG = {
  /** 输入框 placeholder 轮播示例 */
  placeholderExamples: [
    '我想找一个适合拍照的地方',
    '推荐附近适合跑步的公园',
    '推荐适合拍照打卡的地方',
    '附近有没有安静的咖啡馆？',
    '想吃火锅，人均100左右',
  ],
  /** DeepSeek 模型 */
  model: 'deepseek-chat',
  /** DeepSeek API 地址 */
  apiEndpoint: 'https://api.deepseek.com/v1/chat/completions',
  /** 请求超时时间（毫秒） */
  timeout: 10000,
  /** 最大 token 数 */
  maxTokens: 600,
  /** 温度参数 */
  temperature: 0.7,
} as const;

// 治愈系文案
export const HEALING_MESSAGES = [
  '今天也要好好吃饭呀~',
  '遇见美食，遇见美好',
  '每一餐都值得被认真对待',
  '生活不止眼前的苟且，还有美食和远方',
  '今天的你，很棒了',
  '偶尔给自己一个小惊喜吧',
  '愿你的每一天都有小确幸',
  '探索未知，发现美好',
  '世界那么大，一起去看看',
  '给自己一个放松的理由',
  '偶尔任性一下也无妨',
  '生活需要仪式感',
  '今天也要元气满满呀',
  '发现生活中的小美好',
  '给自己一个微笑吧',
];

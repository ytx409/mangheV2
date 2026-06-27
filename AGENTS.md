# 盲盒去哪 - 项目规范

## 项目概述

「盲盒去哪」是一个基于地图的吃喝玩乐盲盒推荐工具，帮助用户打破选择困难，通过随机盲盒方式发现身边的美食、游玩、休闲好去处。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **地图服务**: 高德地图 Web API

## 目录结构

```
├── src/
│   ├── app/                      # 页面路由
│   │   ├── api/
│   │   │   ├── location/         # 位置相关 API
│   │   │   │   ├── suggest/       # 地址搜索（输入提示）
│   │   │   │   └── reverse/       # 逆地理编码
│   │   │   └── poi/              # POI 相关 API
│   │   │       ├── recommend/     # 盲盒推荐接口
│   │   │       └── detail/        # POI 详情
│   │   ├── globals.css           # 全局样式（主题色）
│   │   ├── layout.tsx            # 根布局
│   │   └── page.tsx             # 首页
│   ├── components/               # 组件
│   │   ├── blindbox-home.tsx    # 盲盒首页
│   │   ├── blindbox-result.tsx   # 结果卡片
│   │   └── profile-page.tsx     # 个人中心
│   ├── hooks/                    # 自定义 Hooks
│   │   └── use-blindbox.ts      # 盲盒相关状态管理
│   └── lib/                      # 工具库
│       ├── amap-config.ts       # 高德地图配置
│       └── amap.ts              # 高德地图 API 封装
└── public/
    └── manifest.json             # PWA 配置
```

## 高德地图分类

### 分类映射

| 盲盒分类 | 高德 POI 类型 | 关键词 |
|---------|--------------|--------|
| 美食盲盒 | 餐饮服务、中餐厅、火锅店、小吃店、咖啡厅、甜品店、外国餐厅 | 餐厅、火锅、咖啡、甜品、烧烤 |
| 游玩盲盒 | 风景名胜、公园广场、KTV、健身中心、游乐场、体育场 | 景点、公园、KTV、运动 |
| 休闲盲盒 | 电影院、展览馆、博物馆、酒吧、书店、茶馆 | 影院、展览、清吧 |
| 全能盲盒 | 合并以上所有类型 | 随机 |

## 筛选条件

### 距离选项
| 选项 | 范围 |
|-----|------|
| 1公里 | 1000米内 |
| 3公里 | 3000米内 |
| 5公里 | 5000米内 |
| 10公里 | 10000米内 |
| 全城 | 50000米内 |

### 预算选项
| 选项 | 范围 |
|-----|------|
| 50元以内 | ¥20-50 |
| 50-100元 | ¥50-100 |
| 100-200元 | ¥100-200 |
| 200-500元 | ¥200-500 |
| 不限预算 | ¥30-200 |

## API 接口

### POST /api/poi/recommend

获取盲盒推荐

**请求参数**:
```json
{
  "category": "food|play|leisure|all",
  "cityName": "北京",
  "city": "110000",
  "location": "116.407394,39.904211",
  "distance": 3000,
  "budget": "under50|50to100|100to200|200to500|any"
}
```

**响应**:
```json
{
  "success": true,
  "data": {
    "poi": {
      "id": "xxx",
      "name": "商户名称",
      "location": "经纬度",
      "address": "地址",
      "type": "商户类型",
      "tel": "电话",
      "photos": [{ "url": "图片URL" }]
    },
    "rating": 4.5,
    "price": 100,
    "distance": "1.2km",
    "category": "美食盲盒",
    "categoryIcon": "🍜",
    "healingMessage": "今天也要好好吃饭呀~",
    "navigationUrl": "https://uri.amap.com/navigation..."
  }
}
```

### GET /api/location/suggest

地址搜索（类似高德地图输入提示）

**请求参数**:
- `keywords`: 搜索关键词
- `city`: 城市名

**响应**:
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "id": "xxx",
        "name": "地点名称",
        "district": "所属区域",
        "address": "详细地址",
        "location": "经纬度",
        "type": "地点类型"
      }
    ]
  }
}
```

### GET /api/location/reverse

逆地理编码（根据经纬度获取地址）

**请求参数**:
- `location`: 经纬度，如 "116.397499,39.908722"

### GET /api/poi/detail

获取 POI 详细信息

**请求参数**:
- `id`: POI ID

## 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 生产运行
pnpm start
```

## 环境变量

高德地图 API Key 配置在 `src/lib/amap-config.ts` 中：
- `webKey`: Web 端 API Key
- `serverKey`: 服务端 API Key
- `securityJsCode`: 安全密钥

## 本地存储

| Key | 说明 |
|-----|------|
| `blindbox_favorites` | 收藏列表 |
| `blindbox_history` | 开盒历史（最多10条） |
| `blindbox_skin` | 盲盒皮肤设置 |
| `blindbox_city` | 当前城市 |

## 主题色

```css
--blindbox-blue: #42A5F5;      /* 主色调 */
--blindbox-light-blue: #90CAF9;
--blindbox-dark-blue: #1E88E5;
```

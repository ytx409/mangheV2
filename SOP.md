# SOP — 盲盒去哪

---

## SOP-001：本地开发启动

**前置条件**：已安装 Node.js 18+、pnpm 9+

1. pnpm install — 安装依赖
2. 配置 .env.local（需含高德地图 Key 和 DeepSeek Key）
3. pnpm dev — 启动开发服务器
4. 打开 http://localhost:3000

---

## SOP-002：添加新皮肤

1. 在 src/lib/skin-config.ts 的 SKINS 中添加新条目
2. 在 src/app/globals.css 中添加对应的 .blindbox-card-{name} CSS 类
3. 更新 src/components/profile-page.tsx 中 SKINS 数组
4. 本地验证皮肤切换正常

---

## SOP-003：添加新品类

1. 在 src/lib/amap-config.ts 的 CATEGORY_TYPES 中添加新品类
2. 在 src/lib/category-config.ts 的 CATEGORIES 和 CATEGORY_COLORS 中添加配置
3. 更新 src/components/blindbox-home.tsx 中 CATEGORIES 数组

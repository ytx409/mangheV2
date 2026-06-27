# 盲盒去哪 - 纯原生HTML实现

这是一个使用纯原生HTML/CSS/JavaScript + 高德地图JS API实现的盲盒推荐网站。

## 功能特性

- 🎯 **地址搜索**：支持输入地点名称，自动补全建议
- 🎲 **盲盒推荐**：随机推荐附近美食、景点、休闲场所
- 📱 **响应式设计**：适配手机和桌面端
- 🚀 **高性能**：纯原生实现，无框架依赖

## 技术栈

- **HTML5**：语义化结构
- **CSS3**：现代化样式，渐变、动画、响应式布局
- **JavaScript (ES6+)**：原生API，异步处理
- **高德地图JS API v2.0**：地址搜索和POI推荐

## 文件结构

```
index.html          # 主页面文件
├── HTML            # 页面结构
├── CSS             # 样式定义
└── JavaScript      # 交互逻辑
    ├── AMap初始化
    ├── 地址搜索功能
    ├── 盲盒推荐功能
    └── UI交互处理
```

## 使用方法

1. **启动本地服务器**：
   ```bash
   cd public
   python -m http.server 8080
   ```

2. **访问网站**：
   打开浏览器访问 `http://localhost:8080/index.html`

3. **使用步骤**：
   - 在搜索框输入位置（如：三里屯、北京站）
   - 从下拉建议中选择一个地点
   - 点击"🎲 开一个盲盒！"按钮
   - 查看随机推荐的店铺信息

## 核心功能

### 地址搜索
- 使用 `AMap.AutoComplete` 提供输入提示
- 支持全国范围内的地点搜索
- 实时显示搜索建议

### 盲盒推荐
- 使用 `AMap.PlaceSearch.searchNearBy()` 搜索附近POI
- 支持三种分类：美食、游玩、休闲
- 随机选择推荐结果
- 显示距离、评分、价格等详细信息

### 用户体验
- 加载状态提示
- 错误处理和重试机制
- 平滑动画效果
- 导航链接直接跳转

## API使用说明

### 高德地图配置
```javascript
// 引入高德地图JS API
<script src="https://webapi.amap.com/maps?v=2.0&key=YOUR_API_KEY&plugin=AMap.PlaceSearch,AMap.AutoComplete"></script>
```

### 主要API调用
- `new AMap.AutoComplete()` - 地址自动补全
- `new AMap.PlaceSearch()` - POI搜索
- `autoComplete.search()` - 执行地址搜索
- `placeSearch.searchNearBy()` - 周边POI搜索

## 浏览器兼容性

- Chrome 70+
- Firefox 65+
- Safari 12+
- Edge 79+

## 注意事项

- 需要有效的网络连接加载高德地图API
- 移动端建议使用现代浏览器
- API Key需要根据实际需求配置

## 开发说明

这是一个纯前端实现，无需后端服务器。所有功能都通过高德地图API实现，数据实时获取，确保推荐结果的准确性和新鲜度。</content>
<parameter name="filePath">d:\aicoding\manghe\b1\pack_project_1775744244012\projects\public\README.md

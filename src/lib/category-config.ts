// 分类颜色配置 - 统一管理所有分类的颜色定义
// 确保所有组件使用相同的分类颜色

import { CATEGORY_TYPES } from './amap-config';

// 分类颜色配置接口
export interface CategoryColorConfig {
  primary: string;
  secondary: string;
  glow: string;
  border: string;
}

// 分类配置接口
export interface CategoryConfig {
  name: string;
  icon: string;
  colors: CategoryColorConfig;
}

// 所有分类颜色配置（与现有颜色值保持一致）
export const CATEGORY_COLORS: Record<string, CategoryColorConfig> = {
  food: {
    primary: '#FF6B6B',
    secondary: '#FF8E8E',
    glow: '#FF4444',
    border: '#FF8E8E', // 与 blindbox-result.tsx 中的 border 颜色一致
  },
  play: {
    primary: '#4ECDC4',
    secondary: '#7EDDD6',
    glow: '#00CED1',
    border: '#7EDDD6', // 与 blindbox-result.tsx 中的 border 颜色一致
  },
  leisure: {
    primary: '#9B59B6',
    secondary: '#BB79D6',
    glow: '#8E44AD',
    border: '#BB79D6', // 与 blindbox-result.tsx 中的 border 颜色一致
  },
  all: {
    primary: '#FFB347',
    secondary: '#FFD93D',
    glow: '#FFA500',
    border: '#FFD080', // 与 blindbox-result.tsx 中的 border 颜色一致
  },
};

// 所有分类配置
export const CATEGORIES: Record<string, CategoryConfig> = {
  food: {
    name: CATEGORY_TYPES.food.name,
    icon: CATEGORY_TYPES.food.icon,
    colors: CATEGORY_COLORS.food,
  },
  play: {
    name: CATEGORY_TYPES.play.name,
    icon: CATEGORY_TYPES.play.icon,
    colors: CATEGORY_COLORS.play,
  },
  leisure: {
    name: CATEGORY_TYPES.leisure.name,
    icon: CATEGORY_TYPES.leisure.icon,
    colors: CATEGORY_COLORS.leisure,
  },
  all: {
    name: CATEGORY_TYPES.all.name,
    icon: CATEGORY_TYPES.all.icon,
    colors: CATEGORY_COLORS.all,
  },
};

// 获取分类配置
export function getCategoryConfig(category: string): CategoryConfig {
  return CATEGORIES[category] || CATEGORIES.all;
}

// 获取分类颜色
export function getCategoryColors(category: string): CategoryColorConfig {
  return getCategoryConfig(category).colors;
}

// 获取分类名称
export function getCategoryName(category: string): string {
  return getCategoryConfig(category).name;
}

// 获取分类图标
export function getCategoryIcon(category: string): string {
  return getCategoryConfig(category).icon;
}

// 验证分类是否有效
export function isValidCategory(category: string): boolean {
  return category in CATEGORIES;
}

// 从分类配置生成类型安全的分类键类型
export type Category = keyof typeof CATEGORIES;

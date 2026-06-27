// 皮肤配置 - 统一管理所有盲盒皮肤定义
// 确保 blindbox-animation.tsx 和 blindbox-preview.tsx 使用相同的配置

// 皮肤形状类型
export type SkinShape = 'cube' | 'cylinder' | 'star' | 'heart' | 'crystal' | 'box' | 'capsule' | 'gem' | 'gradient' | 'neon';

// 皮肤模式类型
export type SkinPattern = 'solid' | 'cloud' | 'outline' | 'rainbow' | 'gradient' | 'neon' | 'retro' | 'crystal';

// 皮肤配置接口
export interface SkinConfig {
  name: string;
  icon: string;
  colors: {
    primary: string;
    secondary: string;
    glow: string;
  };
  shape: SkinShape;
  pattern: SkinPattern;
  borderRadius: string;
  hasRibbon: boolean;
  hasBow: boolean;
  hasSparkle: boolean;
  hasStripe: boolean;
}

// 所有皮肤配置
export const SKINS: Record<string, SkinConfig> = {
  basic: {
    name: '经典款',
    icon: '💙',
    colors: { primary: '#42A5F5', secondary: '#90CAF9', glow: '#42A5F5' },
    shape: 'cube',
    pattern: 'solid',
    borderRadius: '1.5rem',
    hasRibbon: true,
    hasBow: true,
    hasSparkle: true,
    hasStripe: false,
  },
  cute: {
    name: '可爱款',
    icon: '🌸',
    colors: { primary: '#FF69B4', secondary: '#FFB6C1', glow: '#FF69B4' },
    shape: 'cylinder',
    pattern: 'cloud',
    borderRadius: '2rem',
    hasRibbon: true,
    hasBow: true,
    hasSparkle: true,
    hasStripe: false,
  },
  minimal: {
    name: '简约款',
    icon: '⚪',
    colors: { primary: '#333333', secondary: '#666666', glow: '#333333' },
    shape: 'box',
    pattern: 'outline',
    borderRadius: '0.5rem',
    hasRibbon: false,
    hasBow: false,
    hasSparkle: false,
    hasStripe: false,
  },
  vibrant: {
    name: '彩虹款',
    icon: '🌈',
    colors: { primary: '#FF6B6B', secondary: '#4ECDC4', glow: '#FFB347' },
    shape: 'cube',
    pattern: 'rainbow',
    borderRadius: '1rem',
    hasRibbon: true,
    hasBow: true,
    hasSparkle: true,
    hasStripe: false,
  },
  gradient: {
    name: '渐变款',
    icon: '🎨',
    colors: { primary: '#667eea', secondary: '#764ba2', glow: '#667eea' },
    shape: 'gem',
    pattern: 'gradient',
    borderRadius: '1.2rem',
    hasRibbon: true,
    hasBow: false,
    hasSparkle: true,
    hasStripe: false,
  },
  neon: {
    name: '霓虹款',
    icon: '✨',
    colors: { primary: '#00ff88', secondary: '#ff00ff', glow: '#00ff88' },
    shape: 'capsule',
    pattern: 'neon',
    borderRadius: '3rem',
    hasRibbon: false,
    hasBow: true,
    hasSparkle: true,
    hasStripe: false,
  },
  retro: {
    name: '复古款',
    icon: '📼',
    colors: { primary: '#f4a460', secondary: '#8b4513', glow: '#daa520' },
    shape: 'box',
    pattern: 'retro',
    borderRadius: '0.25rem',
    hasRibbon: true,
    hasBow: false,
    hasSparkle: false,
    hasStripe: true,
  },
  crystal: {
    name: '水晶款',
    icon: '💎',
    colors: { primary: '#87ceeb', secondary: '#e0ffff', glow: '#87ceeb' },
    shape: 'crystal',
    pattern: 'crystal',
    borderRadius: '1rem',
    hasRibbon: true,
    hasBow: false,
    hasSparkle: true,
    hasStripe: false,
  },
};

// 获取皮肤配置
export function getSkinConfig(skin: string): SkinConfig {
  return SKINS[skin] || SKINS.basic;
}

// 获取所有皮肤键
export function getAllSkinKeys(): string[] {
  return Object.keys(SKINS);
}

// 验证皮肤键是否有效
export function isValidSkin(skin: string): boolean {
  return skin in SKINS;
}

// 从皮肤配置生成类型安全的皮肤键类型
export type BlindboxSkin = keyof typeof SKINS;

// 渐变生成工具函数 - 统一管理所有渐变生成逻辑
// 确保 blindbox-animation.tsx 和 blindbox-preview.tsx 使用相同的渐变效果

import { SkinConfig } from './skin-config';

// 渐变类型
export type GradientPart = 'top' | 'body' | 'full';

// 生成渐变
export function generateGradient(
  skin: SkinConfig,
  part: GradientPart = 'body'
): string {
  const { colors, pattern } = skin;

  switch (pattern) {
    case 'gradient':
      return part === 'top'
        ? `linear-gradient(180deg, ${colors.secondary} 0%, ${colors.primary} 100%)`
        : part === 'full'
        ? `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${colors.secondary} 100%)`
        : `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;

    case 'neon':
      return part === 'top'
        ? `linear-gradient(180deg, ${colors.primary} 0%, #111 100%)`
        : part === 'full'
        ? `linear-gradient(180deg, #111 0%, ${colors.primary} 50%, ${colors.secondary} 100%)`
        : `linear-gradient(180deg, #111 0%, ${colors.secondary} 100%)`;

    case 'crystal':
      return part === 'top'
        ? `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${colors.primary}88 50%, ${colors.secondary}44 100%)`
        : part === 'full'
        ? `linear-gradient(135deg, rgba(255,255,255,0.8) 0%, ${colors.primary}66 50%, ${colors.secondary}44 100%)`
        : `linear-gradient(135deg, ${colors.primary}66 0%, ${colors.secondary}44 50%, rgba(255,255,255,0.8) 100%)`;

    case 'rainbow':
      return `linear-gradient(135deg, #FF6B6B 0%, #FFB347 25%, #4ECDC4 50%, #9B59B6 75%, #FF6B6B 100%)`;

    case 'retro':
      return `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;

    case 'cloud':
      return part === 'top'
        ? `linear-gradient(180deg, ${colors.secondary}88 0%, ${colors.primary}66 100%)`
        : `linear-gradient(180deg, ${colors.primary}66 0%, ${colors.secondary}88 100%)`;

    case 'outline':
      return part === 'top'
        ? `linear-gradient(180deg, ${colors.secondary}33 0%, ${colors.primary}22 100%)`
        : `linear-gradient(180deg, ${colors.primary}22 0%, ${colors.secondary}33 100%)`;

    default: // solid
      return part === 'top'
        ? `linear-gradient(180deg, ${colors.secondary} 0%, ${colors.primary} 100%)`
        : `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;
  }
}

// 生成盒子阴影
export function generateBoxShadow(skin: SkinConfig, intensity: number = 1): string {
  const { colors } = skin;
  const opacity = Math.min(0.44 * intensity, 0.8);
  const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0');

  return `
    0 15px 40px ${colors.glow}${opacityHex},
    inset 0 2px 0 rgba(255,255,255,${0.3 * intensity}),
    inset 0 -2px 0 rgba(0,0,0,${0.1 * intensity})
  `;
}

// 生成外发光
export function generateGlow(skin: SkinConfig, intensity: number = 1): string {
  const { colors } = skin;
  const opacity = Math.min(0.66 * intensity, 1);
  const opacityHex = Math.round(opacity * 255).toString(16).padStart(2, '0');

  return `radial-gradient(circle, ${colors.glow}${opacityHex} 0%, transparent 70%)`;
}

// 生成SVG渐变ID
export function generateSvgGradientId(skinKey: string, suffix: string = ''): string {
  return `gradient-${skinKey}${suffix ? `-${suffix}` : ''}`;
}

// 生成分类相关的渐变（用于分类特定的效果）
export function generateCategoryGradient(
  categoryColors: { primary: string; secondary: string; glow: string },
  part: GradientPart = 'body'
): string {
  const { primary, secondary } = categoryColors;

  return part === 'top'
    ? `linear-gradient(180deg, ${secondary} 0%, ${primary} 100%)`
    : `linear-gradient(180deg, ${primary} 0%, ${secondary} 100%)`;
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { POIItem } from '@/lib/amap';
import { Sparkles, Palette, Loader2, Search, MapPin, Phone, Navigation, Clock, ImageOff } from 'lucide-react';
import type { BlindboxSkin } from '@/hooks/use-blindbox';
import { useAMapWeb } from '@/hooks/use-amap-web';
import { getSkinConfig, SKINS } from '@/lib/skin-config';
import { getNavigationUrl } from '@/lib/amap';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BlindboxPreviewProps {
  skin?: BlindboxSkin;
  category?: string;
  onSkinChange?: (skin: string) => void;
  showEditButton?: boolean;
  showFilters?: boolean; // 筛选面板展开状态
  showSuggestions?: boolean; // 搜索地址下拉列表展开状态
  isPreviewLoading?: boolean;
  isPreviewHydrating?: boolean;
  previewPlaces?: POIItem[];
}

interface EnrichedPreviewPlace extends POIItem {
  businessHours?: string;
}

function PlaceImage({
  src,
  alt,
  className,
  fallbackLabel,
}: {
  src?: string;
  alt: string;
  className: string;
  fallbackLabel: string;
}) {
  const [hasError, setHasError] = useState(!src);

  useEffect(() => {
    setHasError(!src);
  }, [src]);

  if (!src || hasError) {
    return (
      <div className={`${className} flex flex-col items-center justify-center bg-gradient-to-br from-[#FFF8E7] to-[#FFEED1] text-[#C9894B]`}>
        <ImageOff className="mb-1 h-5 w-5 opacity-70" />
        <span className="px-2 text-center text-[11px] font-medium leading-4">{fallbackLabel}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}


export default function BlindboxPreview({
  skin = 'basic',
  category = 'all',
  onSkinChange,
  showEditButton = true,
  isPreviewLoading = false,
  isPreviewHydrating = false,
  previewPlaces = [],
}: BlindboxPreviewProps) {
  const { getPOIDetails, calculateWalkingDistance, calculateDrivingDistance } = useAMapWeb();
  const [showSkinPicker, setShowSkinPicker] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<POIItem | null>(null);
  const [selectedPlaceDetail, setSelectedPlaceDetail] = useState<EnrichedPreviewPlace | null>(null);
  const [showPlaceDetail, setShowPlaceDetail] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [routeInfo, setRouteInfo] = useState<{ walking?: string; driving?: string }>({});
  const [previewPage, setPreviewPage] = useState(0);
  const [searchText, setSearchText] = useState('');
  const PAGE_SIZE = 12;

  // 按名称搜索过滤
  const filteredPlaces = searchText.trim()
    ? previewPlaces.filter(p => p.name.toLowerCase().includes(searchText.trim().toLowerCase()))
    : previewPlaces;

  // 数据变化时重置页码
  const prevLengthRef = useRef(previewPlaces.length);
  useEffect(() => {
    if (previewPlaces.length !== prevLengthRef.current) {
      setPreviewPage(0);
      setSearchText('');
      prevLengthRef.current = previewPlaces.length;
    }
  }, [previewPlaces.length]);
  // 搜索文本变化时重置页码
  useEffect(() => { setPreviewPage(0); }, [searchText]);

  const totalPages = Math.max(1, Math.ceil(filteredPlaces.length / PAGE_SIZE));
  const safePage = Math.min(previewPage, totalPages - 1);
  const pagedPlaces = filteredPlaces.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const currentSkin = getSkinConfig(skin) || getSkinConfig('basic');

  const categoryIcons: Record<string, string> = {
    food: '🍜',
    play: '🎮',
    leisure: '🎬',
    all: '🎁',
  };

  const categoryColors: Record<string, string> = {
    food: '#FF6B6B',
    play: '#4ECDC4',
    leisure: '#9B59B6',
    all: '#FFB347',
  };

  const icon = categoryIcons[category] || '🎁';
  const categoryColor = categoryColors[category] || '#FFB347';

  // 点击动画
  const handleClick = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setTimeout(() => setIsAnimating(false), 500);
  };

  // 点击预览卡片查看详情
  const handlePlaceClick = (place: POIItem) => {
    console.log('[商家预览] 用户点击商家:', place.name);
    setSelectedPlace(place);
    setSelectedPlaceDetail(place);
    setSelectedPhotoIndex(0);
    setRouteInfo({});
    setShowPlaceDetail(true);
  };

  useEffect(() => {
    if (!showPlaceDetail || !selectedPlace?.id) {
      setIsDetailLoading(false);
      return;
    }

    let cancelled = false;

    const loadPlaceDetail = async () => {
      setIsDetailLoading(true);
      try {
        const detailUrl = new URL('/api/poi/detail', window.location.origin);
        detailUrl.searchParams.set('id', selectedPlace.id);

        const [serverResp, webDetail, walkingInfo, drivingInfo] = await Promise.all([
          fetch(detailUrl.toString(), { cache: 'no-store' })
            .then(async (resp) => {
              const json = await resp.json().catch(() => null);
              return resp.ok && json?.success ? (json.data as POIItem) : null;
            })
            .catch(() => null),
          getPOIDetails(selectedPlace.id).catch(() => null),
          selectedPlace.location ? calculateWalkingDistance(selectedPlace.location).catch(() => null) : Promise.resolve(null),
          selectedPlace.location ? calculateDrivingDistance(selectedPlace.location).catch(() => null) : Promise.resolve(null),
        ]);

        if (cancelled) return;

        const mergedPhotos = [
          ...(webDetail?.photos || []),
          ...(serverResp?.photos || []),
          ...(selectedPlace.photos || []),
        ].filter((photo, index, list) => {
          const url = String(photo?.url || '').trim();
          if (!url) return false;
          return list.findIndex((item) => item?.url === url) === index;
        });

        setSelectedPlaceDetail({
          ...selectedPlace,
          ...(serverResp || {}),
          photos: mergedPhotos,
          rating: webDetail?.rating || serverResp?.rating || selectedPlace.rating,
          cost: webDetail?.price || serverResp?.cost || selectedPlace.cost,
          tel: webDetail?.tel || serverResp?.tel || selectedPlace.tel,
          address: webDetail?.address || serverResp?.address || selectedPlace.address,
          type: serverResp?.type || selectedPlace.type,
          businessHours: webDetail?.businessHours || undefined,
        });
        setRouteInfo({
          walking: walkingInfo ? `${walkingInfo.distance} · 步行${walkingInfo.duration}` : undefined,
          driving: drivingInfo ? `${drivingInfo.distance} · 驾车${drivingInfo.duration}` : undefined,
        });
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    };

    loadPlaceDetail();

    return () => {
      cancelled = true;
    };
  }, [showPlaceDetail, selectedPlace, getPOIDetails, calculateWalkingDistance, calculateDrivingDistance]);

  const activePlace: EnrichedPreviewPlace | null = selectedPlaceDetail || (selectedPlace ? { ...selectedPlace } : null);
  const activePhotos = activePlace?.photos || [];
  const activePhoto = activePhotos[selectedPhotoIndex]?.url || activePhotos[0]?.url;
  const typeTags = String(activePlace?.type || '')
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);

  // 根据皮肤和部位获取渐变
  const getGradient = (part: 'top' | 'body' | 'full') => {
    const { colors, pattern } = currentSkin;
    
    switch (pattern) {
      case 'gradient':
        return part === 'top' 
          ? `linear-gradient(180deg, ${colors.secondary} 0%, ${colors.primary} 100%)`
          : `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;
      case 'neon':
        return part === 'top'
          ? `linear-gradient(180deg, ${colors.primary} 0%, #111 100%)`
          : `linear-gradient(180deg, #111 0%, ${colors.secondary} 100%)`;
      case 'crystal':
        return part === 'top'
          ? `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, ${colors.primary}88 50%, ${colors.secondary}44 100%)`
          : `linear-gradient(135deg, ${colors.primary}66 0%, ${colors.secondary}44 50%, rgba(255,255,255,0.8) 100%)`;
      case 'rainbow':
        return `linear-gradient(135deg, #FF6B6B 0%, #FFB347 25%, #4ECDC4 50%, #9B59B6 75%, #FF6B6B 100%)`;
      case 'retro':
        return `linear-gradient(180deg, ${colors.primary} 0%, ${colors.secondary} 100%)`;
      default:
        return `linear-gradient(180deg, ${colors.secondary} 0%, ${colors.primary} 100%)`;
    }
  };

  // 渲染不同形状的盲盒
  const renderBoxShape = () => {
    const { shape, borderRadius, pattern } = currentSkin;
    
    // 基础尺寸和位置
    const boxStyle = {
      width: shape === 'capsule' ? '140px' : shape === 'cylinder' ? '160px' : '150px',
      height: shape === 'capsule' ? '200px' : shape === 'cylinder' ? '180px' : shape === 'gem' ? '160px' : '140px',
      borderRadius: borderRadius,
      background: getGradient('body'),
      boxShadow: `
        0 15px 40px ${currentSkin.colors.glow}44,
        inset 0 2px 0 rgba(255,255,255,0.3),
        inset 0 -2px 0 rgba(0,0,0,0.1)
      `,
      transform: isHovered ? 'scale(1.05)' : 'scale(1)',
      transition: 'all 0.3s ease',
      position: 'relative' as const,
      overflow: 'hidden',
    };

    // 渲染盖子
    const renderLid = () => {
      const lidStyle = {
        position: 'absolute' as const,
        top: shape === 'gem' ? '-30px' : shape === 'capsule' ? '-25px' : '-20px',
        left: '50%',
        transform: `translateX(-50%) ${isHovered ? 'translateY(-5px)' : ''}`,
        width: shape === 'capsule' ? '120px' : shape === 'cylinder' ? '140px' : '130px',
        height: shape === 'gem' ? '50px' : shape === 'capsule' ? '40px' : '35px',
        borderRadius: borderRadius,
        background: getGradient('top'),
        boxShadow: `0 -5px 20px ${currentSkin.colors.glow}33`,
        transition: 'all 0.3s ease',
      };

      return (
        <div style={lidStyle}>
          {/* 云朵纹理 */}
          {pattern === 'cloud' && (
            <div className="absolute inset-x-4 top-2 flex justify-between">
              <div className="w-8 h-8 rounded-full bg-white/40" />
              <div className="w-12 h-6 rounded-full bg-white/30 mt-2" />
              <div className="w-6 h-6 rounded-full bg-white/40" />
            </div>
          )}
          {/* 霓虹边框 */}
          {pattern === 'neon' && (
            <div className="absolute inset-1 border-2 border-white/60 rounded-xl" />
          )}
          {/* 水晶光泽 */}
          {pattern === 'crystal' && (
            <div className="absolute inset-0 bg-gradient-to-br from-white/60 via-transparent to-white/20" />
          )}
          {/* 复古条纹 */}
          {pattern === 'retro' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-4 h-full bg-gradient-to-b from-amber-700/50 via-amber-600/50 to-amber-700/50" />
            </div>
          )}
          {/* 中心丝带 */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-4 h-10 bg-white/50 rounded-full" />
        </div>
      );
    };

    // 渲染蝴蝶结
    const renderBow = () => {
      if (!currentSkin.hasBow) return null;
      
      return (
        <div 
          className="absolute -top-2 left-1/2 -translate-x-1/2 z-10"
          style={{ transform: 'translateX(-50%)' }}
        >
          <div 
            className="w-12 h-6 rounded-full"
            style={{ background: currentSkin.colors.glow }}
          />
          <div 
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
            style={{ background: currentSkin.colors.primary }}
          />
        </div>
      );
    };

    // 渲染丝带
    const renderRibbon = () => {
      if (!currentSkin.hasRibbon) return null;
      
      return (
        <>
          <div 
            className="absolute"
            style={{
              top: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              width: '30px',
              height: '100%',
              background: `${currentSkin.colors.glow}88`,
              clipPath: 'polygon(30% 0, 70% 0, 100% 100%, 0% 100%)',
            }}
          />
        </>
      );
    };

    // 渲染条纹
    const renderStripes = () => {
      if (!currentSkin.hasStripe) return null;
      
      return (
        <div className="absolute inset-0 opacity-30" 
          style={{ 
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.15) 8px, rgba(255,255,255,0.15) 16px)',
          }} 
        />
      );
    };

    // 渲染中心图标
    const renderCenterIcon = () => (
      <div 
        className="absolute inset-0 flex items-center justify-center"
        style={{
          animation: isAnimating ? 'boxShake 0.3s ease-in-out' : isHovered ? 'float 2s ease-in-out infinite' : 'none',
        }}
      >
        <span 
          className="text-6xl"
          style={{
            filter: `drop-shadow(0 0 15px ${categoryColor})`,
          }}
        >
          {icon}
        </span>
      </div>
    );

    // 渲染问号
    const renderQuestionMark = () => (
      <div className="absolute inset-0 flex items-center justify-center">
        <span 
          className="text-7xl font-black text-white/90"
          style={{
            textShadow: `0 0 20px ${currentSkin.colors.glow}`,
            opacity: isHovered ? 0.8 : 0,
            transition: 'opacity 0.3s',
          }}
        >
          ?
        </span>
      </div>
    );

    // 渲染闪烁装饰
    const renderSparkle = () => {
      if (!currentSkin.hasSparkle) return null;
      
      return (
        <div className="absolute top-2 right-2">
          <Sparkles 
            className="w-5 h-5 animate-pulse"
            style={{ color: categoryColor }}
          />
        </div>
      );
    };

    // 渲染底部装饰
    const renderBottomDecoration = () => (
      <div 
        className="absolute -bottom-2 left-1/2 -translate-x-1/2"
        style={{
          width: '120px',
          height: '12px',
          borderRadius: '0 0 50% 50%',
          background: `linear-gradient(180deg, ${currentSkin.colors.primary}66 0%, transparent 100%)`,
        }}
      />
    );

    // 渲染外发光
    const renderGlow = () => (
      <div 
        className="absolute -inset-4 blur-xl opacity-50 transition-opacity duration-300"
        style={{
          background: `radial-gradient(circle, ${currentSkin.colors.glow}66 0%, transparent 70%)`,
          opacity: isHovered ? 0.8 : 0.4,
          borderRadius: borderRadius,
        }}
      />
    );

    // 根据形状渲染不同的盒子
    switch (shape) {
      case 'cylinder':
        // 圆柱形 - 圆润的罐子
        return (
          <div 
            className="relative mx-auto cursor-pointer"
            style={boxStyle}
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {renderGlow()}
            {renderLid()}
            {renderRibbon()}
            {renderStripes()}
            {renderCenterIcon()}
            {renderQuestionMark()}
            {renderSparkle()}
            {renderBottomDecoration()}
          </div>
        );

      case 'gem':
        // 宝石形 - 菱形切割
        return (
          <div 
            className="relative mx-auto cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {renderGlow()}
            {/* 八边形宝石 */}
            <div 
              className="relative"
              style={{
                width: '160px',
                height: '180px',
                transform: isHovered ? 'scale(1.05) translateY(-5px)' : 'scale(1)',
                transition: 'all 0.3s ease',
              }}
            >
              {/* 顶部三角形 */}
              <div 
                className="absolute top-0 left-1/2 -translate-x-1/2"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '60px solid transparent',
                  borderRight: '60px solid transparent',
                  borderBottom: `60px solid ${currentSkin.colors.secondary}`,
                  filter: `drop-shadow(0 -5px 10px ${currentSkin.colors.glow}44)`,
                }}
              />
              {/* 中间矩形 */}
              <div 
                className="absolute top-[60px] left-1/2 -translate-x-1/2"
                style={{
                  width: '120px',
                  height: '60px',
                  background: getGradient('body'),
                  boxShadow: `0 10px 30px ${currentSkin.colors.glow}44`,
                }}
              />
              {/* 底部三角形 */}
              <div 
                className="absolute bottom-0 left-1/2 -translate-x-1/2"
                style={{
                  width: 0,
                  height: 0,
                  borderLeft: '60px solid transparent',
                  borderRight: '60px solid transparent',
                  borderTop: `60px solid ${currentSkin.colors.primary}`,
                  filter: `drop-shadow(0 5px 10px ${currentSkin.colors.glow}44)`,
                }}
              />
              {/* 中心图标 */}
              <div className="absolute top-[55px] left-1/2 -translate-x-1/2 z-10">
                <span 
                  className="text-5xl"
                  style={{ filter: `drop-shadow(0 0 10px ${categoryColor})` }}
                >
                  {icon}
                </span>
              </div>
              {/* 光泽 */}
              <div 
                className="absolute top-[60px] left-1/2 -translate-x-1/2"
                style={{
                  width: '120px',
                  height: '60px',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.4) 0%, transparent 50%)',
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 0)',
                }}
              />
            </div>
          </div>
        );

      case 'capsule':
        // 胶囊形 - 药丸/胶囊
        return (
          <div 
            className="relative mx-auto cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {renderGlow()}
            <div 
              className="relative"
              style={{
                width: '100px',
                height: '180px',
                borderRadius: '50px',
                background: getGradient('body'),
                boxShadow: `
                  0 15px 40px ${currentSkin.colors.glow}44,
                  inset 0 2px 0 rgba(255,255,255,0.4),
                  inset 0 -2px 0 rgba(0,0,0,0.1)
                `,
                transform: isHovered ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.3s ease',
              }}
            >
              {/* 分隔线 */}
              <div 
                className="absolute top-1/2 left-0 right-0 h-1"
                style={{ background: 'rgba(255,255,255,0.3)' }}
              />
              {/* 中心图标 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span 
                  className="text-5xl"
                  style={{ filter: `drop-shadow(0 0 10px ${categoryColor})` }}
                >
                  {icon}
                </span>
              </div>
              {/* 霓虹光效 */}
              {pattern === 'neon' && (
                <div 
                  className="absolute inset-0 rounded-full"
                  style={{
                    boxShadow: `0 0 20px ${currentSkin.colors.glow}, inset 0 0 20px ${currentSkin.colors.glow}44`,
                    animation: 'pulse 2s ease-in-out infinite',
                  }}
                />
              )}
            </div>
            {/* 发光装饰 */}
            <Sparkles 
              className="absolute top-4 right-0 w-6 h-6 animate-pulse"
              style={{ color: categoryColor }}
            />
          </div>
        );

      case 'crystal':
        // 水晶形 - 六边形
        return (
          <div 
            className="relative mx-auto cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {renderGlow()}
            <div 
              className="relative"
              style={{
                width: '140px',
                height: '160px',
                transform: isHovered ? 'scale(1.05) translateY(-5px)' : 'scale(1)',
                transition: 'all 0.3s ease',
              }}
            >
              {/* 六边形水晶 */}
              <svg viewBox="0 0 100 120" className="w-full h-full drop-shadow-lg">
                <defs>
                  <linearGradient id={`crystalGrad-${skin}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={currentSkin.colors.secondary} />
                    <stop offset="50%" stopColor={currentSkin.colors.primary} />
                    <stop offset="100%" stopColor={currentSkin.colors.secondary} />
                  </linearGradient>
                </defs>
                <polygon 
                  points="50,0 100,30 100,90 50,120 0,90 0,30"
                  fill={`url(#crystalGrad-${skin})`}
                  stroke={currentSkin.colors.glow}
                  strokeWidth="2"
                />
                {/* 内部光泽 */}
                <polygon 
                  points="50,10 85,35 85,75 50,100 15,75 15,35"
                  fill="rgba(255,255,255,0.2)"
                />
                <polygon 
                  points="50,20 70,38 70,60 50,78 30,60 30,38"
                  fill="rgba(255,255,255,0.15)"
                />
              </svg>
              {/* 中心图标 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span 
                  className="text-5xl"
                  style={{ filter: `drop-shadow(0 0 10px ${categoryColor})` }}
                >
                  {icon}
                </span>
              </div>
            </div>
          </div>
        );

      case 'star':
        // 星形 - 五角星
        return (
          <div 
            className="relative mx-auto cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {renderGlow()}
            <div 
              className="relative"
              style={{
                width: '160px',
                height: '160px',
                transform: isHovered ? 'scale(1.05) rotate(5deg)' : 'scale(1) rotate(0deg)',
                transition: 'all 0.3s ease',
              }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg">
                <defs>
                  <linearGradient id={`starGrad-${skin}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={currentSkin.colors.secondary} />
                    <stop offset="100%" stopColor={currentSkin.colors.primary} />
                  </linearGradient>
                </defs>
                <polygon 
                  points="50,0 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35"
                  fill={`url(#starGrad-${skin})`}
                  stroke={currentSkin.colors.glow}
                  strokeWidth="2"
                />
              </svg>
              {/* 中心图标 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <span 
                  className="text-5xl"
                  style={{ filter: `drop-shadow(0 0 10px ${categoryColor})` }}
                >
                  {icon}
                </span>
              </div>
            </div>
          </div>
        );

      case 'box':
      default:
        // 经典方形盒子
        return (
          <div 
            className="relative mx-auto cursor-pointer"
            onClick={handleClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {renderGlow()}
            <div style={boxStyle}>
              {/* 边框纹理 */}
              {pattern === 'outline' && (
                <div className="absolute inset-2 border-2 border-white/30 rounded-xl" />
              )}
              {renderStripes()}
              {renderRibbon()}
              {renderCenterIcon()}
              {renderQuestionMark()}
              {renderSparkle()}
            </div>
            {renderLid()}
            {renderBow()}
            {renderBottomDecoration()}
          </div>
        );
    }
  };

  return (
    <div className="relative w-full max-w-full">
      {/* 盲盒主体 + 编辑按钮 */}
      <div className="relative z-0 flex justify-center">
        <div className="relative inline-block">
          {renderBoxShape()}
          {/* 编辑按钮 - 放在盲盒右上角 */}
          {showEditButton && (
            <button
              onClick={() => setShowSkinPicker(!showSkinPicker)}
              className="absolute -top-1 -right-1 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 z-20"
              style={{
                background: 'white',
                border: '3px solid #FFE4B5',
                color: '#FF6B6B',
                boxShadow: '0 4px 12px rgba(255,107,107,0.3)',
              }}
            >
              <Palette className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 预览缩略图列表 */}
      <div className="relative z-10 mt-6 w-full" style={{ minHeight: '80px' }}>
        {/* 加载状态 */}
        {isPreviewLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#FF6B6B' }} />
            <span className="ml-2 text-sm" style={{ color: '#666' }}>正在加载商家...</span>
          </div>
        )}

        {/* 空状态 */}
        {!isPreviewLoading && (!previewPlaces || previewPlaces.length === 0) && (
          <div className="text-center py-8 px-4">
            <Search className="w-12 h-12 mx-auto mb-2 opacity-40" style={{ color: '#999' }} />
            <p className="text-sm" style={{ color: '#999' }}>暂无匹配的商家</p>
            <p className="text-xs mt-1" style={{ color: '#BBB' }}>试试调整筛选条件</p>
          </div>
        )}

        {/* 商家预览列表 - 纵向翻页式 */}
        {!isPreviewLoading && previewPlaces && previewPlaces.length > 0 && (
          <>
            <div className="mb-2 flex items-center gap-2 px-1">
              <div className="flex-1 relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索商家名称..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 text-xs rounded-lg border"
                  style={{ borderColor: '#FFE4B5', background: '#FFF8E7', color: '#333', outline: 'none' }}
                />
                {searchText && (
                  <button
                    onClick={() => setSearchText('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  >✕</button>
                )}
              </div>
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {searchText ? `找到 ${filteredPlaces.length} 家` : `共 ${previewPlaces.length} 家`}
                {isPreviewHydrating ? ' · 补全中' : ''}
                {' · '}
                {safePage + 1}/{totalPages}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 px-1 py-1 sm:grid-cols-3" style={{ minHeight: '160px' }}>
              {pagedPlaces.map((p) => (
                <div
                  key={p.id}
                  className="cursor-pointer rounded-xl overflow-hidden border border-gray-100 bg-white shadow-sm transition-transform hover:scale-[1.02] active:scale-95"
                  onClick={() => handlePlaceClick(p)}
                >
                  <PlaceImage
                    src={p.photos && p.photos.length > 0 ? p.photos[0].url : undefined}
                    alt={p.name}
                    className="h-20 w-full object-cover"
                    fallbackLabel="暂无商家图片"
                  />
                  <div className="p-2 text-xs">
                    <div className="font-medium line-clamp-1" title={p.name}>{p.name}</div>
                    <div className="mt-1 text-gray-500">{p.rating ? `⭐ ${p.rating}` : '未知'} · {p.cost ? `¥${p.cost}` : '未知'}</div>
                    <div className="mt-1 line-clamp-1 text-[11px] text-gray-400">{p.address || '地址未知'}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* 翻页控件 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-3">
                <button
                  onClick={() => setPreviewPage(0)}
                  disabled={previewPage === 0}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: previewPage === 0 ? '#F5F5F5' : '#FFF8E7',
                    color: previewPage === 0 ? '#CCC' : '#FF6B6B',
                    border: `1px solid ${previewPage === 0 ? '#EEE' : '#FFE4B5'}`,
                  }}
                >
                  首页
                </button>
                <button
                  onClick={() => setPreviewPage((p) => Math.max(0, p - 1))}
                  disabled={previewPage === 0}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: previewPage === 0 ? '#F5F5F5' : '#FFF8E7',
                    color: previewPage === 0 ? '#CCC' : '#FF6B6B',
                    border: `1px solid ${previewPage === 0 ? '#EEE' : '#FFE4B5'}`,
                  }}
                >
                  ←
                </button>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.target as HTMLFormElement).querySelector('input');
                  if (input) {
                    const n = parseInt(input.value);
                    if (n >= 1 && n <= totalPages) { setPreviewPage(n - 1); input.value = ''; }
                  }
                }} className="flex items-center gap-1">
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    placeholder={`${previewPage + 1}`}
                    className="w-10 h-7 text-center text-xs border rounded-md"
                    style={{ borderColor: '#FFE4B5', background: '#FFF8E7', color: '#333' }}
                  />
                  <span className="text-xs text-gray-400">/ {totalPages}</span>
                  <button type="submit" className="text-xs px-2 py-1 rounded" style={{ background: '#FFE4B5', color: '#FF6B6B' }}>跳转</button>
                </form>
                <button
                  onClick={() => setPreviewPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={previewPage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: previewPage >= totalPages - 1 ? '#F5F5F5' : '#FFF8E7',
                    color: previewPage >= totalPages - 1 ? '#CCC' : '#FF6B6B',
                    border: `1px solid ${previewPage >= totalPages - 1 ? '#EEE' : '#FFE4B5'}`,
                  }}
                >
                  →
                </button>
                <button
                  onClick={() => setPreviewPage(totalPages - 1)}
                  disabled={previewPage >= totalPages - 1}
                  className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: previewPage >= totalPages - 1 ? '#F5F5F5' : '#FFF8E7',
                    color: previewPage >= totalPages - 1 ? '#CCC' : '#FF6B6B',
                    border: `1px solid ${previewPage >= totalPages - 1 ? '#EEE' : '#FFE4B5'}`,
                  }}
                >
                  末页
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 皮肤选择器 - 通过 portal 渲染以防止布局抖动 */}
      {showSkinPicker && createPortal(
        <div 
          className="fixed p-4 rounded-2xl shadow-2xl"
          style={{
            background: 'white',
            border: '3px solid #FFE4B5',
            width: '340px',
            zIndex: 60,
            right: '20px',
            bottom: '80px',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-bold text-base" style={{ color: '#FF6B6B' }}>
              选择盲盒皮肤
            </span>
            <button
              onClick={() => setShowSkinPicker(false)}
              className="w-6 h-6 rounded-full flex items-center justify-center"
              style={{ background: '#FFF0F0', color: '#FF6B6B' }}
            >
              ✕
            </button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {Object.entries(SKINS).map(([key, config]) => (
              <button
                key={key}
                onClick={() => {
                  onSkinChange?.(key);
                  setShowSkinPicker(false);
                }}
                className="p-2 rounded-xl text-center transition-all hover:scale-105"
                style={{
                  background: skin === key ? `${config.colors.primary}22` : '#f8f8f8',
                  border: `2px solid ${skin === key ? config.colors.primary : 'transparent'}`,
                  boxShadow: skin === key ? `0 2px 8px ${config.colors.primary}44` : 'none',
                }}
              >
                <div className="text-2xl mb-1">{config.icon}</div>
                <div className="text-xs font-medium truncate" style={{ color: config.colors.primary }}>
                  {config.name}
                </div>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}

      {/* 商家详情弹窗 */}
      <Dialog open={showPlaceDetail} onOpenChange={setShowPlaceDetail}>
        <DialogContent 
          className="max-w-2xl max-h-[85vh] overflow-y-auto"
          style={{ 
            background: 'white',
            border: '3px solid #FFE4B5',
            borderRadius: '1.5rem',
          }}
        >
          <DialogHeader>
            <DialogTitle 
              className="text-xl font-black pr-8"
              style={{ color: '#FF6B6B' }}
            >
              {selectedPlace?.name || '商家详情'}
            </DialogTitle>
          </DialogHeader>
          
          {activePlace && (
            <div className="space-y-4">
              {isDetailLoading && (
                <div className="flex items-center gap-2 rounded-xl bg-[#FFF8E7] px-4 py-3 text-sm text-[#A06A3B]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  正在补充商家详情、路线和图片...
                </div>
              )}

              {/* 商家图片 */}
              <PlaceImage
                src={activePhoto}
                alt={activePlace.name}
                className="h-48 w-full rounded-xl object-cover"
                fallbackLabel="暂无商家图片"
              />
              {activePhotos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {activePhotos.slice(0, 4).map((photo, index) => (
                    <button
                      key={`${activePlace.id}-${photo.url}-${index}`}
                      type="button"
                      onClick={() => setSelectedPhotoIndex(index)}
                      className="overflow-hidden rounded-lg border-2 transition-all"
                      style={{
                        borderColor: index === selectedPhotoIndex ? '#FF6B6B' : '#FFE4B5',
                      }}
                    >
                      <PlaceImage
                        src={photo.url}
                        alt={`${activePlace.name}-${index + 1}`}
                        className="h-16 w-full object-cover"
                        fallbackLabel="图片缺失"
                      />
                    </button>
                  ))}
                </div>
              )}
              
              {/* 商家信息 */}
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {activePlace.rating ? (
                    <span className="rounded-full bg-[#FFF3D6] px-3 py-1 text-xs font-semibold text-[#D9822B]">
                      ⭐ {activePlace.rating} 分
                    </span>
                  ) : null}
                  {activePlace.cost ? (
                    <span className="rounded-full bg-[#FFECEC] px-3 py-1 text-xs font-semibold text-[#FF6B6B]">
                      人均 ¥{activePlace.cost}
                    </span>
                  ) : null}
                  {activePlace.distance ? (
                    <span className="rounded-full bg-[#EEF9F7] px-3 py-1 text-xs font-semibold text-[#2FA89E]">
                      直线约 {activePlace.distance < 1000 ? `${Math.round(activePlace.distance)}m` : `${(activePlace.distance / 1000).toFixed(1)}km`}
                    </span>
                  ) : null}
                  {activePlace.district ? (
                    <span className="rounded-full bg-[#F4F1FF] px-3 py-1 text-xs font-semibold text-[#8B63B8]">
                      {activePlace.district}
                    </span>
                  ) : null}
                </div>

                {/* 地址 */}
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#FF6B6B' }} />
                  <div className="text-sm" style={{ color: '#333' }}>
                    {activePlace.address || '地址未知'}
                  </div>
                </div>
                
                {/* 电话 */}
                {activePlace.tel && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 flex-shrink-0" style={{ color: '#4ECDC4' }} />
                    <a 
                      href={`tel:${activePlace.tel}`} 
                      className="text-sm font-medium"
                      style={{ color: '#4ECDC4' }}
                    >
                      {activePlace.tel}
                    </a>
                  </div>
                )}

                {activePlace.businessHours && (
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 flex-shrink-0" style={{ color: '#9B59B6' }} />
                    <span className="text-sm" style={{ color: '#333' }}>
                      {activePlace.businessHours}
                    </span>
                  </div>
                )}

                {(routeInfo.walking || routeInfo.driving) && (
                  <div className="rounded-xl bg-[#FFF8E7] px-4 py-3">
                    <div className="text-xs font-semibold text-[#A06A3B]">从你当前位置出发</div>
                    {routeInfo.walking ? (
                      <div className="mt-1 text-sm text-[#444]">步行：{routeInfo.walking}</div>
                    ) : null}
                    {routeInfo.driving ? (
                      <div className="mt-1 text-sm text-[#444]">驾车：{routeInfo.driving}</div>
                    ) : null}
                  </div>
                )}
                
                {/* 类型 */}
                {typeTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {typeTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full px-2 py-1 text-xs"
                        style={{ background: '#FFF8E7', color: '#666' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 导航按钮 */}
              {activePlace.location && (
                <a 
                  href={getNavigationUrl({
                    name: activePlace.name,
                    location: activePlace.location,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-bold text-white transition-all hover:scale-105 active:scale-95"
                  style={{ 
                    background: 'linear-gradient(135deg, #FF6B6B 0%, #FF7043 100%)',
                    boxShadow: '0 4px 16px rgba(255,107,107,0.4)',
                  }}
                >
                  <Navigation className="w-5 h-5" />
                  导航前往
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 动画样式 */}
      <style jsx global>{`
        @keyframes boxShake {
          0%, 100% { transform: scale(1.05) rotate(0deg); }
          25% { transform: scale(1.1) rotate(-5deg); }
          75% { transform: scale(1.1) rotate(5deg); }
        }
        
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        
        @keyframes rainbowShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

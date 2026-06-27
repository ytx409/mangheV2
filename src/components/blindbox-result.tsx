'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, Phone, Navigation, Heart, RotateCcw, Share2, X, ChevronUp } from 'lucide-react';
import type { BlindboxResult } from '@/hooks/use-blindbox';
import { useFavorites } from '@/hooks/use-blindbox';
import { useAMapWeb } from '@/hooks/use-amap-web';

interface BlindboxResultCardProps {
  result: BlindboxResult;
  onReopen: () => void;
  onClose?: () => void;
}

export default function BlindboxResultCard({
  result,
  onReopen,
  onClose,
}: BlindboxResultCardProps) {
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const { getPOIDetails } = useAMapWeb();
  const [liked, setLiked] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [amapPhotos, setAmapPhotos] = useState<{ url: string; title?: string }[]>([]);

  useEffect(() => {
    setLiked(isFavorite(result.id));
  }, [result, isFavorite]);

  // 获取高德地图详细图片
  useEffect(() => {
    const fetchPOIDetails = async () => {
      if (!result.id) return;

      try {
        const details = await getPOIDetails(result.id);
        if (details && details.photos.length > 0) {
          setAmapPhotos(details.photos);
        }
      } catch (error) {
        console.error('获取POI详情失败:', error);
      }
    };

    if (expanded && result.id) {
      fetchPOIDetails();
    }
  }, [expanded, result.id, getPOIDetails]);

  const handleFavorite = () => {
    if (liked) {
      removeFavorite(result.id);
    } else {
      addFavorite(result);
    }
    setLiked(!liked);
  };

  const handleShare = async () => {
    const distanceText = result.distance ? `，距离约${result.distance}` : '';
    const shareText = `我在「盲盒去哪」开出了一个${result.category}：${result.name}！评分 ${result.rating}，人均 ${result.price}/人${distanceText}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: '盲盒去哪',
          text: shareText,
          url: result.navigationUrl,
        });
      } catch {
        // 用户取消分享
      }
    } else {
      navigator.clipboard.writeText(shareText);
      alert('分享内容已复制到剪贴板！');
    }
  };

  // 根据分类选择颜色
  const categoryColors: Record<string, { bg: string; text: string; border: string }> = {
    '美食盲盒': { bg: '#FF6B6B', text: '#FF6B6B', border: '#FF8E8E' },
    '游玩盲盒': { bg: '#4ECDC4', text: '#4ECDC4', border: '#7EDDD6' },
    '休闲盲盒': { bg: '#9B59B6', text: '#9B59B6', border: '#BB79D6' },
    '全能盲盒': { bg: '#FFB347', text: '#FFB347', border: '#FFD080' },
  };
  
  const colors = categoryColors[result.category] || categoryColors['全能盲盒'];

  // 优先使用高德地图Web API获取的图片，降级到后端API图片，最后使用占位图
  const photoUrl = amapPhotos.length > 0
    ? amapPhotos[0].url
    : (result.photos && result.photos.length > 0
      ? result.photos[0].url
      : `https://picsum.photos/seed/${result.id}/400/300`);

  return (
    <div className="animate-slide-up">
      {/* 可折叠头部 */}
      <button 
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 rounded-t-2xl transition-colors"
        style={{ background: 'rgba(255,248,231,0.95)' }}
      >
        <div className="flex items-center gap-2">
          <span className="text-2xl">{result.categoryIcon}</span>
          <span className="font-bold" style={{ color: colors.text }}>{result.category}</span>
          {result.aiRecommended && (
            <Badge
              className="px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1"
              style={{ background: '#9B59B622', color: '#9B59B6', border: '1px solid #B07FD6' }}
            >
              🤖 AI推荐
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ChevronUp 
            className={`w-5 h-5 transition-transform ${expanded ? '' : 'rotate-180'}`} 
            style={{ color: '#888' }} 
          />
        </div>
      </button>

      {/* 展开的内容 */}
      {expanded && (
        <Card 
          className="rounded-t-none overflow-hidden shadow-2xl"
          style={{ 
            border: `3px solid ${colors.border}`,
            boxShadow: `0 10px 40px ${colors.bg}33`
          }}
        >
          {/* 图片区域 */}
          <div className="relative h-48">
            <img
              src={photoUrl}
              alt={result.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://picsum.photos/400/300';
              }}
            />
            <div 
              className="absolute inset-0"
              style={{
                background: `linear-gradient(to top, ${colors.bg}88 0%, transparent 60%)`
              }}
            />
            
            {/* 顶部按钮 */}
            <div className="absolute top-3 left-3 right-3 flex justify-between">
              {/* 关闭按钮 */}
              {onClose && (
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                >
                  <X className="w-5 h-5" style={{ color: '#666' }} />
                </button>
              )}
              
              {/* 收藏按钮 */}
              <button
                onClick={handleFavorite}
                className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg hover:scale-110 transition-transform ml-auto"
              >
                <Heart 
                  className={`w-5 h-5 ${liked ? 'text-red-500' : ''}`} 
                  style={{ color: liked ? '#FF6B6B' : '#999', fill: liked ? '#FF6B6B' : 'none' }} 
                />
              </button>
            </div>

            {/* 底部信息 */}
            <div className="absolute bottom-3 left-3 right-3">
              <div className="flex items-end justify-between">
                <div className="flex items-center gap-2">
                  {result.rating && result.rating > 0 ? (
                    <div
                      className="px-3 py-1 rounded-full backdrop-blur-sm flex items-center gap-1 shadow"
                      style={{ background: 'rgba(255,255,255,0.95)' }}
                    >
                      <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                      <span className="font-bold text-sm" style={{ color: '#333' }}>{result.rating.toFixed(1)}</span>
                    </div>
                  ) : (
                    <div
                      className="px-3 py-1 rounded-full backdrop-blur-sm flex items-center gap-1 shadow"
                      style={{ background: 'rgba(255,255,255,0.95)' }}
                    >
                      <span className="text-xs text-gray-400">未知</span>
                    </div>
                  )}
                </div>
                {result.price && result.price > 0 ? (
                  <div
                    className="px-3 py-1 rounded-full backdrop-blur-sm shadow"
                    style={{ background: 'rgba(255,255,255,0.95)' }}
                  >
                    <span className="font-black text-lg" style={{ color: colors.text }}>¥{result.price}</span>
                    <span className="text-xs text-gray-500">/人</span>
                  </div>
                ) : (
                  <div
                    className="px-3 py-1 rounded-full backdrop-blur-sm shadow"
                    style={{ background: 'rgba(255,255,255,0.95)' }}
                  >
                    <span className="text-xs text-gray-400">未知</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 内容区域 */}
          <div className="p-4" style={{ background: 'white' }}>
            {/* 店铺名称 */}
            <h2 className="text-xl font-black mb-2" style={{ color: '#333' }}>
              {result.name}
            </h2>

            {/* 分类标签 */}
            <div className="flex items-center gap-2 mb-3">
              <Badge
                className="px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: `${colors.bg}22`, color: colors.text, border: `1px solid ${colors.border}` }}
              >
                {result.type?.split('|').pop() || '商户'}
              </Badge>
              {/* 距离信息：直线距离（预计算，无需等待） */}
              {result.distance ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                  📍 约{result.distance}
                </span>
              ) : null}
            </div>

            {/* 治愈文案 */}
            {result.healingMessage && (
              <div
                className="text-center py-3 px-4 rounded-xl mb-4"
                style={{ background: `${colors.bg}11` }}
              >
                <p className="text-sm font-medium" style={{ color: colors.text }}>
                  ✨ {result.healingMessage} ✨
                </p>
              </div>
            )}

            {/* 地址 */}
            {result.address && (
              <div className="flex items-start gap-2 mb-3">
                <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: colors.text }} />
                <span className="text-sm text-gray-600 leading-relaxed">{result.address}</span>
              </div>
            )}

            {/* 电话 */}
            {result.tel && (
              <div className="flex items-center gap-2 mb-4">
                <Phone className="w-4 h-4 flex-shrink-0" style={{ color: colors.text }} />
                <a 
                  href={`tel:${result.tel}`} 
                  className="text-sm font-medium hover:underline"
                  style={{ color: colors.text }}
                >
                  {result.tel}
                </a>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="space-y-2">
              {/* 导航按钮 */}
              <button
                onClick={() => window.open(result.navigationUrl, '_blank')}
                className="w-full py-3 rounded-xl font-bold text-base text-white transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                style={{
                  background: `linear-gradient(135deg, ${colors.bg} 0%, ${colors.border} 100%)`,
                  boxShadow: `0 6px 20px ${colors.bg}44`
                }}
              >
                <Navigation className="w-5 h-5" />
                导航前往
              </button>

              {/* 次要操作 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onReopen}
                  className="py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1"
                  style={{
                    background: 'white',
                    border: `2px solid ${colors.border}`,
                    color: colors.text
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                  再抽一次
                </button>
                <button
                  onClick={handleShare}
                  className="py-2.5 rounded-xl font-medium text-sm transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1"
                  style={{
                    background: 'white',
                    border: `2px solid ${colors.border}`,
                    color: colors.text
                  }}
                >
                  <Share2 className="w-4 h-4" />
                  分享结果
                </button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 展开/收起箭头 */}
      {!expanded && (
        <div className="text-center py-2 rounded-b-xl" style={{ background: 'rgba(255,248,231,0.95)' }}>
          <ChevronUp className="inline w-5 h-5" style={{ color: '#888' }} />
        </div>
      )}

      <style jsx global>{`
        @keyframes slideUp {
          0% { opacity: 0; transform: translateY(100px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        :global(.animate-slide-up) {
          animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </div>
  );
}

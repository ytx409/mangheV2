'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, Clock, Settings, Heart, Trash2, ChevronLeft, MapPin, X, RefreshCw } from 'lucide-react';
import type { BlindboxResult, BlindboxSkin } from '@/hooks/use-blindbox';
import { STORAGE_KEYS } from "@/lib/storage-keys";

// 盲盒皮肤配置
const SKINS: { key: BlindboxSkin; name: string; icon: string; desc: string; color: string }[] = [
  { key: 'basic', name: '经典款', icon: '💙', desc: '天蓝色经典圆角', color: '#42A5F5' },
  { key: 'cute', name: '可爱款', icon: '🌸', desc: '粉嫩云朵纹理', color: '#FF69B4' },
  { key: 'minimal', name: '简约款', icon: '⚪', desc: '透明线条风格', color: '#333333' },
  { key: 'vibrant', name: '彩虹款', icon: '🌈', desc: '渐变彩虹色彩', color: '#FF6B6B' },
  { key: 'gradient', name: '渐变款', icon: '🎨', desc: '紫蓝渐变梦幻', color: '#667eea' },
  { key: 'neon', name: '霓虹款', icon: '✨', desc: '炫酷霓虹光效', color: '#00ff88' },
  { key: 'retro', name: '复古款', icon: '📼', desc: '怀旧复古风格', color: '#f4a460' },
  { key: 'crystal', name: '水晶款', icon: '💎', desc: '晶莹剔透质感', color: '#87ceeb' },
];

interface ProfilePageProps {
  onBack?: () => void;
  initialTab?: string;
  onSelectResult?: (result: BlindboxResult) => void;
}

// 获取收藏列表
function getFavorites(): BlindboxResult[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.favorites);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

// 获取历史记录
function getHistory(): BlindboxResult[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.history);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

// 清除历史记录
function clearAllHistory() {
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify([]));
}

// 移除收藏
function removeFavoriteItem(id: string): BlindboxResult[] {
  const favorites = getFavorites();
  const newFavorites = favorites.filter(f => f.id !== id);
  localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify(newFavorites));
  return newFavorites;
}

// 获取当前皮肤
function getCurrentSkin(): BlindboxSkin {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.skin);
    if (saved && ['basic', 'cute', 'minimal', 'vibrant', 'gradient', 'neon', 'retro', 'crystal'].includes(saved)) {
      return saved as BlindboxSkin;
    }
  } catch {}
  return 'basic';
}

// 更改皮肤
function setSkin(skin: BlindboxSkin) {
  localStorage.setItem(STORAGE_KEYS.skin, skin);
}

export default function ProfilePage({ onBack, initialTab = 'favorites', onSelectResult }: ProfilePageProps) {
  const [favorites, setFavorites] = useState<BlindboxResult[]>([]);
  const [history, setHistory] = useState<BlindboxResult[]>([]);
  const [currentSkin, setCurrentSkinState] = useState<BlindboxSkin>('basic');
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 加载数据
  const loadData = useCallback(() => {
    setFavorites(getFavorites());
    setHistory(getHistory());
    setCurrentSkinState(getCurrentSkin());
  }, []);

  // 初始化加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 监听 storage 变化（跨标签页同步）
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.favorites || e.key === STORAGE_KEYS.history) {
        loadData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadData]);

  // 切换 Tab 时刷新数据
  useEffect(() => {
    loadData();
  }, [activeTab, loadData]);

  // 手动刷新
  const handleRefresh = () => {
    setIsRefreshing(true);
    loadData();
    setTimeout(() => setIsRefreshing(false), 300);
  };

  // 清除历史
  const handleClearHistory = () => {
    clearAllHistory();
    setHistory([]);
    setShowConfirmClear(false);
  };

  // 移除收藏
  const handleRemoveFavorite = (id: string) => {
    const newFavorites = removeFavoriteItem(id);
    setFavorites([...newFavorites]);
  };

  // 更改皮肤
  const handleChangeSkin = (skin: BlindboxSkin) => {
    setSkin(skin);
    setCurrentSkinState(skin);
  };

  // 分类颜色
  const getCategoryColor = (category: string) => {
    if (category.includes('美食')) return '#FF6B6B';
    if (category.includes('游玩')) return '#4ECDC4';
    if (category.includes('休闲')) return '#9B59B6';
    return '#FFB347';
  };

  // 卡片组件
  const ItemCard = ({ item, showRemove, onRemove }: { 
    item: BlindboxResult; 
    showRemove?: boolean; 
    onRemove?: () => void 
  }) => {
    const categoryColor = getCategoryColor(item.category);

    return (
      <Card 
        className="p-3 flex gap-3 overflow-hidden transition-all hover:shadow-lg cursor-pointer"
        style={{
          background: 'white',
          border: '2px solid #FFE4B5',
          borderRadius: '16px',
        }}
        onClick={() => onSelectResult?.(item)}
      >
        <img
          src={item.photos && item.photos.length > 0 ? item.photos[0].url : `https://picsum.photos/seed/${item.id}/100/100`}
          alt={item.name}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src = 'https://picsum.photos/100/100';
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-base truncate" style={{ color: '#333' }}>{item.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge 
                  className="px-2 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: `${categoryColor}22`, color: categoryColor }}
                >
                  {item.categoryIcon} {item.category.replace('盲盒', '')}
                </Badge>
              </div>
              <div className="flex items-center gap-2 mt-1 text-xs" style={{ color: '#888' }}>
                <span className="flex items-center">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 mr-0.5" />
                  {item.rating}
                </span>
                <span>¥{item.price}/人</span>
                {item.distance && <span>{item.distance}</span>}
              </div>
            </div>
            {showRemove && onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110"
                style={{ background: '#FFF0F0', color: '#FF6B6B' }}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs truncate" style={{ color: '#888' }}>
            <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: categoryColor }} />
            <span>{item.address}</span>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: 'linear-gradient(180deg, #FFF8E7 0%, #FFF3D6 100%)' }}>
      {/* 顶部装饰条 */}
      <div 
        className="h-2 w-full sticky top-0 z-50"
        style={{
          background: 'linear-gradient(90deg, #FF6B6B, #FFB347, #4ECDC4, #9B59B6, #FF6B6B)',
          backgroundSize: '200% 100%',
          animation: 'gradientMove 3s ease infinite'
        }}
      />

      {/* 顶部导航 */}
      <header 
        className="sticky top-2 z-50 bg-white/90 backdrop-blur-md"
        style={{ borderBottom: '2px solid #FFE4B5' }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {onBack && (
              <button 
                onClick={onBack}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{ background: '#FFF8E7', color: '#FF6B6B' }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <span className="font-black text-xl" style={{ color: '#FF6B6B' }}>个人中心</span>
          </div>
          <button 
            onClick={handleRefresh}
            className={`w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-110 ${isRefreshing ? 'animate-spin' : ''}`}
            style={{ background: '#FFF8E7', color: '#FF6B6B' }}
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Tab 切换 */}
        <div className="flex gap-2 mb-6">
          {[
            { key: 'favorites', icon: Heart, label: '收藏', color: '#FF6B6B' },
            { key: 'history', icon: Clock, label: '历史', color: '#4ECDC4' },
            { key: 'settings', icon: Settings, label: '设置', color: '#9B59B6' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 py-3 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              style={{
                background: activeTab === tab.key ? tab.color : 'white',
                color: activeTab === tab.key ? 'white' : '#666',
                border: `2px solid ${activeTab === tab.key ? tab.color : '#FFE4B5'}`,
                boxShadow: activeTab === tab.key ? `0 4px 16px ${tab.color}44` : '0 2px 8px rgba(0,0,0,0.05)',
              }}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.key === 'favorites' && favorites.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{ background: activeTab === tab.key ? 'white' : tab.color, color: activeTab === tab.key ? tab.color : 'white' }}>
                  {favorites.length}
                </span>
              )}
              {tab.key === 'history' && history.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs" style={{ background: activeTab === tab.key ? 'white' : tab.color, color: activeTab === tab.key ? tab.color : 'white' }}>
                  {history.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 收藏列表 */}
        {activeTab === 'favorites' && (
          <div className="space-y-3">
            {favorites.length === 0 ? (
              <div className="text-center py-16">
                <div 
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: '#FFF0F0' }}
                >
                  <Heart className="w-10 h-10" style={{ color: '#FFB3B3' }} />
                </div>
                <p className="font-bold text-lg mb-1" style={{ color: '#333' }}>还没有收藏</p>
                <p className="text-sm" style={{ color: '#888' }}>开启盲盒后点击爱心即可收藏</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: '#888' }}>
                    共 {favorites.length} 个收藏
                  </span>
                  <button
                    onClick={handleRefresh}
                    className="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 transition-all hover:scale-105"
                    style={{ background: '#F0F7FF', color: '#42A5F5' }}
                  >
                    <RefreshCw className="w-3 h-3" />
                    刷新
                  </button>
                </div>
                {favorites.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    showRemove
                    onRemove={() => handleRemoveFavorite(item.id)}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* 历史记录 */}
        {activeTab === 'history' && (
          <div className="space-y-3">
            {history.length === 0 ? (
              <div className="text-center py-16">
                <div 
                  className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: '#E8F8F7' }}
                >
                  <Clock className="w-10 h-10" style={{ color: '#7EDDD6' }} />
                </div>
                <p className="font-bold text-lg mb-1" style={{ color: '#333' }}>还没有历史</p>
                <p className="text-sm" style={{ color: '#888' }}>开启盲盒后会自动记录</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center">
                  <span className="text-sm" style={{ color: '#888' }}>
                    共 {history.length} 条记录
                  </span>
                  <button
                    onClick={() => setShowConfirmClear(true)}
                    className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1 transition-all hover:scale-105"
                    style={{ background: '#FFF0F0', color: '#FF6B6B' }}
                  >
                    <Trash2 className="w-3 h-3" />
                    清除全部
                  </button>
                </div>
                {history.map((item, index) => (
                  <ItemCard 
                    key={`${item.id}-${(item as any).timestamp || index}`} 
                    item={item} 
                  />
                ))}
              </>
            )}
          </div>
        )}

        {/* 设置 */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* 皮肤设置 */}
            <div>
              <h3 className="font-bold text-base mb-3 flex items-center gap-2" style={{ color: '#333' }}>
                <span>🎨</span> 盲盒皮肤
              </h3>
              <div className="grid grid-cols-4 gap-2">
                {SKINS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => handleChangeSkin(s.key)}
                    className="p-3 rounded-2xl text-center transition-all hover:scale-105"
                    style={{
                      background: currentSkin === s.key ? `${s.color}22` : 'white',
                      border: `3px solid ${currentSkin === s.key ? s.color : '#FFE4B5'}`,
                      boxShadow: currentSkin === s.key ? `0 4px 16px ${s.color}44` : '0 2px 8px rgba(0,0,0,0.05)',
                    }}
                  >
                    <div className="text-2xl mb-1">{s.icon}</div>
                    <div 
                      className="text-xs font-medium truncate"
                      style={{ color: currentSkin === s.key ? s.color : '#666' }}
                    >
                      {s.name}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 皮肤预览 */}
            <div>
              <h3 className="font-bold text-base mb-3 flex items-center gap-2" style={{ color: '#333' }}>
                <span>👁️</span> 皮肤预览
              </h3>
              <Card 
                className="p-6 flex justify-center"
                style={{
                  background: 'white',
                  border: '2px solid #FFE4B5',
                  borderRadius: '20px',
                }}
              >
                <div className="text-center">
                  <div className="text-6xl mb-2">
                    {SKINS.find(s => s.key === currentSkin)?.icon || '💙'}
                  </div>
                  <div 
                    className="font-bold"
                    style={{ color: SKINS.find(s => s.key === currentSkin)?.color || '#42A5F5' }}
                  >
                    {SKINS.find(s => s.key === currentSkin)?.name || '经典款'}
                  </div>
                  <div className="text-xs mt-1" style={{ color: '#888' }}>
                    {SKINS.find(s => s.key === currentSkin)?.desc || '天蓝色经典圆角'}
                  </div>
                </div>
              </Card>
            </div>

            {/* 关于 */}
            <div>
              <h3 className="font-bold text-base mb-3 flex items-center gap-2" style={{ color: '#333' }}>
                <span>ℹ️</span> 关于产品
              </h3>
              <Card 
                className="p-6"
                style={{
                  background: 'linear-gradient(135deg, #FFF8E7 0%, #FFF3D6 100%)',
                  border: '2px solid #FFE4B5',
                  borderRadius: '20px',
                }}
              >
                <div className="text-center">
                  <div className="text-5xl mb-3">🎁</div>
                  <h4 className="font-black text-xl mb-1" style={{ color: '#FF6B6B' }}>盲盒去哪</h4>
                  <p className="text-sm mb-3" style={{ color: '#888' }}>版本 1.0.0</p>
                  <p className="text-xs leading-relaxed" style={{ color: '#666' }}>
                    以&quot;盲盒惊喜感+地图精准推荐&quot;解决用户吃喝玩乐选择困难
                  </p>
                  <div className="flex justify-center gap-2 mt-3">
                    {['纯免费', '零广告', '无推广'].map((tag) => (
                      <span 
                        key={tag}
                        className="px-2 py-1 rounded-full text-xs font-medium"
                        style={{ background: '#4ECDC422', color: '#4ECDC4' }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}
      </main>

      {/* 底部装饰条 */}
      <div 
        className="h-2 w-full fixed bottom-0 left-0 right-0"
        style={{
          background: 'linear-gradient(90deg, #FF6B6B, #FFB347, #4ECDC4, #9B59B6, #FF6B6B)',
          backgroundSize: '200% 100%',
          animation: 'gradientMove 3s ease infinite'
        }}
      />

      {/* 清除确认弹窗 */}
      {showConfirmClear && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <Card 
            className="w-full max-w-xs p-6 rounded-3xl"
            style={{
              background: 'white',
              border: '3px solid #FFE4B5',
            }}
          >
            <div className="text-center">
              <div className="text-5xl mb-3">🗑️</div>
              <h3 className="font-black text-xl mb-2" style={{ color: '#333' }}>确认清除历史？</h3>
              <p className="text-sm mb-6" style={{ color: '#888' }}>
                清除后无法恢复哦
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmClear(false)}
                  className="flex-1 py-3 rounded-2xl font-bold transition-all hover:scale-105"
                  style={{
                    background: 'white',
                    border: '2px solid #FFE4B5',
                    color: '#666',
                  }}
                >
                  取消
                </button>
                <button
                  onClick={handleClearHistory}
                  className="flex-1 py-3 rounded-2xl font-bold transition-all hover:scale-105"
                  style={{
                    background: '#FF6B6B',
                    color: 'white',
                  }}
                >
                  确认清除
                </button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* 全局动画样式 */}
      <style jsx global>{`
        @keyframes gradientMove {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

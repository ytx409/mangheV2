'use client';

import { useEffect, useState } from 'react';
import BlindboxHome from '@/components/blindbox-home';
import BlindboxResultCard from '@/components/blindbox-result';
import ProfilePage from '@/components/profile-page';
import type { BlindboxResult, CityInfo, Category, FilterOptions } from '@/hooks/use-blindbox';
import { STORAGE_KEYS } from '@/lib/storage-keys';

interface HistoryItem extends BlindboxResult {
  timestamp?: number;
}

export default function Home() {
  const [view, setView] = useState<'home' | 'profile'>('home');
  const [result, setResult] = useState<BlindboxResult | null>(null);
  const [currentCity, setCurrentCity] = useState<CityInfo>({ name: '北京', adcode: '110000' });
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const [filters, setFilters] = useState<FilterOptions>({
    distance: '1to3',
  });

  useEffect(() => {
    try {
      const savedCity = localStorage.getItem(STORAGE_KEYS.currentCity);
      if (!savedCity) return;
      const parsed = JSON.parse(savedCity) as CityInfo;
      if (parsed?.name) {
        setCurrentCity(parsed);
      }
    } catch {
      // ignore invalid cache
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.currentCity, JSON.stringify(currentCity));
    } catch {
      // ignore persistence failures
    }
  }, [currentCity]);

  // 开盲盒（仅设置状态，动画在 BlindboxHome 内部处理）
  const handleOpenBlindbox = () => {
    // 动画逻辑移交给 BlindboxHome 组件
    setResult(null);
  };

  // 结果回调（动画完成后）
  const handleShowResult = (r: BlindboxResult) => {
    setResult(r);
    
    // 添加到历史记录
    try {
      const saved = localStorage.getItem('blindbox_history');
      const history: HistoryItem[] = saved ? JSON.parse(saved) : [];
      const newHistory = [
        { ...r, timestamp: Date.now() },
        ...history.filter((h) => h.id !== r.id).slice(0, 9),
      ];
      localStorage.setItem('blindbox_history', JSON.stringify(newHistory));
    } catch (e) {
      console.error('保存历史失败:', e);
    }
  };

  // 重新开盲盒
  const handleReopen = () => {
    setResult(null);
  };

  return (
    <>
      {view === 'home' && (
        <div className="min-h-screen relative">
          {/* 首页内容 */}
          <BlindboxHome
            currentCity={currentCity}
            onCityChange={setCurrentCity}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            filters={filters}
            onFiltersChange={setFilters}
            onOpenBlindbox={handleOpenBlindbox}
            isOpening={false}
            onShowResult={handleShowResult}
            result={result}
            onShowProfile={() => setView('profile')}
          />

          {/* 结果卡片常驻显示 - 固定在底部 */}
          {result && (
              <div 
                className="fixed bottom-0 left-0 right-0 z-50 p-4"
              style={{
                background: 'linear-gradient(to top, #FFF8E7 80%, transparent 100%)',
                maxHeight: '85vh',
                overflowY: 'auto',
              }}
            >
              <div className="max-w-2xl mx-auto">
                <BlindboxResultCard
                  result={result}
                  onReopen={handleReopen}
                  onClose={() => setResult(null)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'profile' && (
        <ProfilePage
          onBack={() => setView('home')}
        />
      )}
    </>
  );
}

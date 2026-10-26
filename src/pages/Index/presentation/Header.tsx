import type { HeaderProps } from './OriginalViewProps';
import { useState } from 'react';
import { Menu, Search, RefreshCw } from 'lucide-react';
import { Input } from './OriginalPrimitives';
import { useTheme } from '../../../features/presentation/PresentationContext';
import { useSettings } from '../../../features/presentation/PresentationContext';
import { usePresentationActions } from '../../../features/presentation/PresentationContext';

const Header = ({
  searchQuery,
  setSearchQuery,
  searchInputRef,
  onMobileMenuOpen,
  onOpenMusic: _onOpenMusic,
  onOpenMusicSearch, // 新增：触发音乐搜索卡片
  musicEnabled: _musicEnabled = true,
}: HeaderProps) => {
  const { themeColor } = useTheme();
  const { refreshPublicData } = useSettings();
  const { isAuthenticated } = usePresentationActions();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isAuthenticated || isRefreshing) return;

    setIsRefreshing(true);
    try {
      await refreshPublicData();
    } catch (error) {
      console.error('手动刷新失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex items-center justify-between p-4 bg-transparent">
      {/* 左侧：汉堡菜单按钮（移动端）+ Logo */}
      <div className="flex items-center">
        {/* 汉堡菜单按钮 - 仅在移动端显示 */}
        <button
          onClick={onMobileMenuOpen}
          className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600 mr-3"
          aria-label="打开菜单"
          title="打开菜单"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo */}
        <img
          src="https://s3.bmp.ovh/imgs/2025/07/31/baf5bf7ff49cae82.jpg"
          alt="应用Logo"
          className="h-10 w-10 rounded-full object-cover"
        />
        <span
          className="ml-2 text-xl font-bold transition-colors duration-300"
          style={{ color: themeColor }}
        >
          Meow
        </span>
      </div>

      {/* 右侧：搜索框 + 刷新按钮（游客模式）*/}
      <div className="flex items-center gap-2">
        {/* 游客模式刷新按钮 */}
        {!isAuthenticated && (
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center justify-center w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
            aria-label="刷新公开内容"
            title="刷新公开内容"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        )}

        <div className="relative w-48 sm:w-64 md:w-80">
          <Input
            ref={searchInputRef}
            type="search"
            placeholder="搜索想法/音樂..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const q = (searchQuery || '').trim();
                if (q) {
                  // 仅触发音乐搜索卡片展示，不改变现有过滤逻辑
                  onOpenMusicSearch?.(q);
                }
                // 移动端：回车后收起键盘
                e.currentTarget.blur();
              }
            }}
            className="pr-10 md:pr-20"
          />
          
          {/* 搜索按钮 - 移动端显示，点击触发音乐搜索 */}
          {searchQuery && (
            <button
              onClick={() => {
                const q = (searchQuery || '').trim();
                if (q) {
                  onOpenMusicSearch?.(q);
                }
              }}
              className="md:hidden absolute inset-y-0 right-0 flex items-center pr-3 text-blue-500 hover:text-blue-600"
              aria-label="搜索音乐"
            >
              <Search className="h-4 w-4" />
            </button>
          )}
          
          {/* Ctrl+K快捷键提示 - 仅在桌面端显示 */}
          <div className="hidden md:flex absolute inset-y-0 right-0 items-center pr-3 pointer-events-none">
            <kbd className="px-1 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">Ctrl</kbd>
            <span className="mx-1 text-xs">+</span>
            <kbd className="px-1 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 rounded">K</kbd>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Header;
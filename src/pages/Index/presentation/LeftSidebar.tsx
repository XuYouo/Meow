import type { MemoView } from '../../../features/presentation/objects/MemoView';
import { Calendar, Settings, Sun, Moon, Pin, PinOff, Layout, Heart } from 'lucide-react';
import GitHubStyleHeatmap from './GitHubStyleHeatmap';
import UsageStats from './UsageStats';
import { BookOpen } from 'lucide-react';
import UserAvatar from './UserAvatar';
import { useTheme } from '../../../features/presentation/PresentationContext';


interface SidebarProps {
 heatmapData: {date:string;count:number}[]; memos: MemoView[]; pinnedMemos: MemoView[];
 isLeftSidebarHidden?:boolean;setIsLeftSidebarHidden?:(value:boolean)=>void;
 isLeftSidebarPinned:boolean;setIsLeftSidebarPinned:(value:boolean)=>void;isLeftSidebarHovered:boolean;
 isAppLoaded:boolean;isInitialLoad:boolean;isCanvasMode:boolean;setIsCanvasMode:(value:boolean)=>void;
 onSettingsOpen:()=>void;onDateClick:(value:string)=>void;onOpenDailyReview:()=>void;
 showFavoriteRandomButton:boolean;onFavoriteRandomBackground:()=>void;isAuthenticated?:boolean;onResetTodayReview:()=>void;
}
const LeftSidebar = ({
  heatmapData,
  memos,
  pinnedMemos,
  isLeftSidebarHidden: _isLeftSidebarHidden,
  setIsLeftSidebarHidden: _setIsLeftSidebarHidden,
  isLeftSidebarPinned,
  setIsLeftSidebarPinned,
  isLeftSidebarHovered,
  isAppLoaded,
  isInitialLoad,
  isCanvasMode,
  setIsCanvasMode,
  onSettingsOpen,
  onDateClick,
  onOpenDailyReview,
  showFavoriteRandomButton,
  onFavoriteRandomBackground,
  onResetTodayReview,
  isAuthenticated = true
}: SidebarProps) => {
  const { darkMode, toggleDarkMode, themeColor } = useTheme();
  const resetTodayReviewStatus = onResetTodayReview;

  return (
    <div
      className={`hidden lg:flex flex-col ${isAppLoaded && !isInitialLoad ? 'transition-all duration-300 ease-in-out' : ''} ${
        isLeftSidebarPinned
          ? 'border-r dark:border-gray-700 lg:w-1/5 lg:min-w-[240px] opacity-100 translate-x-0'
          : isLeftSidebarHovered
            ? 'fixed left-0 top-16 z-30 m-4 rounded-2xl shadow-xl border dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-80 h-[calc(100vh-8rem)] max-h-[80vh] opacity-100 translate-x-0'
            : isAppLoaded && !isInitialLoad
              ? 'fixed left-0 top-16 z-30 m-4 rounded-2xl shadow-xl border dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-80 h-[calc(100vh-8rem)] max-h-[80vh] opacity-0 pointer-events-none -translate-x-full'
              : 'fixed left-0 top-16 z-30 m-4 rounded-2xl shadow-xl border dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-80 h-[calc(100vh-8rem)] max-h-[80vh] opacity-0 pointer-events-none -translate-x-full'
      }`}
    >
      <div className={`p-4 flex-1 flex flex-col min-w-[240px] relative ${!isLeftSidebarPinned && isLeftSidebarHovered ? 'h-full overflow-hidden' : ''}`}>
        {/* 固定/取消固定按钮 - 画布模式下禁用 */}
        <button
          onClick={() => setIsLeftSidebarPinned(!isLeftSidebarPinned)}
          disabled={isCanvasMode}
          className={`absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ease-in-out hover:scale-110 ${
            isCanvasMode
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
          aria-label={isCanvasMode ? "画布模式下不可固定侧栏" : (isLeftSidebarPinned ? "取消固定左侧栏" : "固定左侧栏")}
          title={isCanvasMode ? "画布模式下不可固定侧栏" : (isLeftSidebarPinned ? "取消固定左侧栏" : "固定左侧栏")}
        >
          {isLeftSidebarPinned ? (
            <Pin className="h-4 w-4 transition-transform duration-300 ease-in-out" />
          ) : (
            <PinOff className="h-4 w-4 transition-transform duration-300 ease-in-out" />
          )}
        </button>

        <div className="flex items-center mb-4">
          <Calendar
            className="h-5 w-5 mr-2 transition-colors duration-300"
            style={{ color: themeColor }}
          />
          <h2 className="text-lg font-semibold dark:text-gray-200">记忆热力图</h2>
        </div>

        <div className="flex-1 overflow-hidden">
          <GitHubStyleHeatmap data={heatmapData} onDateClick={onDateClick} isSidebarHovered={!isLeftSidebarPinned && isLeftSidebarHovered} />
          <UsageStats memos={memos} pinnedMemos={pinnedMemos} />

          {/* 每日回顾入口 */}
          <div className="px-2 pt-4">
            <div
              role="button"
              tabIndex={0}
              onClick={onOpenDailyReview}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDailyReview?.();
                }
              }}
              className="relative w-full flex items-center gap-2 px-4 py-3 rounded-xl transition-colors duration-200 bg-gray-200 dark:bg-gray-700 border border-gray-200 dark:border-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none"
              aria-label="打开每日回顾"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4" style={{ color: themeColor }} />
                <span className="text-sm font-medium" style={{ color: themeColor }}>每日回顾</span>
              </div>
              {/* 重置今日按钮（小×）：无圆形包裹，垂直居中，靠右 */}
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); resetTodayReviewStatus(); }}
                className="ml-auto px-1 text-sm leading-none text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                aria-label="重置今日卡片为FAIL"
              >
                ×
              </button>
            </div>
          </div>
  {/* 关闭上方的 flex-1 overflow-hidden 容器 */}
  </div>

  {/* 底部按钮区域 */}
        <div className="mt-auto pt-4 flex items-center space-x-2">
          {/* 用户按钮 - 现在总是显示，不再依赖于cloudSyncEnabled */}
          <UserAvatar onOpenSettings={onSettingsOpen} />

          {/* 设置按钮 - 仅登录用户可见 */}
          {isAuthenticated && (
            <button
              onClick={onSettingsOpen}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              aria-label="打开设置"
            >
              <Settings className="h-5 w-5 transition-transform duration-300 hover:rotate-90" />
            </button>
          )}

          {/* 画布模式切换按钮 - 仅登录用户可见 */}
          {isAuthenticated && (
            <button
              onClick={() => setIsCanvasMode(!isCanvasMode)}
              className={`flex items-center justify-center w-10 h-10 rounded-full transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600 ${
                isCanvasMode
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
              aria-label={isCanvasMode ? "退出画布模式" : "进入画布模式"}
            >
              <Layout className="h-5 w-5 transition-transform duration-300" />
            </button>
          )}

          {/* 黑暗模式切换按钮 */}
          <button
            onClick={toggleDarkMode}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-yellow-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            aria-label={darkMode ? "切换到白天模式" : "切换到黑夜模式"}
          >
            {darkMode ? (
              <Sun className="h-5 w-5 transition-transform duration-500 transform rotate-180" />
            ) : (
              <Moon className="h-5 w-5 transition-transform duration-500" />
            )}
          </button>

          {/* 随机背景收藏按钮（在随机模式下显示） */}
          {showFavoriteRandomButton && (
            <button
              onClick={onFavoriteRandomBackground}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-pink-100 dark:bg-pink-900/40 text-pink-600 dark:text-pink-300 transition-all duration-300 hover:bg-pink-200 dark:hover:bg-pink-800/60"
              aria-label="收藏当前背景"
              title="收藏当前背景并设为固定背景"
            >
              <Heart className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default LeftSidebar;

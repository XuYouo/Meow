import type { MemoView } from '../../../features/presentation/objects/MemoView';
import { X, Calendar, Tag, Settings, Sun, Moon } from 'lucide-react';
import GitHubStyleHeatmap from './GitHubStyleHeatmap';
import TagManager from './TagManager';
import UserAvatar from './UserAvatar';
import { useTheme } from '../../../features/presentation/PresentationContext';

const MobileSidebar = ({
  isOpen,
  onClose,
  heatmapData,
  memos,
  activeTag,
  setActiveTag,
  onSettingsOpen,
  onDateClick,
  isAuthenticated = true
}: {isOpen:boolean;onClose:()=>void;heatmapData:{date:string;count:number}[];memos:MemoView[];activeTag:string|null;setActiveTag:(tag:string|null)=>void;onSettingsOpen:()=>void;onDateClick:(date:string)=>void;isAuthenticated?:boolean}) => {
  const { darkMode, toggleDarkMode, themeColor } = useTheme();

  if (!isOpen) return null;

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
        onClick={onClose}
      />

      {/* 侧栏内容 */}
      <div className="fixed inset-y-0 left-0 w-80 bg-white dark:bg-gray-800 z-50 lg:hidden transform transition-transform duration-300 ease-in-out shadow-xl">
        {/* 侧栏内容区域 */}
        <div className="h-full flex flex-col p-4">
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600 hover:scale-110"
            aria-label="关闭菜单"
          >
            <X className="h-4 w-4" />
          </button>

          {/* 上部内容区域 - 可滚动 */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {/* 热力图区域 */}
            <div>
              <div className="flex items-center mb-4">
                <Calendar
                  className="h-5 w-5 mr-2 transition-colors duration-300"
                  style={{ color: themeColor }}
                />
                <h3 className="text-lg font-semibold dark:text-gray-200">记忆热力图</h3>
              </div>
              <div className="overflow-hidden">
                <GitHubStyleHeatmap data={heatmapData} onDateClick={onDateClick} />
              </div>
            </div>

            {/* 分隔线 */}
            <div className="border-t dark:border-gray-700"></div>

            {/* 标签管理区域 */}
            <div className="pb-4">
              <div className="flex items-center mb-4">
                <Tag
                  className="h-5 w-5 mr-2 transition-colors duration-300"
                  style={{ color: themeColor }}
                />
                <h3 className="text-lg font-semibold dark:text-gray-200">标签管理</h3>
              </div>
              {/* 标签管理容器 */}
              <div className="max-h-96 overflow-y-auto scrollbar-hidden">
                <TagManager
                  memos={memos}
                  activeTag={activeTag}
                  setActiveTag={(tag) => {
                    setActiveTag(tag);
                    onClose(); // 选择标签后关闭侧栏
                  }}
                  showTitle={false} // 移动端侧栏中隐藏标题
                />
              </div>
            </div>
          </div>

          {/* 底部操作区域 */}
          <div className="border-t dark:border-gray-700 pt-4 mt-4">
            <div className="flex items-center space-x-3">
              {/* 用户头像 */}
              <div className="w-12 h-12 flex items-center justify-center">
                <UserAvatar onOpenSettings={() => {
                  onSettingsOpen();
                  onClose();
                }} />
              </div>

              {/* 设置按钮 - 仅登录用户可见 */}
              {isAuthenticated && (
                <button
                  onClick={() => {
                    onSettingsOpen();
                    onClose();
                  }}
                  className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  aria-label="打开设置"
                >
                  <Settings className="h-5 w-5 transition-transform duration-300 hover:rotate-90" />
                </button>
              )}

              {/* 黑暗模式切换按钮 */}
              <button
                onClick={toggleDarkMode}
                className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-yellow-300 transition-all duration-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                aria-label={darkMode ? "切换到白天模式" : "切换到黑夜模式"}
              >
                {darkMode ? (
                  <Sun className="h-5 w-5 transition-transform duration-500 transform rotate-180" />
                ) : (
                  <Moon className="h-5 w-5 transition-transform duration-500" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileSidebar;

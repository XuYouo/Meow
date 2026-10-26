import { useState, useRef, useEffect } from 'react';
import { LogOut, LogIn, User, Settings as SettingsIcon } from 'lucide-react';
import { usePresentationActions } from '../../../features/presentation/PresentationContext';
import { ReadMediaAPI } from '../../../apis/media/ReadMediaAPI';
import { usePreferences } from '../../../features/settings/PreferencesProvider';

const UserAvatar = ({ onOpenSettings }: { onOpenSettings: () => void }) => {
  const { isAuthenticated, onLogout: logout, onLogin: showLogin } = usePresentationActions();
  const requiresAuth = true;
  const { preferences } = usePreferences();
  const cloudSyncEnabled = false;
  const avatarConfig = { imageUrl: preferences?.avatarMediaId ? ReadMediaAPI(preferences.avatarMediaId) : null };
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const avatarRef = useRef<HTMLButtonElement | null>(null);

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          avatarRef.current && !avatarRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleAvatarClick = () => {
    if (isAuthenticated) {
      setIsDropdownOpen(!isDropdownOpen);
    } else {
      // 未认证时，显示登录对话框
      showLogin?.();
    }
  };

  // 获取头像URL的优先级：自定义头像 > 默认头像
  const getAvatarUrl = () => {
    // 优先使用用户设置的自定义头像
    if (avatarConfig && avatarConfig.imageUrl) {
      return avatarConfig.imageUrl;
    }

    // 默认返回null，显示默认图标
    return null;
  };

  // 获取显示名称
  const getDisplayName = () => {
    return isAuthenticated ? "已登录" : "访客";
  };

  const handleLogout = () => { setIsDropdownOpen(false); logout(); };

  const handleOpenSettings = () => {
    setIsDropdownOpen(false);
    onOpenSettings?.();
  };

  // 移除认证判断，始终显示用户按钮
  // 未认证时显示登录按钮，已认证时显示用户头像和下拉菜单
  return (
    <div className="relative">
      <button
        ref={avatarRef}
        onClick={handleAvatarClick}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden transition-all duration-300 hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 dark:hover:ring-offset-gray-800"
        aria-label={isAuthenticated ? "用户菜单" : "登录"}
        title={isAuthenticated ? getDisplayName() : "点击登录"}
      >
        {isAuthenticated ? (
          // 已认证状态：显示头像或用户图标
          <>
            {getAvatarUrl() ? (
              <img
                src={getAvatarUrl() ?? undefined}
                alt={getDisplayName()}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const sibling = e.currentTarget.nextElementSibling; if (sibling instanceof HTMLElement) sibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="w-full h-full flex items-center justify-center text-gray-700 dark:text-gray-300"
              style={{ display: getAvatarUrl() ? 'none' : 'flex' }}
            >
              <User className="h-5 w-5" />
            </div>
          </>
        ) : (
          // 未认证状态：显示登录图标
          <LogIn className="h-5 w-5 text-gray-700 dark:text-gray-300" />
        )}
      </button>

      {/* Beta badge */}
      {cloudSyncEnabled && (
        <span
          className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs font-medium bg-yellow-500 text-white hover:bg-yellow-600"
        >
          β
        </span>
      )}

      {/* 用户下拉菜单 - 只有已认证时才显示 */}
      {isAuthenticated && isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute bottom-full left-0 mb-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50"
        >
          {/* 用户信息 */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                {getAvatarUrl() ? (
                  <img
                    src={getAvatarUrl() ?? undefined}
                    alt={getDisplayName()}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const sibling = e.currentTarget.nextElementSibling; if (sibling instanceof HTMLElement) sibling.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="w-full h-full flex items-center justify-center text-gray-700 dark:text-gray-300"
                  style={{ display: getAvatarUrl() ? 'none' : 'flex' }}
                >
                  <User className="h-4 w-4" />
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {getDisplayName()}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 break-words">
                  {requiresAuth && isAuthenticated ? "密码认证" : "无需认证"}
                </p>
              </div>
            </div>
          </div>

          {/* 菜单项 */}
          <div className="py-1">
            <button
              onClick={handleOpenSettings}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
            >
              <SettingsIcon className="h-4 w-4" />
              <span>设置</span>
            </button>
            {/* 只有在需要认证且已认证时才显示退出登录按钮 */}
            {requiresAuth && isAuthenticated && (
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center space-x-2"
              >
                <LogOut className="h-4 w-4" />
                <span>退出登录</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default UserAvatar;

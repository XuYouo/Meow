import type { MemoView } from '../../../features/presentation/objects/MemoView';
import { Pin, PinOff } from 'lucide-react';
import TagManager from './TagManager';

interface SidebarProps { memos: MemoView[]; activeTag: string|null; setActiveTag:(tag:string|null)=>void; isRightSidebarHidden?:boolean;setIsRightSidebarHidden?:(value:boolean)=>void;isRightSidebarPinned:boolean;setIsRightSidebarPinned:(value:boolean)=>void;isRightSidebarHovered:boolean;isAppLoaded:boolean;isInitialLoad:boolean;isCanvasMode:boolean }

const RightSidebar = ({
  memos,
  activeTag,
  setActiveTag,
  isRightSidebarHidden: _isRightSidebarHidden,
  setIsRightSidebarHidden: _setIsRightSidebarHidden,
  isRightSidebarPinned,
  setIsRightSidebarPinned,
  isRightSidebarHovered,
  isAppLoaded,
  isInitialLoad,
  isCanvasMode
}: SidebarProps) => {

  return (
    <div
      className={`hidden lg:flex flex-col ${isAppLoaded && !isInitialLoad ? 'transition-all duration-300 ease-in-out' : ''} ${
        isRightSidebarPinned
          ? 'border-l dark:border-gray-700 lg:w-1/5 lg:min-w-[240px] opacity-100 translate-x-0'
          : isRightSidebarHovered
            ? 'fixed right-0 top-16 z-30 m-4 rounded-2xl shadow-xl border dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-80 h-[calc(100vh-8rem)] max-h-[80vh] opacity-100 translate-x-0'
            : isAppLoaded && !isInitialLoad
              ? 'fixed right-0 top-16 z-30 m-4 rounded-2xl shadow-xl border dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-80 h-[calc(100vh-8rem)] max-h-[80vh] opacity-0 pointer-events-none translate-x-full'
              : 'fixed right-0 top-16 z-30 m-4 rounded-2xl shadow-xl border dark:border-gray-700 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-80 h-[calc(100vh-8rem)] max-h-[80vh] opacity-0 pointer-events-none translate-x-full'
      }`}
    >
      <div className={`p-4 flex-1 flex flex-col min-w-[240px] relative ${!isRightSidebarPinned && isRightSidebarHovered ? 'h-full overflow-y-auto' : ''}`}>
        {/* 固定/取消固定按钮 - 画布模式下禁用 */}
        <button
          onClick={() => setIsRightSidebarPinned(!isRightSidebarPinned)}
          disabled={isCanvasMode}
          className={`absolute top-4 left-4 z-10 flex items-center justify-center w-8 h-8 rounded-full transition-all duration-300 ease-in-out hover:scale-110 ${
            isCanvasMode
              ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
          }`}
          aria-label={isCanvasMode ? "画布模式下不可固定侧栏" : (isRightSidebarPinned ? "取消固定右侧栏" : "固定右侧栏")}
          title={isCanvasMode ? "画布模式下不可固定侧栏" : (isRightSidebarPinned ? "取消固定右侧栏" : "固定右侧栏")}
        >
          {isRightSidebarPinned ? (
            <Pin className="h-4 w-4 transition-transform duration-300 ease-in-out" />
          ) : (
            <PinOff className="h-4 w-4 transition-transform duration-300 ease-in-out" />
          )}
        </button>

        <div className="flex-1 overflow-hidden">
          <TagManager
            memos={memos}
            activeTag={activeTag}
            setActiveTag={setActiveTag}
          />
        </div>
      </div>
    </div>
  );
};

export default RightSidebar;
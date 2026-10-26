import type { MemoInputProps } from './OriginalViewProps';
import { Button } from './OriginalPrimitives';
import { Send, Lock } from 'lucide-react';
import MemoEditor from './MemoEditor';

const MemoInput = ({
  memoWriteDisabled = false,
  newMemo,
  setNewMemo,
  onAddMemo,
  onEditorFocus,
  onEditorBlur,
  allMemos = [],
  onAddBacklink,
  onPreviewMemo,
  pendingNewBacklinks = [],
  onRemoveBacklink,
  onAddAudioClip,
  audioClips = [],
  onRemoveAudioClip,
  isAuthenticated = true
}: MemoInputProps) => {
  // 未登录用户显示只读提示
  if (!isAuthenticated) {
    return (
      <div className="flex-shrink-0 p-3 sm:p-4 lg:p-6 pb-0">
        <div className="relative bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 p-6 text-center">
          <Lock className="h-8 w-8 mx-auto mb-3 text-gray-400" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            公开博客模式
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            你正在以访客身份浏览公开内容
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            登录后即可创建和管理你的想法
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 p-3 sm:p-4 lg:p-6 pb-0">
      <div className="relative">
        <MemoEditor disabled={memoWriteDisabled}
          value={newMemo}
          onChange={setNewMemo}
          onSubmit={onAddMemo}
          placeholder="现在的想法是……"
          maxLength={5000}
          showCharCount={true}
          autoFocus={false}
          onFocus={onEditorFocus}
          onBlur={onEditorBlur}
          memosList={allMemos}
          currentMemoId={null}
          backlinks={pendingNewBacklinks}
          onAddBacklink={onAddBacklink}
          onPreviewMemo={onPreviewMemo}
          onRemoveBacklink={onRemoveBacklink}
          audioClips={audioClips}
          onRemoveAudioClip={onRemoveAudioClip}
          onAddAudioClip={onAddAudioClip}
        />
        <Button
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onClick={onAddMemo}
          disabled={memoWriteDisabled || !newMemo.trim()}
          className="absolute bottom-12 right-2 rounded-lg bg-slate-600 hover:bg-slate-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white shadow-md px-3 py-2 flex items-center transition-colors"
        >
          <Send className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>
    </div>
  );
};

export default MemoInput;

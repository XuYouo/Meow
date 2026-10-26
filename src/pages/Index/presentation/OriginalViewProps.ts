import type { MutableRefObject, RefObject, MouseEvent } from 'react';
import type { AudioClipView, MemoView } from '../../../features/presentation/objects/MemoView';

export interface MemoEditorProps {
  value?: string; onChange?: (value: string) => void; placeholder?: string; onSubmit?: () => void;
  disabled?: boolean; maxLength?: number; showCharCount?: boolean; autoFocus?: boolean; className?: string;
  memosList?: MemoView[]; currentMemoId?: string | null; backlinks?: string[];
  onAddBacklink?: (source: string | null, target: string) => void;
  onRemoveBacklink?: (source: string | null, target: string) => void;
  onPreviewMemo?: (id: string) => void; onFocus?: () => void; onBlur?: () => void;
  onAddAudioClip?: (source: string | null, clip: AudioClipView) => void;
  audioClips?: AudioClipView[]; onRemoveAudioClip?: (source: string | null, index: number) => void;
}
export interface MemoInputProps {
  memoWriteDisabled?: boolean;
  newMemo: string; setNewMemo: (value: string) => void; onAddMemo: () => void;
  onEditorFocus?: () => void; onEditorBlur?: () => void;
  allMemos?: MemoView[]; onAddBacklink?: MemoEditorProps['onAddBacklink']; onPreviewMemo?: (id: string) => void;
  pendingNewBacklinks?: string[]; onRemoveBacklink?: MemoEditorProps['onRemoveBacklink'];
  onAddAudioClip?: MemoEditorProps['onAddAudioClip']; audioClips?: AudioClipView[];
  onRemoveAudioClip?: MemoEditorProps['onRemoveAudioClip']; isAuthenticated?: boolean;
}
export interface MemoListProps {
  memos: MemoView[]; pinnedMemos: MemoView[]; activeMenuId: string | null; editingId: string | null; editContent: string;
  activeTag: string | null; activeDate: string | null; showScrollToTop: boolean;
  menuRefs: MutableRefObject<Record<string, HTMLDivElement | null>>; memosContainerRef: RefObject<HTMLDivElement>;
  onMenuAction: (event: MouseEvent, id: string, action: 'toggle-public' | 'pin' | 'unpin' | 'edit' | 'share' | 'delete') => void;
  onMenuContainerEnter: (id: string) => void; onMenuContainerLeave: () => void; onMenuButtonClick: (id: string) => void;
  onEditContentChange: (value: string) => void; onSaveEdit: (id: string) => void; onCancelEdit?: () => void;
  onTagClick: (tag: string | null) => void; onScrollToTop: () => void; clearFilters: () => void;
  allMemos?: MemoView[]; onAddBacklink?: MemoEditorProps['onAddBacklink']; onPreviewMemo?: (id: string) => void;
  onRemoveBacklink?: MemoEditorProps['onRemoveBacklink']; onAddAudioClip?: MemoEditorProps['onAddAudioClip'];
  onRemoveAudioClip?: MemoEditorProps['onRemoveAudioClip']; isAuthenticated?: boolean;
}
export interface HeaderProps {
  searchQuery: string; setSearchQuery: (query: string) => void; searchInputRef: RefObject<HTMLInputElement>;
  onMobileMenuOpen: () => void; onOpenMusic?: () => void; onOpenMusicSearch?: (query: string) => void; musicEnabled?: boolean;
}
export interface MainContentProps extends Omit<MemoListProps, 'memos'>, Omit<MemoInputProps, 'audioClips'>, HeaderProps {
  filteredMemos: MemoView[]; pendingNewAudioClips: AudioClipView[];
  isLeftSidebarHidden: boolean; isRightSidebarHidden: boolean;
  setIsLeftSidebarHidden: (value: boolean) => void; setIsRightSidebarHidden: (value: boolean) => void;
  isLeftSidebarPinned: boolean; isRightSidebarPinned: boolean;
}

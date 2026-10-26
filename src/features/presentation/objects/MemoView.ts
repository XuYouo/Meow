import { ReadMediaAPI } from '../../../apis/media/ReadMediaAPI';
import type { Memo } from '../../../objects/memos/Memo';

export interface AudioClipView {
  id: string;
  mediaId: string;
  url: string;
  durationMs?: number;
  createdAt?: string;
}

export interface MemoView {
  id: string;
  content: string;
  tags: string[];
  backlinks: string[];
  audioClips: AudioClipView[];
  createdAt: string;
  updatedAt: string;
  timestamp: string;
  is_public: boolean;
  isPinned: boolean;
  revision: number;
  entity: Memo;
}

// This is a read-only presentation mapping. Transport and persistent entities
// keep the single new contract; none of these aliases enter an API request.
export function memoView(memo: Memo): MemoView {
  return {
    id: memo.id, content: memo.content, tags: memo.tags,
    backlinks: [...new Set([...memo.links, ...memo.backlinks])],
    audioClips: memo.attachments.filter((attachment) => attachment.kind === 'audio').map((attachment) => ({ id: attachment.mediaId, mediaId: attachment.mediaId, url: ReadMediaAPI(attachment.mediaId), createdAt: memo.createdAt })),
    createdAt: memo.createdAt, updatedAt: memo.updatedAt, timestamp: memo.createdAt,
    is_public: memo.isPublic, isPinned: memo.isPinned, revision: memo.revision, entity: memo,
  };
}

import type { MemoDTO } from '../../../../../shared/contracts/memos/index.js';
import type { Memo } from '../Memo.js';

/** Explicit pure boundary mapping; the shared contract remains the DTO source. */
export function toMemoDTO(memo: Memo): MemoDTO {
  return {
    id: memo.id,content: memo.content,tags: [...memo.tags],links: [...memo.links],backlinks: [...memo.backlinks],
    attachments: memo.attachments.map((attachment) => ({ mediaId: attachment.mediaId,kind: attachment.kind })),
    isPublic: memo.isPublic,isPinned: memo.isPinned,revision: memo.revision,createdAt: memo.createdAt,updatedAt: memo.updatedAt,
  };
}

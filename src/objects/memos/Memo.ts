import type { MemoDTO } from '../../../shared/contracts/memos';

export type Memo = MemoDTO;
export type MemoInput = Pick<Memo, 'id' | 'content' | 'tags' | 'links' | 'attachments' | 'isPublic' | 'isPinned'> & { baseRevision?: number };

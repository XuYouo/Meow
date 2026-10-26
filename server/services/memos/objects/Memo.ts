import type { MemoAttachment } from './MemoAttachment.js';

export interface Memo {
  id: string;
  content: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  attachments: MemoAttachment[];
  isPublic: boolean;
  isPinned: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

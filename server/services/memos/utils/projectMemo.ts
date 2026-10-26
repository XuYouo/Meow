import type Database from 'better-sqlite3';
import type { MemoDTO } from '../../../../shared/contracts/memos/index.js';
import type { Memo } from '../objects/Memo.js';
import { toMemoDTO } from '../objects/apiTypes/MemoDTO.js';
import type { MemoRow } from '../objects/MemoRow.js';
import { readMemoTags } from '../tables/memoTags/table.js';
import { readMemoLinks } from '../tables/memoLinks/table.js';
import { readMemoPin } from '../tables/memoPins/table.js';
import { readMemoAttachments } from '../tables/memoAttachments/table.js';

export function projectMemo(db: Database.Database, row: MemoRow, publicOnly: boolean): MemoDTO {
  const { links, backlinks } = readMemoLinks(db,row.id,publicOnly);
  const memo: Memo = {
    id: row.id, content: row.content, tags: readMemoTags(db,row.id), links, backlinks,
    attachments: readMemoAttachments(db,row.id), isPublic: row.is_public === 1,
    isPinned: readMemoPin(db,row.id), revision: row.revision,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
  return toMemoDTO(memo);
}

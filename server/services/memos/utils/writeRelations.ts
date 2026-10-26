import { AppError } from '../../../system/errors/AppError.js';
import type { MemoAttachmentDTO } from '../../../../shared/contracts/memos/index.js';
import { ensureTag, removeUnusedTags } from '../tables/tags/table.js';
import { replaceMemoTags } from '../tables/memoTags/table.js';
import { replaceMemoLinks } from '../tables/memoLinks/table.js';
import { replaceMemoAttachments } from '../tables/memoAttachments/table.js';
import { getMemoRow } from '../tables/memos/table.js';
import type { MemoDependencies } from './MemoDependencies.js';

export function writeRelations(deps: Pick<MemoDependencies,'db'>, id: string, value: { tags: string[]; links: string[]; attachments: MemoAttachmentDTO[] }): void {
  for (const target of value.links) if (!getMemoRow(deps.db,target)) throw new AppError(400,'INVALID_LINKS','双链目标不存在');
  replaceMemoTags(deps.db,id,value.tags.map((tag) => ensureTag(deps.db,tag)));
  replaceMemoLinks(deps.db,id,value.links);
  replaceMemoAttachments(deps.db,id,value.attachments);
  removeUnusedTags(deps.db);
}

import { AppError } from '../../../system/errors/AppError.js';
import type { MemoAttachmentDTO } from '../../../../shared/contracts/memos/index.js';

export function normalizeMemo(input: { id: string; content: string; tags?: string[]; links?: string[]; attachments: MemoAttachmentDTO[] }): { content: string; tags: string[]; links: string[]; attachments: MemoAttachmentDTO[] } {
  const inferredTags = [...input.content.matchAll(/(?:^|\s)#([^\s#`[\]<>]{1,80})/gu)].map((match) => match[1] ?? '');
  const tags = [...new Set([...(input.tags ?? []),...inferredTags].map((tag) => tag.trim().normalize('NFC').replace(/^#+/, '')).filter(Boolean))].sort();
  const inferredLinks = [...input.content.matchAll(/\[\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]\]/giu)].map((match) => (match[1] ?? '').toLowerCase());
  const links = [...new Set([...(input.links ?? []),...inferredLinks])].sort();
  if (tags.length > 100 || tags.some((tag) => tag.length > 80)) throw new AppError(400,'INVALID_TAGS','标签数量或长度超出限制');
  if (links.length > 100 || links.includes(input.id)) throw new AppError(400,'INVALID_LINKS','双链无效或数量超出限制');
  if (new Set(input.attachments.map((attachment) => attachment.mediaId)).size !== input.attachments.length) throw new AppError(400,'INVALID_ATTACHMENTS','同一附件不能重复关联');
  return { content: input.content, tags, links, attachments: input.attachments.map((attachment) => ({ ...attachment })) };
}

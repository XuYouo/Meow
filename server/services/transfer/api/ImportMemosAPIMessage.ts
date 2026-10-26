import type { z } from 'zod';
import { ImportMemos } from '../../../../shared/contracts/transfer/index.js';
import type { MemoDTO, MemoAttachmentDTO } from '../../../../shared/contracts/memos/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { plan as importMemos } from '../../memos/api/ImportMemosAPIMessage.js';
import { plan as getMedia } from '../../media/api/GetMediaAPIMessage.js';
import { plan as validateMediaReferences } from '../../media/api/ValidateMediaReferencesAPIMessage.js';
import { plan as setMediaReferences } from '../../media/api/SetMediaReferencesAPIMessage.js';
import { findBatch, findSourceBatch, recordBatch } from '../tables/batches/table.js';
import type { TransferDependencies } from '../utils/TransferDependencies.js';
import { readPreview } from '../utils/importPreview.js';
import { digest } from '../utils/package.js';
import { sourceUuid } from '../utils/sourceIdentity.js';

export async function plan(input: z.infer<typeof ImportMemos.input>, dependencies: TransferDependencies) {
  assertOwner(dependencies);
  const inputDigest = digest(Buffer.from(JSON.stringify(input)));
  const receipt = findBatch(dependencies.db, input.operationId);
  if (receipt) {
    if (receipt.kind !== 'memos' || receipt.inputDigest !== inputDigest) throw new AppError(409, 'OPERATION_REUSED', 'This import operation ID was already used for different input.');
    return ImportMemos.output.parse({ ...ImportMemos.output.parse(receipt.output), replayed: true });
  }
  const cached = await readPreview(input.previewId, dependencies);
  const { sourceDigest, sourceId } = cached.preview;
  assertActiveSession(dependencies);
  const completed=findSourceBatch(dependencies.db,'memos',sourceDigest);
  if(completed)return ImportMemos.output.parse({...ImportMemos.output.parse(completed.output),replayed:true});
  const resources = new Map(cached.source.resources.map((resource) => [resource.sourceResourceId, resource]));
  const mapped = new Map<string, { mediaId: string; kind: MemoAttachmentDTO['kind'] }>();
  for (const entry of input.assets) {
    const resource = resources.get(entry.sourceResourceId);
    if (!resource || mapped.has(entry.sourceResourceId)) throw new AppError(400, 'INVALID_IMPORT_MAPPING', 'An attachment mapping is unknown or duplicated.');
    const media = await getMedia({ id: entry.mediaId }, dependencies);
    if (resource.mimeType !== 'application/octet-stream' && media.mimeType !== resource.mimeType) throw new AppError(400, 'IMPORT_ASSET_MISMATCH', 'An attachment MIME type does not match the source metadata.');
    if (resource.size !== null && media.size !== resource.size) throw new AppError(400, 'IMPORT_ASSET_MISMATCH', 'An attachment size does not match the source metadata.');
    mapped.set(entry.sourceResourceId, { mediaId: media.id, kind: media.mimeType.startsWith('image/') ? 'image' : media.mimeType.startsWith('audio/') ? 'audio' : 'file' });
  }
  const missingAssets = cached.preview.missingAssets.filter((asset) => !mapped.has(asset.sourceResourceId));
  if (missingAssets.length > 0 && !input.allowMissingAssets) throw new AppError(400, 'IMPORT_ASSETS_REQUIRED', 'Supply the missing files or explicitly confirm importing without them.');
  const memos: MemoDTO[] = cached.source.memos.map((memo) => ({ id: sourceUuid(`memos:${sourceId}:${memo.sourceId}`), content: memo.content, tags: memo.tags, links: [], backlinks: [], attachments: memo.resourceIds.flatMap((id) => { const asset = mapped.get(id); return asset ? [asset] : []; }), isPublic: memo.isPublic, isPinned: memo.pinned, revision: 1, createdAt: memo.createdAt, updatedAt: memo.updatedAt }));
  return dependencies.unitOfWork.run(() => {
    assertActiveSession(dependencies);
    const previous = findSourceBatch(dependencies.db, 'memos', sourceDigest);
    if (previous) return ImportMemos.output.parse({ ...ImportMemos.output.parse(previous.output), replayed: true });
    validateMediaReferences([...mapped.values()],dependencies);
    const imported = importMemos({ memos, pinOrder: memos.filter((memo) => memo.isPinned).map((memo) => memo.id) }, dependencies);
    for (const memo of memos) setMediaReferences({ resourceType: 'memo', resourceId: memo.id, mediaIds: memo.attachments.map((attachment) => attachment.mediaId), isPublic: memo.isPublic }, dependencies);
    const result = ImportMemos.output.parse({ imported: imported.imported, sourceId, sourceDigest, missingAssets, replayed: false });
    recordBatch(dependencies.db, { batchId: input.operationId, kind: 'memos', sourceDigest, inputDigest, output: result }, dependencies.now());
    return result;
  });
}

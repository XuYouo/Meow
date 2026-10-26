import { readFile, readdir, lstat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../../../system/errors/AppError.js';
import { MemosPreviewSchema } from '../../../../shared/contracts/transfer/index.js';
import type { MemosSource } from '../objects/MemosSource.js';
import type { TransferDependencies } from './TransferDependencies.js';

export const PreviewCacheSchema = z.object({
  preview: MemosPreviewSchema,
  expiresAt: z.string().datetime(),
  source: z.object({ memos: z.array(z.object({ sourceId: z.string(), content: z.string(), tags: z.array(z.string()), pinned: z.boolean(), isPublic: z.boolean(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(), resourceIds: z.array(z.string()) })), resources: z.array(z.object({ sourceResourceId: z.string(), fileName: z.string(), mimeType: z.string(), size: z.number().nullable(), sourceMemoIds: z.array(z.string()) })), archivedExcluded: z.number(), warnings: z.array(z.string()) }),
}).strict();

export async function readPreview(previewId: string, dependencies: TransferDependencies): Promise<{ preview: z.infer<typeof MemosPreviewSchema>; source: MemosSource }> {
  const file = path.join(dependencies.uploadsDir, '.imports', `${previewId}.json`);
  const bytes = await readFile(file).catch(() => { throw new AppError(404, 'IMPORT_PREVIEW_NOT_FOUND', 'Upload the source snapshot to create a new import preview.'); });
  if (bytes.length > 32 * 1024 * 1024) throw new AppError(413, 'MEMOS_IMPORT_LIMIT', 'The cached preview exceeds its limit.');
  const value = PreviewCacheSchema.parse(JSON.parse(bytes.toString('utf8')) as unknown);
  if (value.preview.previewId !== previewId || value.expiresAt <= dependencies.now()) throw new AppError(410, 'IMPORT_PREVIEW_EXPIRED', 'This preview expired. Upload the snapshot again.');
  return value;
}

export async function prunePreviews(directory: string, at: string): Promise<void> {
  let active = 0;
  for (const name of await readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const location = path.join(directory, name);
    const details = await lstat(location);
    if (!details.isFile() || details.isSymbolicLink() || details.size > 32 * 1024 * 1024) continue;
    let decoded: unknown;
    try { decoded = JSON.parse(await readFile(location, 'utf8')) as unknown; } catch { continue; }
    const parsed = PreviewCacheSchema.safeParse(decoded);
    if (!parsed.success || `${parsed.data.preview.previewId}.json` !== name) continue;
    if (parsed.data.expiresAt <= at) await unlink(location);
    else active += 1;
  }
  if (active >= 20) throw new AppError(429, 'IMPORT_PREVIEW_LIMIT', 'At most 20 active previews are retained. Wait for expiry before creating more.');
}

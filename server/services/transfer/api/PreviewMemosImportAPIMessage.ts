import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { MAX_MEMOS_SOURCE_BYTES, MemosPreviewSchema } from '../../../../shared/contracts/transfer/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertActiveSession } from '../../identity/api/AssertActiveSessionAPIMessage.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { readMemosSource } from '../tables/memosSource/reader.js';
import { findSourceBatch } from '../tables/batches/table.js';
import { digest } from '../utils/package.js';
import { readBounded } from '../utils/readBounded.js';
import { prunePreviews } from '../utils/importPreview.js';
import { sourceUuid } from '../utils/sourceIdentity.js';
import type { TransferDependencies } from '../utils/TransferDependencies.js';

export async function plan(input: { fileName: string }, stream: Readable, dependencies: TransferDependencies) {
  assertOwner(dependencies);
  if (/(?:-wal|-shm)$/i.test(input.fileName) || !/\.(?:db|sqlite|sqlite3)$/i.test(input.fileName)) throw new AppError(400, 'UNSUPPORTED_MEMOS_FILE', 'Provide a consistent .db/.sqlite snapshot, not a standalone WAL or SHM file.');
  const bytes = await readBounded(stream, MAX_MEMOS_SOURCE_BYTES);
  if (bytes.subarray(0, 16).toString('binary') !== 'SQLite format 3\0') throw new AppError(400, 'UNSUPPORTED_MEMOS_FILE', 'The input is not a complete SQLite database snapshot.');
  if (bytes[18] !== 1 || bytes[19] !== 1) throw new AppError(400, 'MEMOS_REQUIRES_SNAPSHOT', 'A WAL-mode database file alone cannot prove a consistent snapshot. Export it with SQLite backup or VACUUM INTO first.');
  const sourceDigest = digest(bytes);
  const sourceId = sourceUuid(`memos-source:${sourceDigest}`);
  const previewId = randomUUID();
  const directory = path.join(dependencies.uploadsDir, '.imports');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await prunePreviews(directory, dependencies.now());
  const temporary = path.join(directory, `${previewId}.sqlite`);
  await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
  try {
    const source = readMemosSource(temporary);
    assertActiveSession(dependencies);
    const preview = MemosPreviewSchema.parse({ previewId, sourceDigest, sourceId, supportedFormat: 'memos-memo-created_ts-v1', memoCount: source.memos.length, pinnedCount: source.memos.filter((memo) => memo.pinned).length, publicCount: source.memos.filter((memo) => memo.isPublic).length, archivedExcluded: source.archivedExcluded, alreadyImported: Boolean(findSourceBatch(dependencies.db, 'memos', sourceDigest)), missingAssets: source.resources.map(({ sourceResourceId, fileName, mimeType, sourceMemoIds }) => ({ sourceResourceId, fileName, mimeType, sourceMemoIds })), warnings: source.warnings });
    const expiresAt = new Date(Date.parse(dependencies.now()) + 60 * 60_000).toISOString();
    const cache = JSON.stringify({ preview, source, expiresAt });
    if (Buffer.byteLength(cache) > 32 * 1024 * 1024) throw new AppError(413, 'MEMOS_IMPORT_LIMIT', 'The normalized import preview exceeds 32MB.');
    await writeFile(path.join(directory, `${previewId}.json`), cache, { flag: 'wx', mode: 0o600 });
    return preview;
  } finally { await unlink(temporary).catch(() => undefined); }
}

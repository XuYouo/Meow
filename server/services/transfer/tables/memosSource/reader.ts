import Database from 'better-sqlite3';
import { z } from 'zod';
import { AppError } from '../../../../system/errors/AppError.js';
import { UploadMediaInputSchema } from '../../../../../shared/contracts/media/index.js';
import type { MemosSource, SourceMemo, SourceResource } from '../../objects/MemosSource.js';

const id = z.union([z.string().min(1).max(200), z.number().int().safe()]).transform(String);
const seconds = z.number().int().min(0).max(253402300799);
const rowSchema = z.object({ id, content: z.string().trim().min(1).max(200_000), created_ts: seconds, updated_ts: seconds.nullish(), pinned: z.union([z.literal(0), z.literal(1)]).nullish(), visibility: z.enum(['PUBLIC', 'PRIVATE', 'PROTECTED']).nullish(), payload: z.string().max(1024 * 1024).nullish() });
function columns(db: Database.Database, table: 'memo' | 'resource' | 'memo_resource'): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((column) => column.name));
}
function tableExists(db: Database.Database, name: string): boolean { return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined; }
function requireColumns(actual: Set<string>, expected: readonly string[]): void {
  if (expected.some((column) => !actual.has(column))) throw new AppError(400, 'UNSUPPORTED_MEMOS_SCHEMA', 'Supported Memos snapshots require memo(id, content, created_ts); optional fields are documented.');
}
function tags(content: string, payload: string | null | undefined): string[] {
  let explicit: string[] = [];
  if (payload) {
    let decoded: unknown;
    try { decoded = JSON.parse(payload) as unknown; } catch { throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'A Memos payload is not valid JSON.'); }
    if (typeof decoded === 'object' && decoded !== null && 'tags' in decoded) explicit = z.array(z.string().trim().min(1).max(80)).max(100).parse(decoded.tags);
  }
  const found = [...content.matchAll(/(?:^|\s)#([^\s#]+)/gu)].map((match) => match[1] || '').filter((tag) => tag.length > 0 && tag.length <= 80);
  const result = [...new Set([...explicit, ...found])];
  if (result.length > 100) throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'A source memo exceeds the 100-tag limit.');
  return result;
}

/** The source is an uploaded consistent SQLite snapshot, opened read-only and never migrated. */
export function readMemosSource(file: string): MemosSource {
  let db: Database.Database | undefined;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    db.pragma('query_only = ON');
    db.pragma('trusted_schema = OFF');
    const check = db.pragma('quick_check(1)', { simple: true });
    if (check !== 'ok') throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'The SQLite integrity check failed.');
    if (!tableExists(db, 'memo')) throw new AppError(400, 'UNSUPPORTED_MEMOS_SCHEMA', 'This is not a supported external Memos memo-table snapshot.');
    const available = columns(db, 'memo');
    requireColumns(available, ['id', 'content', 'created_ts']);
    const allCount = (db.prepare('SELECT COUNT(*) AS count FROM memo').get() as { count: number }).count;
    const filter = available.has('row_status') ? "WHERE row_status = 'NORMAL'" : '';
    const selected = ['id', 'content', 'created_ts', 'updated_ts', 'pinned', 'visibility', 'payload'].filter((column) => available.has(column));
    const active = (db.prepare(`SELECT COUNT(*) AS count FROM memo ${filter}`).get() as { count: number }).count;
    if (active > 5000) throw new AppError(413, 'MEMOS_IMPORT_LIMIT', 'Memos import supports at most 5000 active notes per snapshot.');
    const rows = db.prepare(`SELECT ${selected.join(', ')} FROM memo ${filter} ORDER BY created_ts, id LIMIT 5001`).all();
    const memos: SourceMemo[] = rows.map((row) => {
      const value = rowSchema.parse(row);
      if ((value.updated_ts ?? value.created_ts) < value.created_ts) throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'A source update timestamp predates its creation.');
      return { sourceId: value.id, content: value.content, tags: tags(value.content, value.payload), pinned: value.pinned === 1, isPublic: value.visibility === 'PUBLIC', createdAt: new Date(value.created_ts * 1000).toISOString(), updatedAt: new Date((value.updated_ts ?? value.created_ts) * 1000).toISOString(), resourceIds: [] };
    });
    if (new Set(memos.map((memo) => memo.sourceId)).size !== memos.length) throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'Duplicate source memo identifiers.');
    const byMemo = new Map(memos.map((memo) => [memo.sourceId, memo]));
    const resources = new Map<string, SourceResource>();
    const warnings = ['Only active memo rows and declared fields are imported. Unknown fields remain outside the import scope.', 'The source snapshot SHA-256 identifies a batch. A changed SQLite snapshot is a different source batch.', 'Attachment bytes are not inferred from paths, external links, or SQLite blobs; supply the listed files explicitly.'];
    if (tableExists(db, 'memo_resource')) {
      if (!tableExists(db, 'resource')) throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'Source attachment relations have no resource table.');
      requireColumns(columns(db, 'memo_resource'), ['memo_id', 'resource_id']);
      const resourceColumns = columns(db, 'resource');
      requireColumns(resourceColumns, ['id']);
      const declared = ['id', 'filename', 'type', 'size'].filter((column) => resourceColumns.has(column));
      const resourceRows = db.prepare(`SELECT ${declared.join(', ')} FROM resource LIMIT 5001`).all();
      if (resourceRows.length > 5000) throw new AppError(413, 'MEMOS_IMPORT_LIMIT', 'The source attachment count exceeds 5000.');
      const resourceById = new Map(resourceRows.map((row) => {
        const value = z.object({ id, filename: z.string().max(4000).nullish(), type: z.string().max(100).nullish(), size: z.number().int().nonnegative().nullish() }).parse(row);
        return [value.id, value] as const;
      }));
      const relationships = db.prepare('SELECT memo_id, resource_id FROM memo_resource LIMIT 100001').all();
      if (relationships.length > 100_000) throw new AppError(413, 'MEMOS_IMPORT_LIMIT', 'The source attachment-reference count exceeds its import limit.');
      for (const row of relationships) {
        const relationship = z.object({ memo_id: id, resource_id: id }).parse(row);
        const memo = byMemo.get(relationship.memo_id);
        if (!memo) continue;
        const resource = resourceById.get(relationship.resource_id);
        if (!resource) throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'A source memo references missing attachment metadata.');
        const fileName = (resource.filename?.split(/[\\/]/).pop() || `resource-${resource.id}`).slice(0, 240);
        const mime = UploadMediaInputSchema.shape.mimeType.safeParse(resource.type);
        const existing = resources.get(resource.id) ?? { sourceResourceId: resource.id, fileName, mimeType: mime.success ? mime.data : 'application/octet-stream', size: resource.size && resource.size > 0 ? resource.size : null, sourceMemoIds: [] };
        if (!existing.sourceMemoIds.includes(memo.sourceId)) existing.sourceMemoIds.push(memo.sourceId);
        resources.set(resource.id, existing);
        if (!memo.resourceIds.includes(resource.id)) memo.resourceIds.push(resource.id);
        if (memo.resourceIds.length > 100) throw new AppError(413, 'MEMOS_IMPORT_LIMIT', 'A source memo exceeds 100 attachments.');
      }
    }
    if (!available.has('visibility')) warnings.push('The source has no visibility column; imported notes are private.');
    return { memos, resources: [...resources.values()], archivedExcluded: allCount - active, warnings };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'INVALID_MEMOS_SOURCE', 'The SQLite snapshot or declared Memos fields could not be validated.');
  } finally { db?.close(); }
}

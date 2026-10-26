import type Database from 'better-sqlite3';
import type { MemoAttachmentDTO } from '../../../../../shared/contracts/memos/index.js';

export function initializeMemoAttachmentsTable(db: Database.Database): void {
  db.exec("CREATE TABLE memo_attachments (memo_id TEXT NOT NULL REFERENCES memos(id) ON DELETE CASCADE, media_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('image','audio','file')), position INTEGER NOT NULL, PRIMARY KEY(memo_id,media_id))");
}
export function replaceMemoAttachments(db: Database.Database, id: string, attachments: MemoAttachmentDTO[]): void {
  db.prepare('DELETE FROM memo_attachments WHERE memo_id=?').run(id);
  const insert = db.prepare('INSERT INTO memo_attachments(memo_id,media_id,kind,position) VALUES (?,?,?,?)');
  attachments.forEach((attachment, position) => insert.run(id,attachment.mediaId,attachment.kind,position));
}
export function readMemoAttachments(db: Database.Database, id: string): MemoAttachmentDTO[] {
  return (db.prepare('SELECT media_id,kind FROM memo_attachments WHERE memo_id=? ORDER BY position').all(id) as { media_id: string; kind: MemoAttachmentDTO['kind'] }[]).map((row) => ({ mediaId: row.media_id, kind: row.kind }));
}

import type { Migration } from '../../../system/database/Migration.js';
import { initializeMemosTable } from './memos/table.js';
import { initializeTagsTable } from './tags/table.js';
import { initializeMemoTagsTable } from './memoTags/table.js';
import { initializeMemoLinksTable } from './memoLinks/table.js';
import { initializeMemoPinsTable } from './memoPins/table.js';
import { initializeMemoAttachmentsTable } from './memoAttachments/table.js';
import { initializeTombstonesTable } from './tombstones/table.js';
import { initializeOperationsTable } from './operations/table.js';
import { initializeRevisionsTable } from './revisions/table.js';

export const memosMigrations: Migration[] = [{ id: '020-memos', up(db) {
  initializeMemosTable(db);
  initializeTagsTable(db);
  initializeMemoTagsTable(db);
  initializeMemoLinksTable(db);
  initializeMemoPinsTable(db);
  initializeMemoAttachmentsTable(db);
  initializeTombstonesTable(db);
  initializeOperationsTable(db);
  initializeRevisionsTable(db);
} }];

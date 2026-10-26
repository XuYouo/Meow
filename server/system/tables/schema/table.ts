import type Database from 'better-sqlite3';
import { z } from 'zod';

export const APPLICATION_ID = 0x4d454f57;
export const FORMAT_VERSION = 1;

export interface SchemaMetadata {
  readonly instanceId: string;
  readonly formatVersion: number;
}
const SchemaMetadataRow = z.object({ instance_id: z.string().uuid(), format_version: z.number().int().positive() }).strict();

export function readSchemaMetadata(db: Database.Database): SchemaMetadata | undefined {
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meow_schema'").get();
  if (!table) return undefined;
  const row = db.prepare('SELECT instance_id, format_version FROM meow_schema WHERE singleton = 1').get() as
    | { instance_id: string; format_version: number }
    | undefined;
  if (!row) return undefined;
  const value = SchemaMetadataRow.parse(row);
  return { instanceId: value.instance_id, formatVersion: value.format_version };
}

export function initializeSchema(db: Database.Database, instanceId: string): void {
  db.exec(`
    CREATE TABLE meow_schema (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      instance_id TEXT NOT NULL UNIQUE,
      format_version INTEGER NOT NULL CHECK (format_version >= 1)
    );
    CREATE TABLE meow_migrations (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_id TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);
  db.prepare('INSERT INTO meow_schema (singleton, instance_id, format_version) VALUES (1, ?, ?)')
    .run(instanceId, FORMAT_VERSION);
  db.pragma(`application_id = ${APPLICATION_ID}`);
}

export function readAppliedMigrations(db: Database.Database): string[] {
  return (db.prepare('SELECT migration_id FROM meow_migrations ORDER BY sequence').all() as { migration_id: string }[])
    .map((row) => row.migration_id);
}

export function recordMigration(db: Database.Database, id: string, at: string): void {
  db.prepare('INSERT INTO meow_migrations (migration_id, applied_at) VALUES (?, ?)').run(id, at);
}

export function listApplicationTables(db: Database.Database): string[] {
  return (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[]).map((row) => row.name);
}

export function checkDatabaseReady(db: Database.Database): void {
  db.prepare('SELECT 1').get();
}

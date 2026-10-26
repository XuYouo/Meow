import { closeSync, existsSync, mkdirSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { APPLICATION_ID, FORMAT_VERSION, initializeSchema, listApplicationTables, readAppliedMigrations, readSchemaMetadata, recordMigration } from '../tables/schema/table.js';
import type { Migration } from './Migration.js';
import { createUnitOfWork } from './UnitOfWork.js';

const DATABASE_FILE = 'meow-v2.sqlite';

function inspectExistingDatabase(filePath: string, migrationIds: readonly string[]): boolean {
  if (!existsSync(filePath) || statSync(filePath).size === 0) return true;
  // Reject foreign files from their header before SQLite can create WAL/SHM sidecars.
  const header = Buffer.alloc(100);
  const descriptor = openSync(filePath, 'r');
  try {
    readSync(descriptor, header, 0, 100, 0);
  } finally {
    closeSync(descriptor);
  }
  if (header.length < 100 || header.subarray(0, 16).toString('binary') !== 'SQLite format 3\0' || header.readUInt32BE(68) !== APPLICATION_ID) {
    throw new Error('Unsupported or foreign database. Use a separate empty MEOW_DATA_DIR.');
  }
  let probe: Database.Database | undefined;
  try {
    probe = new Database(filePath, { readonly: true, fileMustExist: true });
    const applicationId = probe.pragma('application_id', { simple: true });
    const tables = listApplicationTables(probe);
    if (tables.length === 0) throw new Error('Unsupported application database without metadata.');
    const metadata = readSchemaMetadata(probe);
    if (applicationId !== APPLICATION_ID || !metadata || metadata.formatVersion !== FORMAT_VERSION) {
      throw new Error('Unsupported or foreign database. Use a separate empty MEOW_DATA_DIR.');
    }
    const applied = readAppliedMigrations(probe);
    if (applied.some((id, index) => migrationIds[index] !== id)) {
      throw new Error('Database migration history is unsupported or newer than this application.');
    }
    return false;
  } catch (error) {
    if (error instanceof Error && /Unsupported|migration history/.test(error.message)) throw error;
    throw new Error('Cannot safely recognize this database. No changes were made.', { cause: error });
  } finally {
    probe?.close();
  }
}

export function openDatabase(dataDir: string, migrations: readonly Migration[], now: () => string = () => new Date().toISOString()) {
  const databasePath = path.join(dataDir, DATABASE_FILE);
  const migrationIds = migrations.map((migration) => migration.id);
  if (new Set(migrationIds).size !== migrationIds.length || migrationIds.some((id) => !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(id))) {
    throw new Error('Migration identifiers must be unique and stable.');
  }
  if (!existsSync(databasePath) && existsSync(dataDir) && readdirSync(dataDir).length > 0) {
    throw new Error('MEOW_DATA_DIR is not an empty or recognized application directory.');
  }
  const fresh = inspectExistingDatabase(databasePath, migrationIds);
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new Database(databasePath);
  try {
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
    const unitOfWork = createUnitOfWork(db);
    unitOfWork.run(() => {
      if (fresh) initializeSchema(db, randomUUID());
      const applied = readAppliedMigrations(db);
      for (const migration of migrations.slice(applied.length)) {
        migration.up(db);
        recordMigration(db, migration.id, now());
      }
    });
    // Change journaling only after a recognized schema has passed its migrations.
    db.pragma('journal_mode = WAL');
    const metadata = readSchemaMetadata(db);
    if (!metadata) throw new Error('Application schema initialization failed.');
    const uploadsDir = path.join(dataDir, 'uploads');
    mkdirSync(uploadsDir, { recursive: true, mode: 0o700 });
    return { db, unitOfWork, databasePath, uploadsDir, instanceId: metadata.instanceId };
  } catch (error) {
    db.close();
    throw error;
  }
}

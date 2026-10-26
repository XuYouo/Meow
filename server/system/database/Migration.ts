import type Database from 'better-sqlite3';

/** SQL and row mapping belong to the table module supplying the migration. */
export interface Migration {
  readonly id: string;
  readonly up: (db: Database.Database) => void;
}

import type Database from 'better-sqlite3';

export interface UnitOfWork {
  run<T>(operation: () => T): T;
}

export function createUnitOfWork(db: Database.Database): UnitOfWork {
  return {
    run<T>(operation: () => T): T {
      const transaction = db.transaction(() => {
        const result = operation();
        if (result instanceof Promise) {
          throw new Error('A SQLite unit of work must be synchronous.');
        }
        return result;
      });
      return transaction.immediate();
    },
  };
}

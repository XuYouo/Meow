import { randomUUID } from 'node:crypto';
import { AppError } from '../../../system/errors/AppError.js';
import { acquireLease, releaseLease, renewLease } from '../tables/batches/table.js';
import type { TransferDependencies } from './TransferDependencies.js';

const LEASE_MS = 5 * 60_000;
const expiry = (at: string) => new Date(Date.parse(at) + LEASE_MS).toISOString();

export function startLease(dependencies: TransferDependencies): string {
  const id = randomUUID();
  const at = dependencies.now();
  dependencies.unitOfWork.run(() => {
    if (!acquireLease(dependencies.db, id, at, expiry(at))) throw new AppError(409, 'TRANSFER_BUSY', 'Another restore is running. Interrupted restores can be retried after five minutes.');
  });
  return id;
}
export function keepLease(dependencies: TransferDependencies, id: string): void {
  const at = dependencies.now();
  dependencies.unitOfWork.run(() => {
    if (!renewLease(dependencies.db, id, at, expiry(at))) throw new AppError(409, 'TRANSFER_LEASE_LOST', 'This restore no longer owns its work lease. Retry the backup.');
  });
}
export function finishLease(dependencies: TransferDependencies, id: string): void {
  dependencies.unitOfWork.run(() => releaseLease(dependencies.db, id));
}

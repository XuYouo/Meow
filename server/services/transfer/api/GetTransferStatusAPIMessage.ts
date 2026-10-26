import { MAX_BACKUP_BYTES, MAX_MEMOS_SOURCE_BYTES } from '../../../../shared/contracts/transfer/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import type { TransferDependencies } from '../utils/TransferDependencies.js';
import { empty, snapshot } from '../utils/snapshot.js';

export function plan(dependencies: TransferDependencies) {
  assertOwner(dependencies);
  return { empty: empty(snapshot(dependencies.db)), backupMaxBytes: MAX_BACKUP_BYTES, memosSourceMaxBytes: MAX_MEMOS_SOURCE_BYTES };
}

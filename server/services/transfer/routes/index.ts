import type { ApplicationRuntime } from '../../../app.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { ExportBackup, RestoreBackup, TransferStatus, PreviewMemosImport, ImportMemos } from '../../../../shared/contracts/transfer/index.js';
import { plan as exportBackup } from '../api/ExportBackupAPIMessage.js';
import { plan as restoreBackup } from '../api/RestoreBackupAPIMessage.js';
import { plan as transferStatus } from '../api/GetTransferStatusAPIMessage.js';
import { plan as previewMemos } from '../api/PreviewMemosImportAPIMessage.js';
import { plan as importMemos } from '../api/ImportMemosAPIMessage.js';
import type { TransferDependencies } from '../utils/TransferDependencies.js';

export function registerTransferRoutes(registry: RouteRegistry, runtime: ApplicationRuntime, options: Pick<TransferDependencies, 'fault'> = {}): void {
  registry.register({ contract: TransferStatus, access: 'owner', handler: (_input, { principal }) => transferStatus({ ...runtime, ...options, principal }) });
  registry.register({ contract: ExportBackup, access: 'owner', transactional: false, handler: async (_input, { principal, response }) => {
    const { bytes, backupId } = await exportBackup({ ...runtime, ...options, principal });
    response.setHeader('Content-Type', 'application/octet-stream');
    response.setHeader('Content-Disposition', `attachment; filename="meow-${backupId}.meow-backup.json"`);
    response.setHeader('Content-Length', bytes.length);
    response.end(bytes);
    return null;
  } });
  registry.register({ contract: RestoreBackup, access: 'owner', transactional: false, handler: (_input, { principal, request }) => restoreBackup(request, { ...runtime, ...options, principal }) });
  registry.register({ contract: PreviewMemosImport, access: 'owner', transactional: false, handler: (input, { principal, request }) => previewMemos(input, request, { ...runtime, ...options, principal }) });
  registry.register({ contract: ImportMemos, access: 'owner', transactional: false, handler: (input, { principal }) => importMemos(input, { ...runtime, ...options, principal }) });
}

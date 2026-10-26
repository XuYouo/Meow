import { ExportBackup } from '../../../shared/contracts/transfer';
import { ErrorResponseSchema } from '../../../shared/contracts/api';
import { ApiError } from '../../system/api/sendAPI';
import { notifySessionExpired } from '../../system/api/sessionEvents';

export async function ExportBackupAPI(signal?: AbortSignal): Promise<Blob> {
  const response = await fetch(ExportBackup.path, { credentials: 'same-origin', headers: { Accept: 'application/octet-stream' }, signal });
  if (response.status === 401) notifySessionExpired();
  if (!response.ok) {
    const parsed = ErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(response.status, parsed.success ? parsed.data.error.code : 'BACKUP_FAILED', parsed.success ? parsed.data.error.message : '备份导出失败。');
  }
  return response.blob();
}

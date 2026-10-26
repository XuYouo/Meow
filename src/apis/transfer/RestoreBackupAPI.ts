import { RestoreBackup } from '../../../shared/contracts/transfer';
import { sendBinaryAPI } from '../../system/api/sendBinaryAPI';

export function RestoreBackupAPI(file: File, signal?: AbortSignal) {
  return sendBinaryAPI(RestoreBackup, {}, file, signal);
}

import { PreviewMemosImport } from '../../../shared/contracts/transfer';
import { sendBinaryAPI } from '../../system/api/sendBinaryAPI';

export function PreviewMemosImportAPI(file: File, signal?: AbortSignal) {
  return sendBinaryAPI(PreviewMemosImport, { fileName: file.name }, file, signal);
}

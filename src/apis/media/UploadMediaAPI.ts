import { UploadMedia } from '../../../shared/contracts/media';
import { sendBinaryAPI } from '../../system/api/sendBinaryAPI';

export function UploadMediaAPI(file: File, signal?: AbortSignal, identity?: { id: string; operationId: string }) {
  return sendBinaryAPI(UploadMedia, UploadMedia.input.parse({
    id: identity?.id ?? crypto.randomUUID(), operationId: identity?.operationId ?? crypto.randomUUID(), fileName: file.name,
    mimeType: file.type.split(';')[0] || 'application/octet-stream',
  }), file, signal);
}

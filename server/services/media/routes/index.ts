import type { ApplicationRuntime } from '../../../app.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { DeleteUnusedMedia, GetMedia, ReadMedia, UploadMedia } from '../../../../shared/contracts/media/index.js';
import { plan as upload, MAX_UPLOAD_BYTES } from '../api/UploadMediaAPIMessage.js';
import { plan as get } from '../api/GetMediaAPIMessage.js';
import { plan as read } from '../api/ReadMediaAPIMessage.js';
import { plan as remove } from '../api/DeleteUnusedMediaAPIMessage.js';
import { AppError } from '../../../system/errors/AppError.js';

export function registerMediaRoutes(registry: RouteRegistry, runtime: ApplicationRuntime): void {
  registry.register({ contract: UploadMedia, access: 'owner', transactional: false, handler(input, context) {
    if (!context.request.is('application/octet-stream')) throw new AppError(400, 'INVALID_MEDIA_TYPE', '上传需要二进制请求体。');
    if (Number(context.request.get('content-length')) > MAX_UPLOAD_BYTES) {
      context.request.resume();
      throw new AppError(413, 'PAYLOAD_TOO_LARGE', '附件最大为25MB。');
    }
    context.request.setTimeout(30_000);
    return upload(input, context.request, { ...runtime, principal: context.principal });
  } });
  registry.register({ contract: GetMedia, access: 'public', transactional: false, handler: (input, context) => get(input, { ...runtime, principal: context.principal }) });
  registry.register({ contract: ReadMedia, access: 'public', transactional: false, handler: (input, context) => read(input, context.request.get('range'), context.response, { ...runtime, principal: context.principal }) });
  registry.register({ contract: DeleteUnusedMedia, access: 'owner', transactional: false, handler: (input, context) => remove(input, { ...runtime, principal: context.principal }) });
}

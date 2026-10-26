import { DeleteUnusedMedia } from '../../../shared/contracts/media';
import { sendAPI } from '../../system/api/sendAPI';

export const DeleteUnusedMediaAPI=(id: string,signal?: AbortSignal) => sendAPI(DeleteUnusedMedia,{ id },signal);

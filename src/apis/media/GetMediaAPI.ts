import { GetMedia } from '../../../shared/contracts/media';
import { sendAPI } from '../../system/api/sendAPI';

export const GetMediaAPI = (id: string, signal?: AbortSignal) => sendAPI(GetMedia, { id }, signal);

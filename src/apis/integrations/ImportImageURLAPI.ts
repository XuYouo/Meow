import { ImportImageURL } from '../../../shared/contracts/integrations/index';
import { sendAPI } from '../../system/api/sendAPI';

export const ImportImageURLAPI = (input: { id: string; operationId: string; url: string }, signal?: AbortSignal) => sendAPI(ImportImageURL, input, signal);

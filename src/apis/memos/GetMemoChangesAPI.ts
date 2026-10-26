import { GetMemoChanges } from '../../../shared/contracts/memos';
import { sendAPI } from '../../system/api/sendAPI';

export const GetMemoChangesAPI = (since: number, signal?: AbortSignal) => sendAPI(GetMemoChanges, { since, limit: 100 }, signal);

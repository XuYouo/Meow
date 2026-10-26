import { GetMemo } from '../../../shared/contracts/memos';
import { sendAPI } from '../../system/api/sendAPI';

export const GetMemoAPI = (id: string, signal?: AbortSignal) => sendAPI(GetMemo, { id }, signal);

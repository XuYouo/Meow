import { sessionContract } from '../../../shared/contracts/identity';
import { sendAPI } from '../../system/api/sendAPI';

export const GetSessionAPI = (signal?: AbortSignal) => sendAPI(sessionContract, {}, signal);

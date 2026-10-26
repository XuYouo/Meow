import { logoutContract } from '../../../shared/contracts/identity';
import { sendAPI } from '../../system/api/sendAPI';

export const LogoutAPI = (signal?: AbortSignal) => sendAPI(logoutContract, {}, signal);

import { loginContract } from '../../../shared/contracts/identity';
import { sendAPI } from '../../system/api/sendAPI';

export const LoginAPI = (password: string, signal?: AbortSignal) => sendAPI(loginContract, { password }, signal);

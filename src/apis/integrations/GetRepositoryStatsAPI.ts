import { GetRepositoryStats } from '../../../shared/contracts/integrations';
import { sendAPI } from '../../system/api/sendAPI';

export const GetRepositoryStatsAPI = (signal?: AbortSignal) => sendAPI(GetRepositoryStats, {}, signal);

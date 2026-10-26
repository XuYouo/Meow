import type { z } from 'zod';

import { GetIntegrationStatus } from '../../../shared/contracts/integrations';
import { sendAPI } from '../../system/api/sendAPI';

export const GetIntegrationStatusAPI = (input: z.input<typeof GetIntegrationStatus.input>, signal?: AbortSignal) => sendAPI(GetIntegrationStatus, input, signal);

import type { z } from 'zod';

import { GetHitokoto } from '../../../shared/contracts/integrations';
import { sendAPI } from '../../system/api/sendAPI';

export const GetHitokotoAPI = (input: z.input<typeof GetHitokoto.input>, signal?: AbortSignal) => sendAPI(GetHitokoto, input, signal);

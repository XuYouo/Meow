import type { z } from 'zod';

import { FetchBackground } from '../../../shared/contracts/integrations';
import { sendAPI } from '../../system/api/sendAPI';

export const FetchBackgroundAPI = (input: z.input<typeof FetchBackground.input>, signal?: AbortSignal) => sendAPI(FetchBackground, input, signal);

import type { z } from 'zod';

import { GetPreferences } from '../../../shared/contracts/preferences';
import { sendAPI } from '../../system/api/sendAPI';

export const GetPreferencesAPI = (input: z.input<typeof GetPreferences.input>, signal?: AbortSignal) => sendAPI(GetPreferences, input, signal);

import type { z } from 'zod';

import { GetPublicPreferences } from '../../../shared/contracts/preferences';
import { sendAPI } from '../../system/api/sendAPI';

export const GetPublicPreferencesAPI = (input: z.input<typeof GetPublicPreferences.input>, signal?: AbortSignal) => sendAPI(GetPublicPreferences, input, signal);

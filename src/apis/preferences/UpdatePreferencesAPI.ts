import type { z } from 'zod';

import { UpdatePreferences } from '../../../shared/contracts/preferences';
import { sendAPI } from '../../system/api/sendAPI';

export const UpdatePreferencesAPI = (input: z.input<typeof UpdatePreferences.input>, signal?: AbortSignal) => sendAPI(UpdatePreferences, input, signal);

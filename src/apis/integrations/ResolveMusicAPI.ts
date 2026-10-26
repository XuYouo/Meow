import type { z } from 'zod';

import { ResolveMusic } from '../../../shared/contracts/integrations';
import { sendAPI } from '../../system/api/sendAPI';

export const ResolveMusicAPI = (input: z.input<typeof ResolveMusic.input>, signal?: AbortSignal) => sendAPI(ResolveMusic, input, signal);

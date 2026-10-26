import type { z } from 'zod';

import { CreateTrack } from '../../../shared/contracts/music';
import { sendAPI } from '../../system/api/sendAPI';

export const CreateTrackAPI = (input: z.input<typeof CreateTrack.input>, signal?: AbortSignal) => sendAPI(CreateTrack, input, signal);

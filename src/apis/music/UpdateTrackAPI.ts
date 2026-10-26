import type { z } from 'zod';

import { UpdateTrack } from '../../../shared/contracts/music';
import { sendAPI } from '../../system/api/sendAPI';

export const UpdateTrackAPI = (input: z.input<typeof UpdateTrack.input>, signal?: AbortSignal) => sendAPI(UpdateTrack, input, signal);

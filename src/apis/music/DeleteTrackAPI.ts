import type { z } from 'zod';

import { DeleteTrack } from '../../../shared/contracts/music';
import { sendAPI } from '../../system/api/sendAPI';

export const DeleteTrackAPI = (input: z.input<typeof DeleteTrack.input>, signal?: AbortSignal) => sendAPI(DeleteTrack, input, signal);

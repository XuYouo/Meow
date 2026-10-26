import type { z } from 'zod';

import { ReorderTracks } from '../../../shared/contracts/music';
import { sendAPI } from '../../system/api/sendAPI';

export const ReorderTracksAPI = (input: z.input<typeof ReorderTracks.input>, signal?: AbortSignal) => sendAPI(ReorderTracks, input, signal);

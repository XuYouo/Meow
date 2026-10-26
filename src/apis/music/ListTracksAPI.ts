import type { z } from 'zod';

import { ListTracks } from '../../../shared/contracts/music';
import { sendAPI } from '../../system/api/sendAPI';

export const ListTracksAPI = (input: z.input<typeof ListTracks.input>, signal?: AbortSignal) => sendAPI(ListTracks, input, signal);

import type { z } from 'zod';

import { SearchMusic } from '../../../shared/contracts/integrations';
import { sendAPI } from '../../system/api/sendAPI';

export const SearchMusicAPI = (input: z.input<typeof SearchMusic.input>, signal?: AbortSignal) => sendAPI(SearchMusic, input, signal);

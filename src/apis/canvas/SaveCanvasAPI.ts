import type { z } from 'zod';
import { SaveCanvas } from '../../../shared/contracts/canvas';
import { sendAPI } from '../../system/api/sendAPI';

export const SaveCanvasAPI = (input: z.input<typeof SaveCanvas.input>,signal?: AbortSignal) => sendAPI(SaveCanvas,input,signal);

import { GetCanvas } from '../../../shared/contracts/canvas';
import { sendAPI } from '../../system/api/sendAPI';

export const GetCanvasAPI = (signal?: AbortSignal) => sendAPI(GetCanvas,{},signal);

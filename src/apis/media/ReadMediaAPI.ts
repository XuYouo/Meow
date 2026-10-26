import { ReadMedia } from '../../../shared/contracts/media';
import { resourceURL } from '../../system/api/resourceURL';

/** Native img/audio/download elements perform the authenticated content request. */
export const ReadMediaAPI=(id: string): string => resourceURL(ReadMedia,{ id });

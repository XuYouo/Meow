import type { MediaDTO } from '../../../../shared/contracts/media/index.js';

export interface Media extends MediaDTO {
  readonly operationId: string;
  readonly state: 'ready' | 'deleting';
}

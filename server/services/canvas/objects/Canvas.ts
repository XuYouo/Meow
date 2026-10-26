import type { CanvasDocument } from '../../../../shared/contracts/canvas/index.js';

export interface Canvas {
  revision: number;
  updatedAt: string | null;
  document: CanvasDocument;
}

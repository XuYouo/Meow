import type { DrawingTool } from '../functions/geometry';

export type CanvasTool='select'|DrawingTool|'eraser'|'image';
export type CanvasLayerAction='to-front'|'up'|'down'|'to-back';

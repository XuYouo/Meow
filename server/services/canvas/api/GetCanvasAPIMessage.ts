import type { Canvas } from '../objects/Canvas.js';
import { readCanvas } from '../tables/canvases/table.js';
import { plan as requireOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import type { CanvasDependencies } from '../utils/CanvasDependencies.js';

export function plan(deps: CanvasDependencies): Canvas {
  requireOwner({ principal: deps.principal });
  return readCanvas(deps.db) ?? { revision: 0,updatedAt: null,document: { schemaVersion: 1,viewport: { x: 0,y: 0,scale: 1 },memoPositions: [],shapes: [] } };
}

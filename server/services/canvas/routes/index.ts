import type Database from 'better-sqlite3';
import { GetCanvas, SaveCanvas } from '../../../../shared/contracts/canvas/index.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { plan as getCanvas } from '../api/GetCanvasAPIMessage.js';
import { plan as saveCanvas } from '../api/SaveCanvasAPIMessage.js';
import type { CanvasDependencies } from '../utils/CanvasDependencies.js';

export function registerCanvasRoutes(registry: RouteRegistry, runtime: { db: Database.Database;now: () => string }, hooks: Pick<CanvasDependencies,'onCanvasChanged'> = {}): void {
  registry.register({ contract: GetCanvas,access: 'owner',handler: (_input,{ principal }) => getCanvas({ ...runtime,...hooks,principal }) });
  registry.register({ contract: SaveCanvas,access: 'owner',handler: (input,{ principal }) => saveCanvas(input,{ ...runtime,...hooks,principal }) });
}

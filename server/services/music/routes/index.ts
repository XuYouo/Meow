import type { ApplicationRuntime } from '../../../app.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { ListTracks, CreateTrack, UpdateTrack, DeleteTrack, ReorderTracks } from '../../../../shared/contracts/music/index.js';
import type { MusicDependencies } from '../utils/MusicDependencies.js';
import { plan as listTracks } from '../api/ListTracksAPIMessage.js';
import { plan as createTrack } from '../api/CreateTrackAPIMessage.js';
import { plan as updateTrack } from '../api/UpdateTrackAPIMessage.js';
import { plan as deleteTrack } from '../api/DeleteTrackAPIMessage.js';
import { plan as reorderTracks } from '../api/ReorderTracksAPIMessage.js';

export function registerMusicRoutes(registry: RouteRegistry, runtime: ApplicationRuntime, hooks: Pick<MusicDependencies, 'onChanged'> = {}): void {
  registry.register({ contract: ListTracks, access: 'owner', handler: (input, { principal }) => listTracks(input, { ...runtime, ...hooks, principal }) });
  registry.register({ contract: CreateTrack, access: 'owner', handler: (input, { principal }) => createTrack(input, { ...runtime, ...hooks, principal }) });
  registry.register({ contract: UpdateTrack, access: 'owner', handler: (input, { principal }) => updateTrack(input, { ...runtime, ...hooks, principal }) });
  registry.register({ contract: DeleteTrack, access: 'owner', handler: (input, { principal }) => deleteTrack(input, { ...runtime, ...hooks, principal }) });
  registry.register({ contract: ReorderTracks, access: 'owner', handler: (input, { principal }) => reorderTracks(input, { ...runtime, ...hooks, principal }) });
}

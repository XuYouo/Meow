import type { z } from 'zod';
import { ReorderTracks } from '../../../../shared/contracts/music/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { advanceLibraryRevision, getLibraryRevision, orderedTrackIds, saveMusicOperation, setTrackPosition } from '../tables/tracks/table.js';
import { replayOperation } from '../utils/replayOperation.js';
import type { MusicDependencies } from '../utils/MusicDependencies.js';

export function plan(input: z.infer<typeof ReorderTracks.input>, dependencies: MusicDependencies) {
  assertOwner(dependencies);
  const inputJson = JSON.stringify(input);
  const replay = replayOperation(dependencies.db, input.operationId, 'reorder', inputJson);
  if (replay !== undefined) return ReorderTracks.output.parse(replay);
  const current = orderedTrackIds(dependencies.db);
  const revision = getLibraryRevision(dependencies.db);
  if (revision !== input.baseRevision) throw new AppError(409, 'MUSIC_CONFLICT', 'The music library changed on another client.', { current: { ids: current, revision } });
  if (new Set(input.ids).size !== input.ids.length || input.ids.length !== current.length || input.ids.some((id) => !current.includes(id))) {
    throw new AppError(400, 'INVALID_TRACK_ORDER', 'The order must contain every current track exactly once.');
  }
  input.ids.forEach((id, position) => setTrackPosition(dependencies.db, id, position));
  const result = { ids: input.ids, revision: advanceLibraryRevision(dependencies.db) };
  saveMusicOperation(dependencies.db, input.operationId, 'reorder', inputJson, result);
  return result;
}

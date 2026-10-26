import type { z } from 'zod';
import { CreateTrack, TrackSchema } from '../../../../shared/contracts/music/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { advanceLibraryRevision, findTrack, findTrackTombstone, insertTrack, nextTrackPosition, saveMusicOperation } from '../tables/tracks/table.js';
import { replayOperation } from '../utils/replayOperation.js';
import type { MusicDependencies } from '../utils/MusicDependencies.js';

export function plan(input: z.infer<typeof CreateTrack.input>, dependencies: MusicDependencies) {
  assertOwner(dependencies);
  const inputJson = JSON.stringify(input);
  const replay = replayOperation(dependencies.db, input.operationId, 'create', inputJson);
  if (replay !== undefined) return TrackSchema.parse(replay);
  if (findTrack(dependencies.db, input.id) || findTrackTombstone(dependencies.db, input.id)) throw new AppError(409, 'TRACK_EXISTS', 'This track ID already exists or was deleted.');
  insertTrack(dependencies.db, input.values, { id: input.id, position: nextTrackPosition(dependencies.db), at: dependencies.now() });
  advanceLibraryRevision(dependencies.db);
  const result = TrackSchema.parse(findTrack(dependencies.db, input.id));
  dependencies.onChanged?.(null, result);
  saveMusicOperation(dependencies.db, input.operationId, 'create', inputJson, result);
  return result;
}

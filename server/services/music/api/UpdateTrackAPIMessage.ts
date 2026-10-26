import type { z } from 'zod';
import { UpdateTrack, TrackSchema } from '../../../../shared/contracts/music/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { advanceLibraryRevision, findTrack, saveMusicOperation, updateTrack } from '../tables/tracks/table.js';
import { replayOperation } from '../utils/replayOperation.js';
import { currentTrack } from '../utils/currentTrack.js';
import type { MusicDependencies } from '../utils/MusicDependencies.js';

export function plan(input: z.infer<typeof UpdateTrack.input>, dependencies: MusicDependencies) {
  assertOwner(dependencies);
  const inputJson = JSON.stringify(input);
  const replay = replayOperation(dependencies.db, input.operationId, 'update', inputJson);
  if (replay !== undefined) return TrackSchema.parse(replay);
  const current = currentTrack(dependencies.db, input.id, input.baseRevision);
  updateTrack(dependencies.db, input.id, input.values, current.revision + 1, dependencies.now());
  advanceLibraryRevision(dependencies.db);
  const result = TrackSchema.parse(findTrack(dependencies.db, input.id));
  dependencies.onChanged?.(current, result);
  saveMusicOperation(dependencies.db, input.operationId, 'update', inputJson, result);
  return result;
}

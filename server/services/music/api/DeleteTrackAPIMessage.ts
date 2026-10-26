import type { z } from 'zod';
import { DeleteTrack, TrackDeletionSchema } from '../../../../shared/contracts/music/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { advanceLibraryRevision, removeTrack, saveMusicOperation } from '../tables/tracks/table.js';
import { replayOperation } from '../utils/replayOperation.js';
import { currentTrack } from '../utils/currentTrack.js';
import type { MusicDependencies } from '../utils/MusicDependencies.js';

export function plan(input: z.infer<typeof DeleteTrack.input>, dependencies: MusicDependencies) {
  assertOwner(dependencies);
  const inputJson = JSON.stringify(input);
  const replay = replayOperation(dependencies.db, input.operationId, 'delete', inputJson);
  if (replay !== undefined) return TrackDeletionSchema.parse(replay);
  const current = currentTrack(dependencies.db, input.id, input.baseRevision);
  const result = { id: current.id, revision: current.revision + 1, deletedAt: dependencies.now() };
  removeTrack(dependencies.db, result);
  advanceLibraryRevision(dependencies.db);
  dependencies.onChanged?.(current, null);
  saveMusicOperation(dependencies.db, input.operationId, 'delete', inputJson, result);
  return result;
}

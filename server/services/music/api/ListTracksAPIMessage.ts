import type { z } from 'zod';
import { ListTracks } from '../../../../shared/contracts/music/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { getLibraryRevision, listTracks } from '../tables/tracks/table.js';
import type { MusicDependencies } from '../utils/MusicDependencies.js';

export function plan(input: z.infer<typeof ListTracks.input>, dependencies: MusicDependencies) {
  assertOwner(dependencies);
  const result = listTracks(dependencies.db, input.offset, input.limit);
  return ListTracks.output.parse({ ...result, revision: getLibraryRevision(dependencies.db), nextOffset: input.offset + result.items.length < result.total ? input.offset + result.items.length : null });
}

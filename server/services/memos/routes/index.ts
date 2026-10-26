import type Database from 'better-sqlite3';
import { CreateMemo, ListMemos, GetMemo, UpdateMemo, DeleteMemo, SetMemoPin, SetMemoVisibility, GetMemoChanges } from '../../../../shared/contracts/memos/index.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import type { MemoDependencies } from '../utils/MemoDependencies.js';
import { plan as createMemo } from '../api/CreateMemoAPIMessage.js';
import { plan as listMemos } from '../api/ListMemosAPIMessage.js';
import { plan as getMemo } from '../api/GetMemoAPIMessage.js';
import { plan as updateMemo } from '../api/UpdateMemoAPIMessage.js';
import { plan as deleteMemo } from '../api/DeleteMemoAPIMessage.js';
import { plan as setMemoPin } from '../api/SetMemoPinAPIMessage.js';
import { plan as setMemoVisibility } from '../api/SetMemoVisibilityAPIMessage.js';
import { plan as getMemoChanges } from '../api/GetMemoChangesAPIMessage.js';

interface MemoRuntime { db: Database.Database; now: () => string }
export function registerMemosRoutes(registry: RouteRegistry, runtime: MemoRuntime, hooks: Pick<MemoDependencies,'onMemoChanged'> = {}): void {
  registry.register({ contract: GetMemoChanges,access: 'owner',handler: (input,{ principal }) => getMemoChanges(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: ListMemos,access: 'public',handler: (input,{ principal }) => listMemos(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: CreateMemo,access: 'owner',handler: (input,{ principal }) => createMemo(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: GetMemo,access: 'public',handler: (input,{ principal }) => getMemo(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: UpdateMemo,access: 'owner',handler: (input,{ principal }) => updateMemo(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: DeleteMemo,access: 'owner',handler: (input,{ principal }) => deleteMemo(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: SetMemoPin,access: 'owner',handler: (input,{ principal }) => setMemoPin(input,{ ...runtime,...hooks,principal }) });
  registry.register({ contract: SetMemoVisibility,access: 'owner',handler: (input,{ principal }) => setMemoVisibility(input,{ ...runtime,...hooks,principal }) });
}

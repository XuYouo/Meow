import type { z } from 'zod';
import { PreferencesSchema, UpdatePreferences } from '../../../../shared/contracts/preferences/index.js';
import { AppError } from '../../../system/errors/AppError.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { defaultPreferences } from '../utils/defaultPreferences.js';
import { readPreferenceOperation, readPreferences, savePreferenceOperation, savePreferences } from '../tables/preferences/table.js';
import type { PreferencesDependencies } from '../utils/PreferencesDependencies.js';

export function plan(input: z.infer<typeof UpdatePreferences.input>, dependencies: PreferencesDependencies) {
  assertOwner(dependencies);
  const inputJson = JSON.stringify(input);
  const receipt = readPreferenceOperation(dependencies.db, input.operationId);
  if (receipt) {
    if (receipt.input !== inputJson) throw new AppError(409, 'OPERATION_REUSED', 'This operation ID was already used with different input.');
    return receipt.output;
  }
  const current = PreferencesSchema.parse((readPreferences(dependencies.db) ?? defaultPreferences()));
  if (current.revision !== input.baseRevision) throw new AppError(409, 'PREFERENCES_CONFLICT', 'Preferences changed on another client.', { current });
  const result = PreferencesSchema.parse(savePreferences(dependencies.db, input.values, current.revision + 1, dependencies.now()));
  dependencies.onChanged?.(current, result);
  savePreferenceOperation(dependencies.db, input.operationId, inputJson, result);
  return result;
}

import { PreferencesSchema } from '../../../../shared/contracts/preferences/index.js';
import { plan as assertOwner } from '../../identity/api/AssertOwnerAPIMessage.js';
import { defaultPreferences } from '../utils/defaultPreferences.js';
import { readPreferences } from '../tables/preferences/table.js';
import type { PreferencesDependencies } from '../utils/PreferencesDependencies.js';

export function plan(dependencies: PreferencesDependencies) {
  assertOwner(dependencies);
  return PreferencesSchema.parse((readPreferences(dependencies.db) ?? defaultPreferences()));
}

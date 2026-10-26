import { PublicPreferencesSchema } from '../../../../shared/contracts/preferences/index.js';
import { defaultPreferences } from '../utils/defaultPreferences.js';
import { readPreferences } from '../tables/preferences/table.js';
import type { PreferencesDependencies } from '../utils/PreferencesDependencies.js';

export function plan(dependencies: Pick<PreferencesDependencies, 'db'>) {
  return PublicPreferencesSchema.strip().parse(readPreferences(dependencies.db) ?? defaultPreferences());
}

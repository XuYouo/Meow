import type { ApplicationRuntime } from '../../../app.js';
import type { RouteRegistry } from '../../../system/http/RouteRegistry.js';
import { GetPreferences, GetPublicPreferences, UpdatePreferences } from '../../../../shared/contracts/preferences/index.js';
import type { PreferencesDependencies } from '../utils/PreferencesDependencies.js';
import { plan as getPreferences } from '../api/GetPreferencesAPIMessage.js';
import { plan as getPublicPreferences } from '../api/GetPublicPreferencesAPIMessage.js';
import { plan as updatePreferences } from '../api/UpdatePreferencesAPIMessage.js';

export function registerPreferencesRoutes(registry: RouteRegistry, runtime: ApplicationRuntime, hooks: Pick<PreferencesDependencies, 'onChanged'> = {}): void {
  registry.register({ contract: GetPublicPreferences, access: 'public', handler: () => getPublicPreferences(runtime) });
  registry.register({ contract: GetPreferences, access: 'owner', handler: (_input, { principal }) => getPreferences({ ...runtime, ...hooks, principal }) });
  registry.register({ contract: UpdatePreferences, access: 'owner', handler: (input, { principal }) => updatePreferences(input, { ...runtime, ...hooks, principal }) });
}

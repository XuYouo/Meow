import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import { usePreferences } from '../settings/PreferencesProvider';
import { readDevicePreferences, saveDevicePreferences, subscribeDevicePreferences } from '../../system/storage/DevicePreferences';
import { PreferenceValuesSchema } from '../../../shared/contracts/preferences';

interface PresentationActions {
  instanceId: string;
  isAuthenticated: boolean;
  localOnly: boolean;
  canWrite: boolean;
  onLogin: () => void;
  onLogout: () => void;
  onSettings: () => void;
  onRefresh: () => Promise<void>;
  notify: (message: string) => void;
}
const Context = createContext<PresentationActions | null>(null);
export function PresentationProvider({ children, ...actions }: PresentationActions & { children: ReactNode }) { return <Context.Provider value={actions}>{children}</Context.Provider>; }
export function usePresentationActions() { const value = useContext(Context); if (!value) throw new Error('PresentationProvider is required'); return value; }
const colors: Record<string, string> = { pink: '#C75B83', blue: '#818CF8', green: '#10B981', purple: '#A78BFA', orange: '#FB923C' };

export function useTheme() {
  const { preferences, update } = usePreferences();
  const actions = usePresentationActions();
  const guestTheme = useSyncExternalStore((listener) => subscribeDevicePreferences(actions.instanceId, listener), () => readDevicePreferences(actions.instanceId).guestTheme);
  const effectiveTheme = actions.isAuthenticated ? preferences?.theme : guestTheme ?? preferences?.theme;
  const themeColor = preferences ? colors[preferences.accentColor] ?? preferences.accentColor : '#818CF8';
  const systemDark = useSyncExternalStore((listener) => {
    const query = window.matchMedia('(prefers-color-scheme: dark)'); query.addEventListener('change', listener);
    return () => query.removeEventListener('change', listener);
  }, () => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const darkMode = effectiveTheme === 'dark' || (effectiveTheme === 'system' && systemDark);
  async function toggleDarkMode() {
    try {
      const theme = darkMode ? 'light' as const : 'dark' as const;
      if (!actions.isAuthenticated) {
        saveDevicePreferences(actions.instanceId, { ...readDevicePreferences(actions.instanceId), guestTheme: theme });
        return;
      }
      if (!actions.canWrite) { actions.notify('此标签页只读，请在正在编辑的标签页修改外观。'); return; }
      if (!preferences || !('reviewTimezone' in preferences)) return;
      await update({ ...PreferenceValuesSchema.strip().parse(preferences), theme });
    } catch (error) { actions.notify(error instanceof Error ? error.message : '外观设置未能保存，请重试。'); }
  }
  return { themeColor, darkMode, toggleDarkMode, currentFont: preferences?.font.family === 'system' ? 'default' : preferences?.font.family ?? 'default' };
}

export function useSettings() {
  const { preferences } = usePreferences();
  const actions = usePresentationActions();
  const fontConfig = useMemo(() => ({ fontSize: preferences?.font.size ?? 16, selectedFont: preferences?.font.family === 'system' ? 'default' : preferences?.font.family ?? 'default' }), [preferences?.font]);
  const hitokotoConfig = useMemo(() => ({ enabled: preferences?.hitokotoEnabled ?? false, types: preferences?.hitokotoTypes ?? [] }), [preferences?.hitokotoEnabled, preferences?.hitokotoTypes]);
  return {
    fontConfig, hitokotoConfig,
    refreshPublicData: actions.onRefresh,
  };
}

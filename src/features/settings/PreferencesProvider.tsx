import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { PreferencesSchema, PublicPreferencesSchema, type PreferencesDTO, type PreferenceValues, type PublicPreferencesDTO, type PreferencesDTO as OwnerPreferences } from '../../../shared/contracts/preferences';
import { GetPreferencesAPI } from '../../apis/preferences/GetPreferencesAPI';
import { GetPublicPreferencesAPI } from '../../apis/preferences/GetPublicPreferencesAPI';
import { UpdatePreferencesAPI } from '../../apis/preferences/UpdatePreferencesAPI';
import type { Session } from '../../objects/identity/Session';
import { readDevicePreferences, subscribeDevicePreferences } from '../../system/storage/DevicePreferences';

interface PreferencesState { preferences: PreferencesDTO | PublicPreferencesDTO | null; error: string; loading: boolean; refresh: () => Promise<PreferencesDTO | PublicPreferencesDTO | undefined>; update: (values: PreferenceValues) => Promise<void> }
const PreferencesContext = createContext<PreferencesState | null>(null);
const accents = { pink: '#c75b83', blue: '#527fc0', green: '#548a71', purple: '#8c70b6', orange: '#bd824e' };
const fonts: Record<string,string> = { system: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif", serif: "Georgia, 'Songti SC', serif", mono: "'SFMono-Regular', Consolas, monospace" };
const fontURLs: Record<string,string> = { jinghua: 'https://pic.lover.nyc.mn/2025-07/songti_1753944378889.ttf', lxgw: 'https://pic.lover.nyc.mn/2025-07/LXGWWenKai-Regular_1753944392267.ttf', kongshan: 'https://pic.lover.nyc.mn/2025-07/kongshan_1753944354149.ttf' };

export function PreferencesProvider({ session, localOnly, children }: { session: Session; localOnly: boolean; children: ReactNode }) {
  const key = `meow:v2:${session.instanceId}:${session.principal}:preferences`;
  const [preferences, setPreferences] = useState<PreferencesDTO | PublicPreferencesDTO | null>(() => {
    try {
      const raw = localStorage.getItem(key);
      const schema = session.principal === 'owner' ? PreferencesSchema : PublicPreferencesSchema;
      const parsed = schema.safeParse(raw ? JSON.parse(raw) : null);
      return parsed.success ? parsed.data : null;
    } catch { return null; }
  });
  const currentPreferences = useRef(preferences);
  const mutations = useRef(Promise.resolve());
  const pending = useRef<{values:PreferenceValues;baseRevision:number;operationId:string}|null>(null);
  const [guestTheme, setGuestTheme] = useState(() => readDevicePreferences(session.instanceId).guestTheme);
  useEffect(() => subscribeDevicePreferences(session.instanceId, () => setGuestTheme(readDevicePreferences(session.instanceId).guestTheme)), [session.instanceId]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    if (localOnly) return;
    setLoading(true); setError('');
    try {
      const response = session.principal === 'owner' ? await GetPreferencesAPI({}) : await GetPublicPreferencesAPI({});
      currentPreferences.current = response; pending.current = null; setPreferences(response); localStorage.setItem(key, JSON.stringify(response)); return response;
    } catch (cause) { setError(cause instanceof Error ? cause.message : '外观设置读取失败。'); }
    finally { setLoading(false); }
  }, [key, localOnly, session.principal]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!preferences) return;
    const root = document.documentElement;
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = session.principal === 'anonymous' ? guestTheme ?? preferences.theme : preferences.theme;
      const dark = theme === 'dark' || (theme === 'system' && query.matches);
      root.classList.toggle('dark', dark);
    };
    apply(); query.addEventListener('change', apply);
    const color = /^#[a-fA-F0-9]{6}$/.test(preferences.accentColor) ? preferences.accentColor : accents[preferences.accentColor as keyof typeof accents];
    root.style.setProperty('--theme-color', color);
    document.title = preferences.title;
    const family = preferences.font.family;
    let fontStyle = document.getElementById('meow-v2-presentation-font');
    if (!fontStyle) { fontStyle = document.createElement('style'); fontStyle.id = 'meow-v2-presentation-font'; document.head.appendChild(fontStyle); }
    const fontURL = fontURLs[family];
    const fontName = fontURL ? `CustomFont-${family}` : fonts[family] ?? fonts.system;
    fontStyle.textContent = `${fontURL ? `@font-face { font-family: 'CustomFont-${family}'; src: url('${fontURL}') format('truetype'); font-display: swap; }` : ''}
      ${family !== 'system' ? `.custom-font-content, .custom-font-content * { font-family: ${fontURL ? `'${fontName}'` : fontName}, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif !important; }` : ''}
      .prose { font-size: ${preferences.font.size}px; }
      .theme-selection::selection { background-color: ${color}33; color: ${color}; }
      .theme-selection::-moz-selection { background-color: ${color}33; color: ${color}; }
    `;
    document.body.style.backgroundColor = '';
    document.body.style.backgroundImage = '';
    document.body.style.backgroundSize = '';
    document.body.style.backgroundAttachment = '';
    return () => query.removeEventListener('change', apply);
  }, [preferences, guestTheme, session.principal]);

  const update = useCallback((values: PreferenceValues): Promise<void> => {
    const operation = mutations.current.catch(() => undefined).then(async () => {
      const current = currentPreferences.current;
      if (localOnly || session.principal !== 'owner' || !current) throw new Error('请重新连接并验证身份后修改设置。');
      async function commit(input:{values:PreferenceValues;baseRevision:number;operationId:string}):Promise<OwnerPreferences> {
        pending.current=input;
        const response=await UpdatePreferencesAPI(input);
        pending.current=null;currentPreferences.current=response;setPreferences(response);
        try{localStorage.setItem(key,JSON.stringify(response));}catch{setError('设置已保存，但本机缓存无法更新。');}
        return response;
      }
      // Resolve an uncertain preceding write with its original operation before sending newer values.
      if(pending.current){
        const previous=pending.current;
        await commit(previous);
        if(JSON.stringify(previous.values)===JSON.stringify(values))return;
      }
      await commit({values,baseRevision:currentPreferences.current?.revision??current.revision,operationId:crypto.randomUUID()});
    });
    mutations.current = operation;
    return operation;
  }, [key, localOnly, session.principal]);
  return <PreferencesContext.Provider value={{ preferences, error, loading, refresh, update }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('PreferencesProvider is required');
  return value;
}

import { lazy, type ReactNode } from 'react';
import { CalendarCheck, Settings2 } from 'lucide-react';

import type { Session } from '../../objects/identity/Session';
import type { WorkspaceExtension, WorkspaceExtensionProps } from '../../pages/Index/index';
import MusicPlayer from '../music/MusicPlayer';
import { MusicProvider } from '../music/MusicProvider';
import { PreferencesProvider, usePreferences } from '../settings/PreferencesProvider';
import { Toaster } from '../presentation/ui/sonner';

const ReviewPanel = lazy(() => import('../review/ReviewPanel'));
const SettingsPanel = lazy(() => import('../settings/SettingsPanel'));
const MusicSearchCard = lazy(() => import('../music/MusicSearchCard'));

export const workspaceExtensions: WorkspaceExtension[] = [
  { id: 'review', label: '每日回顾', icon: <CalendarCheck size={18} />, ownerOnly: true, render: (props) => <ReviewPanel {...props} /> },
  { id: 'settings', label: '工作区设置', icon: <Settings2 size={18} />, ownerOnly: true, render: (props) => <SettingsPanel {...props} /> },
];

export function WorkspaceFeatureProvider({ session, localOnly, children }: { session: Session; localOnly: boolean; children: ReactNode }) {
  return <PreferencesProvider session={session} localOnly={localOnly}><MusicProvider session={session} localOnly={localOnly}>{children}</MusicProvider></PreferencesProvider>;
}

export function WorkspacePersistentTools({ session, localOnly, canWrite, musicSearchQuery, onCloseMusicSearch }: WorkspaceExtensionProps) {
  const { preferences } = usePreferences();
  const enabled = preferences && 'musicEnabled' in preferences && preferences.musicEnabled;
  return <><Toaster />{session.principal === 'owner' && <>{enabled && <MusicPlayer canWrite={canWrite} localOnly={localOnly} />}{musicSearchQuery !== null && musicSearchQuery !== undefined && <MusicSearchCard key={musicSearchQuery} open keyword={musicSearchQuery} localOnly={localOnly} canWrite={canWrite} onClose={() => onCloseMusicSearch?.()} />}</>}</>;
}

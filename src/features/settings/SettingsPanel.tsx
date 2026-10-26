import { usePreferences } from './PreferencesProvider';
import SettingsCard from './SettingsCard';
import {PreferenceValuesSchema} from '../../../shared/contracts/preferences';
import type { WorkspaceExtensionProps } from '../../pages/Index/index';

export default function SettingsPanel(props:WorkspaceExtensionProps) {
  const {preferences,error,loading,refresh}=usePreferences();
  if(props.isOpen===false)return null;
  if(preferences&&'reviewTimezone' in preferences)return <SettingsCard {...props} initial={PreferenceValuesSchema.strip().parse(preferences)}/>;
  return <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4' role='dialog' aria-modal='true' aria-label='设置'><div className='w-full max-w-lg rounded-lg bg-white dark:bg-gray-800 p-6 shadow-xl'><h2 className='text-lg font-semibold mb-4'>设置</h2><p role={error?'alert':'status'} className='text-sm text-gray-500'>{error|| (loading?'正在读取设置…':'设置暂时不可用。')}</p><div className='flex justify-end gap-3 mt-4'><button type='button' className='text-sm' onClick={()=>props.onClose?.()}>关闭</button><button type='button' className='text-sm' disabled={loading||props.localOnly} onClick={()=>void refresh()}>重试</button></div></div></div>;
}

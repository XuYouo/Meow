import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { LoginAPI } from '../../apis/identity/LoginAPI';
import { ReadMediaAPI } from '../../apis/media/ReadMediaAPI';
import { GetPublicPreferencesAPI } from '../../apis/preferences/GetPublicPreferencesAPI';
import { Button } from '../../features/presentation/ui/button';
import { Input } from '../../features/presentation/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../features/presentation/ui/dialog';

export interface LoginProps { onAuthenticated:()=>Promise<void>;onCancel:()=>void }
const defaultBackground='https://s3.bmp.ovh/imgs/2025/08/06/a45ae94d48c17ed0.png';
function LoginForm({onAuthenticated,dialog=false}:Pick<LoginProps,'onAuthenticated'>&{dialog?:boolean}) {
  const [password,setPassword]=useState(''),[showPassword,setShowPassword]=useState(false),[isLoading,setIsLoading]=useState(false),[error,setError]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>) {event.preventDefault();if(isLoading)return;if(!password){setError('请输入密码');return;}setIsLoading(true);setError('');try {await LoginAPI(password);setPassword('');await onAuthenticated();}catch(cause){setError(cause instanceof Error?cause.message:'登录时发生错误');}finally{setIsLoading(false);}}
  return <form onSubmit={(event)=>void submit(event)} className={dialog?'space-y-4':'space-y-6'}>
    <div><label htmlFor={dialog?'dialog-password':'password'} className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>密码</label><div className='relative'>
      <Input id={dialog?'dialog-password':'password'} type={showPassword?'text':'password'} value={password} autoComplete='current-password' autoFocus onChange={(event)=>setPassword(event.target.value)} placeholder='请输入密码' className={`w-full pr-12 ${dialog?'':'bg-white/70 dark:bg-gray-800/70 border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400'}`} disabled={isLoading}/>
      <button type='button' aria-label={showPassword?'隐藏密码':'显示密码'} onClick={()=>setShowPassword((value)=>!value)} className='absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200' disabled={isLoading}>{showPassword?<EyeOff className={dialog?'h-4 w-4':'h-5 w-5'}/>:<Eye className={dialog?'h-4 w-4':'h-5 w-5'}/>}</button>
    </div></div>
    {error&&<div role='alert' className='p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg'><p className='text-sm text-red-600 dark:text-red-400'>{error}</p></div>}
    <Button type='submit' className={`w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-medium ${dialog?'py-2':'py-3 transform hover:scale-[1.02] disabled:transform-none'} rounded-lg transition-all duration-200 disabled:opacity-50`} disabled={isLoading||!password}>{isLoading?<div className='flex items-center justify-center'><div className={`${dialog?'w-4 h-4':'w-5 h-5'} border-2 border-white/30 border-t-white rounded-full animate-spin mr-2`}/>登录中...</div>:'登录'}</Button>
  </form>;
}
export function LoginDialog({open,onAuthenticated,onCancel}:LoginProps&{open:boolean}) {
  return <Dialog open={open} onOpenChange={(next)=>{if(!next)onCancel();}}><DialogContent className='sm:max-w-md'><DialogHeader><div className='flex items-center justify-center mb-4'><div className='inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full'><Lock className='w-6 h-6 text-white'/></div></div><DialogTitle className='text-center text-xl font-bold'>登录以访问全部功能</DialogTitle><DialogDescription className='sr-only'>输入工作区密码以建立会话。</DialogDescription></DialogHeader><LoginForm key={String(open)} onAuthenticated={onAuthenticated} dialog/><div className='text-center mt-4'><p className='text-xs text-gray-500 dark:text-gray-400'>当前处于公开博客模式，登录后可使用全部功能</p></div></DialogContent></Dialog>;
}
export default function Login({onAuthenticated,onCancel}:LoginProps) {
  const [background,setBackground]=useState(defaultBackground);
  useEffect(()=>{const controller=new AbortController();void GetPublicPreferencesAPI({},controller.signal).then((preferences)=>{if(preferences.background.mode==='image'&&preferences.background.mediaId)setBackground(ReadMediaAPI(preferences.background.mediaId));}).catch(()=>undefined);return ()=>controller.abort();},[]);
  return <div className='min-h-screen flex items-center justify-center bg-cover bg-center bg-no-repeat relative' style={{backgroundImage:`url(${background})`}}><div className='absolute inset-0 bg-black/30'/><div className='relative z-10 w-full max-w-md p-8'><div className='bg-white/90 dark:bg-gray-900/90 backdrop-blur-md rounded-2xl shadow-2xl p-8 border border-white/20'><div className='text-center mb-8'><div className='inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-4'><Lock className='w-8 h-8 text-white'/></div><h1 className='text-2xl font-bold text-gray-900 dark:text-white mb-2'>欢迎回来</h1><p className='text-gray-600 dark:text-gray-400'>请输入密码以访问应用</p></div><LoginForm onAuthenticated={onAuthenticated}/><div className='mt-8 text-center'><p className='text-xs text-gray-500 dark:text-gray-400'>会话设有有效期，退出登录后立即撤销。</p><button type='button' onClick={onCancel} className='text-xs mt-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'>返回公开笔记</button></div></div></div></div>;
}

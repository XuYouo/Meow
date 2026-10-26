import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { PenTool, RefreshCw } from 'lucide-react';

import { GetSessionAPI } from './apis/identity/GetSessionAPI';
import { LogoutAPI } from './apis/identity/LogoutAPI';
import type { Session } from './objects/identity/Session';
import { ApiError } from './system/api/sendAPI';
import { subscribeSessionExpired } from './system/api/sessionEvents';
import { forgetVerifiedTabSession, readVerifiedTabSession, rememberVerifiedTabSession } from './system/storage/VerifiedTabSession';
import Index from './pages/Index/index.js';
import Login, { LoginDialog } from './pages/Login/index.js';
import { WorkspaceFeatureProvider, WorkspacePersistentTools, workspaceExtensions } from './features/workspace/WorkspaceFeatureProvider.js';
import { FeatureBoundary } from './features/workspace/FeatureBoundary';

const CanvasFeature = lazy(() => import('./features/canvas/index.js'));

const extensions = [
  { id: 'canvas', label: '画布', icon: <PenTool size={18} />, ownerOnly: true, render: (props: Parameters<typeof CanvasFeature>[0]) => <CanvasFeature {...props} /> },
  ...workspaceExtensions,
];

type SessionState = { status: 'loading' } | { status: 'ready'; session: Session; localOnly: boolean } | { status: 'error'; message: string };

export default function App() {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const [loginOpen, setLoginOpen] = useState(window.location.pathname === '/login');
  const [logoutError, setLogoutError] = useState('');
  const [standaloneLogin,setStandaloneLogin] = useState(window.location.pathname === '/login');
  const refreshSession = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const session = await GetSessionAPI();
      rememberVerifiedTabSession(sessionStorage, session);
      setState({ status: 'ready', session, localOnly: false });
      if (window.location.pathname !== '/login' || session.authenticated) setLoginOpen(false);
      if (session.authenticated && window.location.pathname === '/login') { window.history.replaceState(null,'','/'); setStandaloneLogin(false); }
    } catch (error) {
      const previous = readVerifiedTabSession(sessionStorage);
      if (error instanceof ApiError && error.status === 0 && previous) {
        setState({ status: 'ready', session: previous, localOnly: true });
        return;
      }
      if (error instanceof ApiError && error.status === 401) forgetVerifiedTabSession(sessionStorage);
      setState({ status: 'error', message: error instanceof Error ? error.message : '无法确认会话，请重试。' });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
    const online = () => void refreshSession();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [refreshSession]);
  useEffect(() => subscribeSessionExpired(() => {
    forgetVerifiedTabSession(sessionStorage);
    setState((previous) => previous.status === 'ready' ? { status: 'ready', session: { ...previous.session, authenticated: false, principal: 'anonymous' }, localOnly: false } : previous);
    setLoginOpen(true);
  }), []);

  async function logout() {
    setLogoutError('');
    forgetVerifiedTabSession(sessionStorage);
    // Hide owner content immediately, including when the logout request is slow.
    setState({ status: 'loading' });
    try { await LogoutAPI(); await refreshSession(); } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : '退出未确认，请重试。' });
      setLogoutError('退出尚未得到服务器确认。私有内容已隐藏，待提交内容保留在该工作区的隔离缓存中。');
    }
  }

  const closeLogin=() => {setLoginOpen(false);if(standaloneLogin){window.history.replaceState(null,'','/');setStandaloneLogin(false);}};
  if (standaloneLogin && loginOpen) return <Login onAuthenticated={refreshSession} onCancel={closeLogin} />;
  if (state.status === 'loading') return <main className='min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6' aria-busy='true'><div className='flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400'><RefreshCw className='w-5 h-5 animate-spin'/>正在确认工作区会话…</div></main>;
  if (state.status === 'error') return <main className='min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6'><div className='w-full max-w-md p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center space-y-4'><h1 className='text-xl font-semibold'>暂时无法连接工作区</h1><p className='text-sm text-gray-500 dark:text-gray-400'>{state.message}</p>{logoutError && <p className='text-sm text-red-500'>{logoutError}</p>}<button className='inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm' style={{backgroundColor:'var(--theme-color, #818CF8)'}} onClick={() => void refreshSession()}><RefreshCw size={16} />重试</button></div></main>;
  return <WorkspaceFeatureProvider key={`${state.session.instanceId}:${state.session.principal}:${state.localOnly}`} session={state.session} localOnly={state.localOnly}><FeatureBoundary><Suspense fallback={<main className='min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center text-sm text-gray-500' role='status'>正在加载功能…</main>}><Index extensions={extensions} persistentTools={(props) => <WorkspacePersistentTools {...props} />} session={state.session} localOnly={state.localOnly} onReconnect={() => void refreshSession()} onLogin={() => setLoginOpen(true)} onLogout={() => void logout()} onSessionExpired={() => {
    forgetVerifiedTabSession(sessionStorage);
    setState({ status: 'ready', session: { ...state.session, authenticated: false, principal: 'anonymous' }, localOnly: false });
    setLoginOpen(true);
  }} /></Suspense></FeatureBoundary><LoginDialog open={loginOpen} onAuthenticated={refreshSession} onCancel={closeLogin}/></WorkspaceFeatureProvider>;
}

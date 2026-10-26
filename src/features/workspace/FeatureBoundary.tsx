import { Component, type ReactNode } from 'react';

/** React 18 requires a class for a render/import error boundary. */
export class FeatureBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main className='min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6'><div className='w-full max-w-md p-8 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center space-y-4'><h1 className='text-xl font-semibold'>功能暂时无法加载</h1><p className='text-sm text-gray-500 dark:text-gray-400'>请重新加载后重试。已经保存的本机草稿和待提交内容会保留。</p><button className='button' onClick={() => window.location.reload()}>重新加载</button></div></main>;
  }
}

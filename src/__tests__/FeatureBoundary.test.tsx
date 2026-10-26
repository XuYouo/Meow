// @vitest-environment jsdom
import { lazy, Suspense } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { FeatureBoundary } from '../features/workspace/FeatureBoundary';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('gives a recovery action when a deferred module fails without exposing its internal error', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const message = 'synthetic internal module location';
  const expectedError = (event: ErrorEvent) => { if (event.error instanceof Error && event.error.message === message) event.preventDefault(); };
  window.addEventListener('error', expectedError);
  try {
    const Unavailable = lazy(async () => { throw new Error(message); });
    render(<FeatureBoundary><Suspense fallback={<p>加载中</p>}><Unavailable /></Suspense></FeatureBoundary>);
    expect(await screen.findByText('功能暂时无法加载')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    expect(screen.queryByText(message)).toBeNull();
  } finally { window.removeEventListener('error', expectedError); }
});

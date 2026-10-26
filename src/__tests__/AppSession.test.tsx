// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../system/api/sendAPI';
import { readVerifiedTabSession, rememberVerifiedTabSession } from '../system/storage/VerifiedTabSession';

const mock = vi.hoisted(() => ({ session: vi.fn(), logout: vi.fn() }));
vi.mock('../apis/identity/GetSessionAPI', () => ({ GetSessionAPI: mock.session }));
vi.mock('../apis/identity/LogoutAPI', () => ({ LogoutAPI: mock.logout }));
vi.mock('../features/workspace/WorkspaceFeatureProvider.js', () => ({ WorkspaceFeatureProvider: ({ children }: { children: React.ReactNode }) => children, workspaceExtensions: [], WorkspacePersistentTools: () => null }));
vi.mock('../pages/Index/index.js', () => ({ default: (props: { session: { principal: string }; localOnly: boolean; onLogout: () => void; onSessionExpired: () => void; onLogin:()=>void }) => <div><p>{`${props.session.principal}:${props.localOnly ? 'local-only' : 'verified'}`}</p><button onClick={props.onLogin}>login-test</button><button onClick={props.onLogout}>logout-test</button><button onClick={props.onSessionExpired}>expire-test</button></div> }));

import App from '../App.js';

const owner = { authenticated: true, principal: 'owner' as const, instanceId: 'd5ae11e1-672f-4d04-9d4f-66c545d0dbfe' };

beforeEach(() => { sessionStorage.clear(); localStorage.clear(); mock.session.mockReset(); mock.logout.mockReset(); history.replaceState(null, '', '/'); });
afterEach(cleanup);

describe('session and offline boundaries', () => {
  it('restores same-tab local work after a network-only failure and revalidates before network use', async () => {
    rememberVerifiedTabSession(sessionStorage, owner);
    mock.session.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'offline')).mockResolvedValue(owner);
    render(<App />);
    expect(await screen.findByText('owner:local-only')).toBeTruthy();
    fireEvent(window, new Event('online'));
    expect(await screen.findByText('owner:verified')).toBeTruthy();
  });

  it('does not restore private caches in a new tab or treat server errors as owner sessions', async () => {
    mock.session.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    const first = render(<App />);
    expect(await screen.findByText('暂时无法连接工作区')).toBeTruthy();
    expect(screen.queryByText('owner:local-only')).toBeNull();
    first.unmount();
    rememberVerifiedTabSession(sessionStorage, owner);
    mock.session.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'server error'));
    render(<App />);
    expect(await screen.findByText('暂时无法连接工作区')).toBeTruthy();
    expect(screen.queryByText('owner:local-only')).toBeNull();
  });

  it('opens the original login dialog above the public homepage instead of replacing the page', async () => {
    mock.session.mockResolvedValue({...owner,authenticated:false,principal:'anonymous'});
    render(<App/>);await screen.findByText('anonymous:verified');
    fireEvent.click(screen.getByText('login-test'));
    expect(screen.getByRole('dialog',{name:'登录以访问全部功能'})).toBeTruthy();
    expect(screen.getByText('anonymous:verified')).toBeTruthy();
    fireEvent.click(screen.getByText('Close'));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText('anonymous:verified')).toBeTruthy();
  });

  it('forgets local unlock immediately on unauthorized responses and logout failure', async () => {
    rememberVerifiedTabSession(sessionStorage, owner);
    mock.session.mockRejectedValueOnce(new ApiError(401, 'UNAUTHORIZED', 'expired'));
    const first = render(<App />);
    await screen.findByText('暂时无法连接工作区');
    expect(readVerifiedTabSession(sessionStorage)).toBeNull();
    first.unmount();
    mock.session.mockResolvedValue(owner);
    mock.logout.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'offline'));
    render(<App />);
    await screen.findByText('owner:verified');
    fireEvent.click(screen.getByText('logout-test'));
    expect(readVerifiedTabSession(sessionStorage)).toBeNull();
    await waitFor(() => expect(screen.queryByText('owner:verified')).toBeNull());
    await screen.findByText('暂时无法连接工作区');
  });
});
